/**
 * 3D live map: snapshot of ongoing attacks and SSE feed.
 *
 * No victim personal data transits: the allowlist lives in `src/live/attacks.ts`
 * and the TLP predicate is the central one from `security/tlp.ts`. The hijacked
 * SSE response carries the same headers and access audit as the REST API.
 */
import type { FastifyInstance } from "fastify";
import { badRequest, serviceUnavailable } from "../errors.js";
import { query } from "../db.js";
import {
  formatAttackEvent,
  LIVE_WINDOW_DAYS,
  liveAttackParams,
  LIVE_ATTACK_SQL,
  toLiveAttack,
  type LiveAttack,
} from "../live/attacks.js";
import { auditerFluxSse } from "../security/rbac.js";
import { ecrireEntetesSse } from "../security/headers.js";

const MAX_CLIENTS = Number(process.env.LIVE_MAP_MAX_CLIENTS ?? 50);
const POLL_MS = 2000;
const MAX_SNAPSHOT = 2000;

async function selectAttacks(afterId: number | null = null, limite = 500): Promise<LiveAttack[]> {
  const r = await query<Record<string, unknown>>(LIVE_ATTACK_SQL, liveAttackParams(afterId, limite));
  return r.rows.map(toLiveAttack).filter((a): a is LiveAttack => a !== null);
}

function curseur(brut: unknown): number {
  if (brut === undefined || brut === null || brut === "") return 0;
  const texte = Array.isArray(brut) ? brut[0] : brut;
  if (typeof texte !== "string" || !/^\d+$/.test(texte)) throw badRequest("sinceId doit être un entier positif");
  const valeur = Number(texte);
  if (!Number.isSafeInteger(valeur)) throw badRequest("sinceId hors limites");
  return valeur;
}

export default async function (app: FastifyInstance) {
  let clients = 0;

  app.get("/live-map", async () => {
    const attacks = await selectAttacks(null, MAX_SNAPSHOT);
    return {
      capturedAt: new Date().toISOString(),
      windowDays: LIVE_WINDOW_DAYS,
      attacks,
      total: attacks.length,
    };
  });

  app.get("/live-map/stream", async (req, reply) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let sinceId = curseur(url.searchParams.get("sinceId") ?? undefined);
    if (clients >= MAX_CLIENTS) throw serviceUnavailable("live map stream is full");
    clients++;
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clearInterval(heartbeat);
      clients = Math.max(0, clients - 1);
      try { reply.raw.end(); } catch { /* already closed */ }
    };

    await auditerFluxSse(req);
    reply.hijack();
    ecrireEntetesSse(reply);
    reply.raw.write(": connected\n\n");

    const timer = setInterval(() => {
      if (closed) return;
      void selectAttacks(sinceId).then((attacks) => {
        if (closed) return;
        for (const attack of attacks) {
          reply.raw.write(formatAttackEvent(attack));
          const id = Number(attack.id);
          if (Number.isFinite(id)) sinceId = Math.max(sinceId, id);
        }
      }).catch(cleanup);
    }, POLL_MS);

    const heartbeat = setInterval(() => {
      if (closed) return;
      try { reply.raw.write(": ping\n\n"); } catch { cleanup(); }
    }, 20000);

    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);
  });
}
