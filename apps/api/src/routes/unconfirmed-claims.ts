/**
 * GET /api/unconfirmed-claims/incidents — attacker claims in Nouvelle-Aquitaine
 * that the verified corpus labels `declare` (no victim or authority confirmation).
 *
 * Projection only: incident ids, department, date, publisher kind and type.
 * No victim name, no free text, no article URL.
 */
import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";
import { detectUnconfirmedClaims, type CorpusIncident } from "../analyse/unconfirmed-claims.js";

const CORPUS = fileURLToPath(new URL("../../../../bench/fixtures/corpus-reference-na.json", import.meta.url));

export default async function (app: FastifyInstance) {
  app.get("/unconfirmed-claims/incidents", async () => {
    const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as { incidents: CorpusIncident[] };
    return {
      generatedAt: new Date().toISOString(),
      source: "bench/fixtures/corpus-reference-na.json",
      ...detectUnconfirmedClaims(corpus.incidents),
    };
  });
}
