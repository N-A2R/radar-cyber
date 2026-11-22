/**
 * GET /api/public-data-containers — count of publicly accessible repositories
 * and object-storage buckets holding Nouvelle-Aquitaine data.
 *
 * Aggregate counters only: the corpus holds public identifiers and numbers,
 * never a file body, a victim name or a contact detail.
 */
import type { FastifyInstance } from "fastify";
import { loadCorpus } from "../public-containers/corpus.js";
import { measurePublicContainers } from "../public-containers/measure.js";

const CORPUS = "db/data/na-public-containers.json";

export default async function publicDataContainersRoute(app: FastifyInstance) {
  app.get("/public-data-containers", async () => {
    const measurement = await measurePublicContainers(loadCorpus(CORPUS));
    return {
      scope: measurement.scope,
      basis: measurement.basis,
      count: measurement.count,
      byKind: measurement.byKind,
      candidatesScanned: measurement.candidatesScanned,
      baseline: measurement.baseline,
      measuredAt: measurement.measuredAt,
    };
  });
}
