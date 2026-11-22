/**
 * GET /api/resale/listings — number of resale listings scoped to
 * Nouvelle-Aquitaine, with the baseline of the measurement.
 *
 * The response carries aggregate counters only. Listing texts, victim names,
 * e-mails and TLP:RED quarantine bodies are never exposed.
 */
import type { FastifyInstance } from "fastify";
import { measureResaleListings } from "../resale/measure.js";

export default async function resaleListingsRoute(app: FastifyInstance) {
  app.get("/resale/listings", async () => {
    const measurement = await measureResaleListings();
    return {
      scope: measurement.scope,
      basis: measurement.basis,
      count: measurement.count,
      candidatesScanned: measurement.candidatesScanned,
      saleOffersAll: measurement.saleOffersAll,
      baseline: measurement.baseline,
      measuredAt: measurement.measuredAt,
    };
  });
}
