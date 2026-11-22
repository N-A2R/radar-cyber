import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SectorIndexReport } from "../security/sectorIndex.js";

/**
 * Public read-only view of the region-wide sector security-debt index.
 *
 * Serves the frozen measurement produced by
 * `scripts/measure-security-sector-index.mts`. Only aggregate sector counts
 * and public-domain signal rates are exposed: no victim or person data.
 */
const RESULT_PATH = fileURLToPath(
  new URL("../../../../bench/results/security-sector-index-na.json", import.meta.url),
);

export default async function (app: FastifyInstance) {
  app.get("/security/sector-index", async () => {
    const report = JSON.parse(readFileSync(RESULT_PATH, "utf8")) as SectorIndexReport;
    return report;
  });
}
