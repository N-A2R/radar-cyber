/**
 * GET /api/technical/coverage — number of integrated technical sources
 * (CVE, PoC, NVD, Exploit-DB, GitHub) and claims attached to an organization
 * in Nouvelle-Aquitaine. The response contains aggregate counters only.
 */
import type { FastifyInstance } from "fastify";
import { measureTechnicalCoverage } from "../technical/measure.js";

export default async function technicalCoverageRoute(app: FastifyInstance) {
  app.get("/technical/coverage", async () => await measureTechnicalCoverage());
}
