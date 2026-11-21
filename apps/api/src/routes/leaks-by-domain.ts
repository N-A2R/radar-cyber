/**
 * GET /api/leaks/by-domain — number of leaks attached to an organization in
 * Nouvelle-Aquitaine by registrable domain.
 *
 * The response carries only aggregate counters: claim identifiers and victim
 * data never leave the TLP:RED quarantine.
 */
import type { FastifyInstance } from "fastify";
import { measureLeaksByDomain } from "../leaks/measure.js";

export default async function leaksByDomainRoute(app: FastifyInstance) {
  app.get("/leaks/by-domain", async () => {
    const measurement = await measureLeaksByDomain();
    return {
      scope: measurement.scope,
      basis: measurement.basis,
      count: measurement.count,
      claimsRead: measurement.claimsRead,
      matchedOrganizations: measurement.matchedOrganizations,
      measuredAt: measurement.measuredAt,
    };
  });
}
