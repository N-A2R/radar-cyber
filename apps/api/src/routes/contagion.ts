/** Regional contagion list: 20 fallen organisations and their 30-day exposures. */
import type { FastifyInstance } from "fastify";
import { buildContagionReport } from "../analyse/contagion.js";
import { defaultAsOf, loadFallRecords } from "../analyse/contagion-db.js";
import { badRequest } from "../errors.js";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function (app: FastifyInstance) {
  app.get("/contagion/exposures", async (req) => {
    const query = req.query as { asOf?: string; limit?: string };
    if (query.asOf !== undefined && (!ISO_DAY.test(query.asOf) || Number.isNaN(Date.parse(query.asOf + "T00:00:00Z")))) {
      throw badRequest("asOf must be an ISO day (YYYY-MM-DD)");
    }
    const records = await loadFallRecords();
    const report = buildContagionReport(records, query.asOf ?? defaultAsOf(records));
    const requested = Number(query.limit ?? 0);
    const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 100) : 0;
    return limit > 0 ? { ...report, exposures: report.exposures.slice(0, limit) } : report;
  });
}
