import { ingestQuery } from "../db.js";
import { ALERT_SCOPES_REVUE } from "../alert-scope.js";

export const MAX_ATTEMPTS = 10;
/** Limite par passage pour ne jamais bloquer la collecte. */
const BATCH_LIMIT = 50;

export interface DeliveryConfig {
  webhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  /** Base publique du front pour construire un lien d'alerte (optionnel). */
  webBaseUrl?: string;
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
  org_name: string | null;
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
  const telegramBotToken = env.RADAR_ALERT_TELEGRAM_BOT_TOKEN?.trim() || undefined;
  const telegramChatId = env.RADAR_ALERT_TELEGRAM_CHAT_ID?.trim() || undefined;
  const webBaseUrl = env.RADAR_WEB_BASE_URL?.trim().replace(/\/+$/, "") || undefined;
  return { webhookUrl, telegramBotToken, telegramChatId, webBaseUrl };
}

/** True si au moins un canal est configuré. */
export function isDeliveryConfigured(cfg: DeliveryConfig = readDeliveryConfig()): boolean {
  return Boolean(cfg.webhookUrl || (cfg.telegramBotToken && cfg.telegramChatId));
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
  o.name AS org_name,
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
  -- Une alerte déjà traitée ne se diffuse jamais : les doublons acquittés par
  -- la politique de fatigue (db/migrate-201-alert-fatigue.sql) ne doivent pas
  -- partir sur un canal après coup.
  AND a.status = 'open'
ORDER BY a.created_at ASC, a.id ASC
LIMIT $2`;

export async function fetchPendingAlerts(limit = BATCH_LIMIT): Promise<DeliveryAlert[]> {
  const r = await ingestQuery<DeliveryAlert>(SELECT_PENDING, [MAX_ATTEMPTS, limit, [...ALERT_SCOPES_REVUE]]);
  return r.rows;
}

function severityLabel(severity: number): string {
  const labels: Record<number, string> = { 1: "info", 2: "faible", 3: "moyenne", 4: "élevée", 5: "critique" };
  return labels[severity] ?? String(severity);
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

/** Construit un message lisible et une charge JSON pour un canal webhook. */
export function buildDeliveryMessage(alert: DeliveryAlert, cfg: DeliveryConfig = readDeliveryConfig()): DeliveryMessage {
  const org = alert.org_name?.trim() || "organisation inconnue";
  const source = alert.source_name?.trim() || "source inconnue";
  const date = fmtDate(alert.created_at);
  const eventTitle = alert.event_title?.trim() || alert.title?.trim() || "Alerte";
  const link = alert.source_url?.trim() || (cfg.webBaseUrl ? `${cfg.webBaseUrl}/alerts/${alert.id}` : "");
  const orientation = orientationDiffusee(alert);

  const lines = [
    `[Radar Cyber] Alerte #${alert.id} — sévérité ${alert.severity} (${severityLabel(alert.severity)})`,
    `Titre : ${eventTitle}`,
    `Organisation : ${org}`,
    `Source : ${source}`,
    `Date : ${date}`,
  ];
  if (link) lines.push(`Lien : ${link}`);
  if (orientation) {
    lines.push("", "Réflexe collectivité — 17Cyber (dispositif national) :");
    orientation.actions.forEach((action, i) => lines.push(`${i + 1}) ${action}`));
    lines.push(`Demande d'aide : ${orientation.url}`);
    if (orientation.verifie_le) lines.push(`Lien vérifié le ${orientation.verifie_le} (HTTP 200)`);
  }

  const payload = {
    type: "radar.alert",
    alert: {
      id: alert.id,
      title: alert.title,
      event_title: alert.event_title,
      severity: alert.severity,
      status: alert.status,
      organization: alert.org_name,
      source: alert.source_name,
      date,
      link: link || null,
      attempts: alert.attempts,
      orientation,
    },
  };

  return { alertId: alert.id, text: lines.join("\n"), payload };
}

async function sendWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
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

async function markChannelDelivered(id: number, channel: "webhook" | "telegram"): Promise<void> {
  const column = channel === "webhook" ? "webhook_delivered_at" : "telegram_delivered_at";
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
      if (cfg.webhookUrl && !webhookOk) {
        await sendWebhook(cfg.webhookUrl, msg.payload);
        webhookOk = true;
        await markChannelDelivered(alert.id, "webhook");
      }
      if (cfg.telegramBotToken && cfg.telegramChatId && !telegramOk) {
        await sendTelegram(cfg.telegramBotToken, cfg.telegramChatId, msg.text);
        telegramOk = true;
        await markChannelDelivered(alert.id, "telegram");
      }
      const allOk =
        (cfg.webhookUrl ? webhookOk : true) &&
        (cfg.telegramBotToken && cfg.telegramChatId ? telegramOk : true);
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
