/**
 * GET /api/c2/hosted — number of presumed C2 servers hosted in
 * Nouvelle-Aquitaine, with the source of each detection.
 *
 * The response carries identifiers, source names and the matched region
 * locality only. Titles, victim data and TLP:RED bodies are never exposed.
 */
import type { FastifyInstance } from "fastify";
import { measureC2Servers } from "../c2/measure.js";

export default async function c2ServersRoute(app: FastifyInstance) {
  app.get("/c2/hosted", async () => {
    const measurement = await measureC2Servers();
    return {
      scope: measurement.scope,
      basis: measurement.basis,
      count: measurement.count,
      detections: measurement.detections,
      signalsScanned: measurement.signalsScanned,
      signals: measurement.signals,
      c2Sources: measurement.c2Sources.length,
      baseline: measurement.baseline,
      measuredAt: measurement.measuredAt,
    };
  });
}
