import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function (app: FastifyInstance) {
  app.get("/stream", async (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write(": connected\n\n");
    const maxRes = await query<{ m: string }>("SELECT COALESCE(MAX(id),0)::text AS m FROM event");
    let lastId = Number(maxRes.rows[0]?.m ?? 0);
    const timer = setInterval(async () => {
      try {
        const r = await query<any>("SELECT * FROM event WHERE id > $1 ORDER BY id", [lastId]);
        for (const row of r.rows) {
          lastId = Math.max(lastId, row.id);
          reply.raw.write(`event: new\ndata: ${JSON.stringify(row)}\n\n`);
        }
      } catch {
        // ignore
      }
    }, 3000);
    req.raw.on("close", () => {
      clearInterval(timer);
      reply.raw.end();
    });
  });
}
