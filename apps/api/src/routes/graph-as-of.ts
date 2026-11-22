/**
 * As-of access to the Nouvelle-Aquitaine temporal graph.
 *
 * GET /api/graph/as-of?at=2025-06-01T00:00:00Z
 * GET /api/graph/as-of?at=2025-06-01T00:00:00Z&window=3y
 *
 * The optional three-year window adds opened/closed relation counts per month.
 * All payload fields are English; no entity label or victim data is exposed.
 */
import type { FastifyInstance } from "fastify";
import { queryGraphAsOf } from "../graph/as-of.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function (app: FastifyInstance) {
  app.get("/graph/as-of", async (req, reply) => {
    const raw = req.query as Record<string, string | string[] | undefined>;
    const at = single(raw.at)?.trim();
    if (!at || !Number.isFinite(Date.parse(at))) {
      return reply.code(400).send({ error: "at must be a valid ISO date" });
    }
    const window = single(raw.window);
    if (window !== undefined && window !== "3y") {
      return reply.code(400).send({ error: "window must be 3y" });
    }
    const type = single(raw.type)?.trim() || undefined;
    const node = single(raw.node)?.trim() || undefined;
    const asked = single(raw.limit);
    const limit = asked === undefined ? DEFAULT_LIMIT : Number(asked);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return reply.code(400).send({ error: `limit must be an integer between 1 and ${MAX_LIMIT}` });
    }
    return queryGraphAsOf({
      at,
      windowYears: window === "3y" ? 3 : undefined,
      type,
      node,
      limit,
    });
  });
}
