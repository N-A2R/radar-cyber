import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { resolveUser } from "../middleware/auth.js";

const MAX_CLIENTS = Number(process.env.STREAM_MAX_CLIENTS ?? 200);

function redactEvent(row: Record<string, unknown>): Record<string, unknown> {
  if (row.tlp === "RED") {
    return { ...row, summary: null };
  }
  return row;
}

export default async function (app: FastifyInstance) {
  let clients = 0;
  app.get("/stream", async (req, reply) => {
    const user = await resolveUser(req);
    if (!user) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    if (clients >= MAX_CLIENTS) {
      reply.code(503).send({ error: "too many SSE clients" });
      return;
    }
    clients++;
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clearInterval(heartbeat);
      clients = Math.max(0, clients - 1);
      try { reply.raw.end(); } catch { /* ignore */ }
    };

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write(": connected\n\n");

    const url = new URL(req.url ?? "", "http://localhost");
    let sinceId = Number(url.searchParams.get("sinceId") ?? 0);
    const lei = req.headers["last-event-id"];
    if (lei) sinceId = Math.max(sinceId, Number(lei) || 0);

    if (sinceId > 0) {
      try {
        const r = await query<Record<string, unknown>>("SELECT * FROM event WHERE id > $1 ORDER BY id LIMIT 200", [sinceId]);
        for (const row of r.rows) {
          if (row.tlp === "RED") {
            continue;
          }
          const redacted = redactEvent(row);
          reply.raw.write(`id: ${row.id}\nevent: new\ndata: ${JSON.stringify(redacted)}\n\n`);
          sinceId = Math.max(sinceId, Number(row.id));
        }
      } catch { /* ignore */ }
    }

    let lastId = sinceId;
    if (lastId <= 0) {
      const maxRes = await query<{ m: string }>("SELECT COALESCE(MAX(id),0)::text AS m FROM event");
      lastId = Number(maxRes.rows[0]?.m ?? 0);
    }

    const timer = setInterval(async () => {
      try {
        const r = await query<Record<string, unknown>>("SELECT * FROM event WHERE id > $1 ORDER BY id", [lastId]);
        for (const row of r.rows) {
          lastId = Math.max(lastId, Number(row.id));
          if (row.tlp === "RED") {
            continue;
          }
          const redacted = redactEvent(row);
          reply.raw.write(`id: ${row.id}\nevent: new\ndata: ${JSON.stringify(redacted)}\n\n`);
        }
      } catch { /* ignore */ }
    }, 3000);

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(": ping\n\n");
      } catch {
        cleanup();
      }
    }, 20000);

    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);
  });
}
