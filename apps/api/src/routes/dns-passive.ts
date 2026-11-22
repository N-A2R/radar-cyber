/**
 * GET /dns/passive — daily counts of DNS resolutions observed on NA domains.
 * Public: only aggregated counts and domains already in the NA perimeter.
 */
import type { FastifyInstance } from "fastify";
import { dailyCounts, passiveScope } from "../dns/passive/store.js";

export default async function dnsPassiveRoute(app: FastifyInstance): Promise<void> {
  app.get("/dns/passive", async (request) => {
    const params = request.query as { limit?: string };
    const requested = Number(params.limit);
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 90) : 14;
    return { days: await dailyCounts(limit), scope: await passiveScope() };
  });
}
