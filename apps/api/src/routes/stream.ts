/**
 * Flux SSE des événements et alertes.
 *
 * La route est publique : l'authentification facultative (bearer ou cookie de
 * session) est résolue une fois par `installIdentityResolution`. Les curseurs
 * sont validés et bornés, le prédicat TLP est le même que celui des lectures
 * REST, et la réponse hijackée porte les en-têtes de sécurité et l'audit (E7/M9).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { badRequest, serviceUnavailable } from "../errors.js";
import { query } from "../db.js";
import { latestAlertId, selectNewAlerts } from "../notify/alert-feed.js";
import { evenementPublicSql } from "../security/tlp.js";
import { auditerFluxSse } from "../security/rbac.js";
import { ecrireEntetesSse } from "../security/headers.js";

const MAX_CLIENTS = Number(process.env.STREAM_MAX_CLIENTS ?? 200);
const MAX_PER_KEY = Number(process.env.STREAM_MAX_PER_KEY ?? 5);
const IDLE_TIMEOUT_MS = Number(process.env.STREAM_IDLE_TIMEOUT_MS ?? 120_000);
const HEARTBEAT_MS = 15_000;
const MAX_TRANCHE = 200;
const MAX_ALERTES = 100;

/** Champs du contrat SSE : ni `SELECT *`, ni colonne interne superflue. */
const EVENEMENTS_SSE_SQL = `
SELECT e.id, e.family, e.assertion_type, e.title, e.severity, e.observed_at,
       e.source_id, e.source_url, e.tlp, e.org_id
  FROM event e
 WHERE e.id > $1 AND ${evenementPublicSql("e")}
 ORDER BY e.id LIMIT $2`;

/**
 * Un curseur invalide (`?sinceId=abc`) faisait grimper `lastId` à NaN : le
 * flux restait ouvert mais muet. On préfère un 400 explicite, et on borne la
 * valeur à un entier sûr pour éviter un débordement en SQL.
 */
function curseur(brut: unknown, nom: string): number {
  if (brut === undefined || brut === null || brut === "") return 0;
  const texte = Array.isArray(brut) ? brut[0] : brut;
  if (typeof texte !== "string" || !/^\d+$/.test(texte)) {
    throw badRequest(`${nom} doit être un entier positif`);
  }
  const valeur = Number(texte);
  if (!Number.isSafeInteger(valeur)) throw badRequest(`${nom} hors limites`);
  return valeur;
}

function evenementSse(row: Record<string, unknown>): string {
  const id = Number(row.id);
  const donnees = {
    id,
    family: row.family,
    assertionType: row.assertion_type,
    title: row.title,
    severity: row.severity,
    observedAt: row.observed_at,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    tlp: row.tlp,
    orgId: row.org_id,
  };
  return `id: ${id}\nevent: new\ndata: ${JSON.stringify(donnees)}\n\n`;
}

/** Un utilisateur authentifié et une IP anonyme ont des budgets séparés. */
function cleClient(req: FastifyRequest): string {
  return req.user ? `user:${req.user.id}` : `ip:${req.ip ?? "inconnue"}`;
}

export default async function (app: FastifyInstance) {
  let clients = 0;
  const parCle = new Map<string, number>();
  app.get("/stream", async (req, reply) => {
    const url = new URL(req.url ?? "", "http://localhost");
    let sinceId = curseur(url.searchParams.get("sinceId") ?? undefined, "sinceId");
    const lei = req.headers["last-event-id"];
    if (typeof lei === "string" && /^\d+$/.test(lei)) {
      sinceId = Math.max(sinceId, curseur(lei, "Last-Event-ID"));
    }
    const dernierAlert = curseur(url.searchParams.get("sinceAlertId") ?? undefined, "sinceAlertId");
    let lastAlertId = dernierAlert === 0 ? await latestAlertId() : dernierAlert;
    let lastId = sinceId;

    const cle = cleClient(req);
    const deja = parCle.get(cle) ?? 0;
    if (clients >= MAX_CLIENTS || deja >= MAX_PER_KEY) {
      throw serviceUnavailable("too many SSE clients");
    }
    clients += 1;
    parCle.set(cle, deja + 1);
    let closed = false;
    let timer: NodeJS.Timeout | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    let stalledSince: number | null = null;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clearInterval(heartbeat);
      clients = Math.max(0, clients - 1);
      const restants = Math.max(0, (parCle.get(cle) ?? 1) - 1);
      if (restants === 0) parCle.delete(cle);
      else parCle.set(cle, restants);
      try { reply.raw.end(); } catch { /* ignore */ }
    };
    const ecrire = (texte: string): boolean => {
      if (closed) return false;
      try {
        const accepte = reply.raw.write(texte);
        stalledSince = accepte ? null : (stalledSince ?? Date.now());
        return accepte;
      } catch {
        cleanup();
        return false;
      }
    };

    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);

    // Audit explicite : `onSend` ne voit jamais une réponse hijackée.
    try {
      await auditerFluxSse(req);
    } catch (erreur) {
      cleanup();
      throw erreur;
    }
    reply.hijack();
    ecrireEntetesSse(reply);
    ecrire(": connected\n\n");

    if (sinceId > 0) {
      try {
        const r = await query<Record<string, unknown>>(EVENEMENTS_SSE_SQL, [sinceId, MAX_TRANCHE]);
        for (const row of r.rows) {
          lastId = Math.max(lastId, Number(row.id));
          if (!ecrire(evenementSse(row))) return;
        }
      } catch { /* ignore */ }
    } else {
      const maxRes = await query<{ m: string }>("SELECT COALESCE(MAX(id),0)::text AS m FROM event");
      lastId = Number(maxRes.rows[0]?.m ?? 0);
    }

    let enCours = false;
    timer = setInterval(() => {
      if (closed || enCours) return;
      enCours = true;
      void (async () => {
        try {
          const r = await query<Record<string, unknown>>(EVENEMENTS_SSE_SQL, [lastId, MAX_TRANCHE]);
          for (const row of r.rows) {
            lastId = Math.max(lastId, Number(row.id));
            if (!ecrire(evenementSse(row))) return;
          }
          const alerts = await selectNewAlerts(lastAlertId, MAX_ALERTES);
          for (const alert of alerts) {
            lastAlertId = Math.max(lastAlertId, alert.id);
            if (!ecrire(`id: alert-${alert.id}\nevent: alert\ndata: ${JSON.stringify(alert)}\n\n`)) return;
          }
        } catch { /* ignore */ } finally {
          enCours = false;
        }
      })();
    }, 3000);

    heartbeat = setInterval(() => {
      if (closed) return;
      if (stalledSince !== null && Date.now() - stalledSince > IDLE_TIMEOUT_MS) {
        cleanup();
        return;
      }
      ecrire(": ping\n\n");
    }, HEARTBEAT_MS);
  });
}
