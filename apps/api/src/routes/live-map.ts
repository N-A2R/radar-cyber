/**
 * 3D live map: snapshot of ongoing attacks and SSE feed.
 *
 * No victim personal data transits: the allowlist lives in `src/live/attacks.ts`.
 * No trust filter is applied to sources (gray sources are allowed).
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import {
  formatAttackEvent,
  LIVE_WINDOW_DAYS,
  liveAttackParams,
  LIVE_ATTACK_SQL,
  toLiveAttack,
  type LiveAttack,
} from "../live/attacks.js";

const MAX_CLIENTS = Number(process.env.LIVE_MAP_MAX_CLIENTS ?? 50);
const POLL_MS = 2000;

async function selectAttacks(afterId: number | null = null): Promise<LiveAttack[]> {
  const r = await query<Record<string, unknown>>(LIVE_ATTACK_SQL, liveAttackParams(afterId));
  return r.rows.map(toLiveAttack).filter((a): a is LiveAttack => a !== null);
}

export default async function (app: FastifyInstance) {
  let clients = 0;

  app.get("/live-map", async () => {
    const attacks = await selectAttacks();
    return {
      capturedAt: new Date().toISOString(),
      windowDays: LIVE_WINDOW_DAYS,
      attacks,
      total: attacks.length,
    };
  });

  app.get("/live-map/stream", async (req, reply) => {
    if (clients >= MAX_CLIENTS) {
      return reply.code(503).send({ error: { code: "TOO_MANY_CLIENTS", message: "live map stream is full" } });
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    let sinceId = Number(url.searchParams.get("sinceId") ?? 0);
    if (!Number.isFinite(sinceId) || sinceId < 0) sinceId = 0;

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

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write(`: connected\n\n`);

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
