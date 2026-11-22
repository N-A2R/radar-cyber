/**
 * GET /api/scan/campaigns — mass-scan campaigns targeting Nouvelle-Aquitaine
 * IPs, reconstructed only from public reports. The response carries source
 * names, target addresses and timestamps: no victim text or raw body.
 */
import type { FastifyInstance } from "fastify";
import { measureScanCampaigns } from "../scan/measure.js";

export default async function scanCampaignsRoute(app: FastifyInstance) {
  app.get("/scan/campaigns", async () => {
    const measurement = await measureScanCampaigns();
    return {
      scope: measurement.scope,
      basis: measurement.basis,
      count: measurement.count,
      campaigns: measurement.campaigns,
      signals: measurement.signals,
      signalsScanned: measurement.signalsScanned,
      perimeterIps: measurement.perimeterIps,
      sources: measurement.sources,
      baseline: measurement.baseline,
      measuredAt: measurement.measuredAt,
    };
  });
}
