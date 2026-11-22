import { ingestQuery } from "../db.js";
import { buildNotificationMessage } from "./notification-content.js";
import { sendSmtpEmail } from "./smtp.js";
import { buildSignedWebhookHeaders } from "./webhook-signature.js";
import { ALERT_SCOPES_REVUE } from "../alert-scope.js";
import { evenementPublicSql } from "../security/tlp.js";

export const MAX_ATTEMPTS = 10;
/** Limite par passage pour ne jamais bloquer la collecte. */
const BATCH_LIMIT = 50;

export interface DeliveryConfig {
  webhookUrl?: string;
  /** Secret partagé qui signe le corps exact de chaque webhook (HMAC-SHA256). */
  webhookSecret?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  /** Base publique du front pour construire un lien d'alerte (optionnel). */
  webBaseUrl?: string;
  /** Canal e-mail : un relais SMTP local suffit, aucun fournisseur payant. */
  emailHost?: string;
  emailPort?: number;
  emailFrom?: string;
  emailTo?: string;
  emailUser?: string;
  emailPassword?: string;
  emailSecure?: boolean;
}

export interface DeliveryAlert {
  id: number;
  title: string;
  severity: number;
  status: string;
  created_at: Date | string;
  attempts: number;
  webhook_delivered_at: Date | string | null;
  telegram_delivered_at: Date | string | null;
  email_delivered_at: Date | string | null;
  org_name: string | null;
  org_dept: string | null;
  org_kind: string | null;
  source_name: string | null;
  event_title: string | null;
  source_url: string | null;
  /** Guichet national d'orientation (collectivités victimes). */
  url_orientation: string | null;
  actions: string[] | null;
  lien_verifie_le: Date | string | null;
}

export interface DeliveryMessage {
  alertId: number;
  subject: string;
  text: string;
  payload: Record<string, unknown>;
}

export interface DeliveryResult {
  attempted: number;
  delivered: number;
  failed: number;
  abandoned: number;
  skipped: boolean;
}

/** Lit la configuration depuis l'environnement. Aucune valeur par défaut sensible. */
export function readDeliveryConfig(env: NodeJS.ProcessEnv = process.env): DeliveryConfig {
  const webhookUrl = env.RADAR_ALERT_WEBHOOK_URL?.trim() || undefined;
  const webhookSecret = env.RADAR_ALERT_WEBHOOK_SECRET?.trim() || undefined;
  const telegramBotToken = env.RADAR_ALERT_TELEGRAM_BOT_TOKEN?.trim() || undefined;
  const telegramChatId = env.RADAR_ALERT_TELEGRAM_CHAT_ID?.trim() || undefined;
  const webBaseUrl = env.RADAR_WEB_BASE_URL?.trim().replace(/\/+$/, "") || undefined;
  const emailHost = env.RADAR_ALERT_EMAIL_HOST?.trim() || undefined;
  const emailPortRaw = Number(env.RADAR_ALERT_EMAIL_PORT ?? 25);
  const emailPort = Number.isInteger(emailPortRaw) && emailPortRaw > 0 && emailPortRaw <= 65535 ? emailPortRaw : 25;
  const emailFrom = env.RADAR_ALERT_EMAIL_FROM?.trim() || undefined;
  const emailTo = env.RADAR_ALERT_EMAIL_TO?.trim() || undefined;
  const emailUser = env.RADAR_ALERT_EMAIL_USER?.trim() || undefined;
  const emailPassword = env.RADAR_ALERT_EMAIL_PASSWORD?.trim() || undefined;
  const emailSecure = env.RADAR_ALERT_EMAIL_SECURE?.trim().toLowerCase() === "true";
  return {
    webhookUrl, webhookSecret, telegramBotToken, telegramChatId, webBaseUrl,
    emailHost, emailPort, emailFrom, emailTo, emailUser, emailPassword, emailSecure,
  };
}

/** True quand une destination e-mail et un hôte SMTP sont configurés. */
export function isEmailConfigured(cfg: DeliveryConfig): boolean {
  return Boolean(cfg.emailHost && cfg.emailFrom && cfg.emailTo);
}

/** True si au moins un canal est configuré. */
export function isDeliveryConfigured(cfg: DeliveryConfig = readDeliveryConfig()): boolean {
  return Boolean(
    cfg.webhookUrl ||
    (cfg.telegramBotToken && cfg.telegramChatId) ||
    isEmailConfigured(cfg),
  );
}

const SELECT_PENDING = `
SELECT
  a.id,
  a.title,
  a.severity,
  a.status,
  a.created_at,
  a.attempts,
  a.webhook_delivered_at,
  a.telegram_delivered_at,
  (to_jsonb(a) ->> 'email_delivered_at')::timestamptz AS email_delivered_at,
  o.name AS org_name,
  o.dept AS org_dept,
  o.kind AS org_kind,
  s.name AS source_name,
  e.title AS event_title,
  COALESCE(e.source_url, s.url) AS source_url,
  a.url_orientation,
  a.actions,
  a.lien_verifie_le
FROM alert a
LEFT JOIN event e ON e.id = a.event_id
LEFT JOIN org o ON o.id = a.org_id
LEFT JOIN source s ON s.id = e.source_id
WHERE a.delivered_at IS NULL
  AND a.attempts < $1
  AND (a.next_attempt_at IS NULL OR a.next_attempt_at <= now())
  AND a.scope <> ALL($3::text[])
  AND ${evenementPublicSql("e")}
ORDER BY a.created_at ASC, a.id ASC
LIMIT $2`;

export async function fetchPendingAlerts(limit = BATCH_LIMIT): Promise<DeliveryAlert[]> {
  const r = await ingestQuery<DeliveryAlert>(SELECT_PENDING, [MAX_ATTEMPTS, limit, [...ALERT_SCOPES_REVUE]]);
  return r.rows;
}

function fmtDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

type OrientationDiffusee = {
  url: string;
  actions: string[];
  verifie_le: string | null;
  dispositif: "national";
};

/**
 * Bloc d'orientation joint à une alerte de collectivité. 17Cyber est un
 * dispositif NATIONAL : `dispositif` le dit explicitement pour qu'aucun
 * consommateur ne le présente comme une source ou un guichet local.
 */
function orientationDiffusee(alert: DeliveryAlert): OrientationDiffusee | null {
  const url = alert.url_orientation?.trim();
  if (alert.org_kind !== "collectivite" || !url) return null;
  return {
    url,
    actions: Array.isArray(alert.actions) ? alert.actions : [],
    verifie_le: alert.lien_verifie_le ? fmtDate(alert.lien_verifie_le) : null,
    dispositif: "national",
  };
}

/** Construit un message lisible et une charge JSON pour un canal externe. */
export function buildDeliveryMessage(alert: DeliveryAlert, cfg: DeliveryConfig = readDeliveryConfig()): DeliveryMessage {
  // Le contenu de base ne lit que des champs structurés et assainit les
  // libellés : un titre d'alerte ou d'événement peut nommer une victime.
  const base = buildNotificationMessage(alert, cfg.webBaseUrl);
  const orientation = orientationDiffusee(alert);
  const lines = [base.text];
  if (orientation) {
    lines.push("", "Réflexe collectivité — 17Cyber (dispositif national) :");
    orientation.actions.forEach((action, i) => lines.push(`${i + 1}) ${action}`));
    lines.push(`Demande d'aide : ${orientation.url}`);
    if (orientation.verifie_le) lines.push(`Lien vérifié le ${orientation.verifie_le} (HTTP 200)`);
  }

  const payload = {
    ...base.payload,
    alert: { ...(base.payload.alert as Record<string, unknown>), orientation },
  };

  return { alertId: base.alertId, subject: base.subject, text: lines.join("\n"), payload };
}

async function sendWebhook(url: string, payload: Record<string, unknown>, secret: string): Promise<void> {
  // Le corps est sérialisé une seule fois : la signature porte sur les octets
  // réellement envoyés, pas sur une seconde sérialisation.
  const rawBody = JSON.stringify(payload);
  const res = await fetch(url, {
    method: "POST",
    headers: buildSignedWebhookHeaders(secret, rawBody),
    body: rawBody,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`webhook HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`telegram HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  // Telegram peut répondre 200 avec ok=false.
  const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (json && json.ok === false) {
    throw new Error(`telegram: ${json.description ?? "réponse invalide"}`);
  }
}

function truncateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 1000);
}

/** Délai de reprise exponentiel (1, 2, 4… min, plafonné à 60 min). */
function backoffDelayMs(attempts: number): number {
  const minutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
  return minutes * 60 * 1000;
}

async function markDelivered(id: number): Promise<void> {
  await ingestQuery(
    `UPDATE alert
     SET delivered_at = now(), attempts = attempts + 1, last_error = NULL, next_attempt_at = NULL, updated_at = now()
     WHERE id = $1`,
    [id],
  );
}

async function markChannelDelivered(
  id: number,
  channel: "webhook" | "telegram" | "email",
): Promise<void> {
  const column =
    channel === "webhook"
      ? "webhook_delivered_at"
      : channel === "telegram"
        ? "telegram_delivered_at"
        : "email_delivered_at";
  await ingestQuery(
    `UPDATE alert SET ${column} = now(), updated_at = now() WHERE id = $1`,
    [id],
  );
}

async function markFailed(id: number, attemptsBefore: number, error: string): Promise<{ abandoned: boolean }> {
  const attempts = attemptsBefore + 1;
  const abandoned = attempts >= MAX_ATTEMPTS;
  const next = abandoned ? null : new Date(Date.now() + backoffDelayMs(attempts)).toISOString();
  await ingestQuery(
    `UPDATE alert
     SET attempts = $2, last_error = $3, next_attempt_at = $4, updated_at = now()
     WHERE id = $1`,
    [id, attempts, error, next],
  );
  return { abandoned };
}

/**
 * Diffuse un lot d'alertes en attente vers les canaux configurés.
 * Ne lève jamais : un échec réseau est enregistré sur l'alerte, jamais propagé.
 */
export async function deliverPendingAlerts(
  log: (msg: string) => void = () => undefined,
  opts?: { cfg?: DeliveryConfig; limit?: number },
): Promise<DeliveryResult> {
  const cfg = opts?.cfg ?? readDeliveryConfig();
  if (!isDeliveryConfigured(cfg)) {
    return { attempted: 0, delivered: 0, failed: 0, abandoned: 0, skipped: true };
  }

  let alerts: DeliveryAlert[] = [];
  try {
    alerts = await fetchPendingAlerts(opts?.limit ?? BATCH_LIMIT);
  } catch (err) {
    log(`diffusion alertes : lecture impossible (${truncateError(err)})`);
    return { attempted: 0, delivered: 0, failed: 0, abandoned: 0, skipped: false };
  }

  const result: DeliveryResult = { attempted: 0, delivered: 0, failed: 0, abandoned: 0, skipped: false };
  for (const alert of alerts) {
    result.attempted++;
    const msg = buildDeliveryMessage(alert, cfg);
    try {
      let webhookOk = Boolean(alert.webhook_delivered_at);
      let telegramOk = Boolean(alert.telegram_delivered_at);
      let emailOk = Boolean(alert.email_delivered_at);
      if (cfg.webhookUrl && !cfg.webhookSecret) {
        throw new Error("signing secret is not configured");
      }
      if (cfg.webhookUrl && !webhookOk) {
        await sendWebhook(cfg.webhookUrl, msg.payload, cfg.webhookSecret ?? "");
        webhookOk = true;
        await markChannelDelivered(alert.id, "webhook");
      }
      if (cfg.telegramBotToken && cfg.telegramChatId && !telegramOk) {
        await sendTelegram(cfg.telegramBotToken, cfg.telegramChatId, msg.text);
        telegramOk = true;
        await markChannelDelivered(alert.id, "telegram");
      }
      if (isEmailConfigured(cfg) && !emailOk) {
        await sendSmtpEmail(
          {
            host: cfg.emailHost as string,
            port: cfg.emailPort ?? 25,
            from: cfg.emailFrom as string,
            to: cfg.emailTo as string,
            user: cfg.emailUser,
            password: cfg.emailPassword,
            secure: cfg.emailSecure,
          },
          msg.subject,
          msg.text,
        );
        emailOk = true;
        await markChannelDelivered(alert.id, "email");
      }
      const allOk =
        (cfg.webhookUrl ? webhookOk : true) &&
        (cfg.telegramBotToken && cfg.telegramChatId ? telegramOk : true) &&
        (isEmailConfigured(cfg) ? emailOk : true);
      if (allOk) {
        await markDelivered(alert.id);
        result.delivered++;
      } else {
        result.failed++;
      }
    } catch (err) {
      const error = truncateError(err);
      try {
        const { abandoned } = await markFailed(alert.id, alert.attempts, error);
        result.failed++;
        if (abandoned) {
          result.abandoned++;
          log(`diffusion alerte #${alert.id} abandonnée après ${MAX_ATTEMPTS} tentatives : ${error}`);
        }
      } catch (dbErr) {
        // Ne jamais interrompre la boucle ni la collecte.
        result.failed++;
        log(`diffusion alerte #${alert.id} : échec envoi et marquage (${error} / ${truncateError(dbErr)})`);
      }
    }
  }

  if (result.attempted > 0) {
    log(
      `diffusion alertes : ${result.delivered} diffusée(s), ${result.failed} échec(s), ${result.abandoned} abandonnée(s) sur ${result.attempted}`,
    );
  }
  return result;
}

/** Dry-run : sélectionne des alertes et renvoie les messages sans envoyer ni modifier la base. */
export async function previewAlertDeliveries(
  limit = 3,
  cfg: DeliveryConfig = readDeliveryConfig(),
): Promise<DeliveryMessage[]> {
  const alerts = await fetchPendingAlerts(limit);
  return alerts.map((a) => buildDeliveryMessage(a, cfg));
}
