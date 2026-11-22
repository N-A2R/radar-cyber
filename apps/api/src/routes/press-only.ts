/**
 * GET /api/press-only/incidents — count of Nouvelle-Aquitaine incidents whose
 * only detection channel was the press (verified corpus label `rapporte`).
 *
 * The response is intentionally projection-only: incident ids, department,
 * date, publisher kind and type. No victim name, no free text, no article URL.
 */
import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";
import { detectPressOnly, type CorpusIncident } from "../analyse/press-only.js";

const CORPUS = fileURLToPath(new URL("../../../../bench/fixtures/corpus-reference-na.json", import.meta.url));

export default async function (app: FastifyInstance) {
  app.get("/press-only/incidents", async () => {
    const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as { incidents: CorpusIncident[] };
    return {
      generatedAt: new Date().toISOString(),
      source: "bench/fixtures/corpus-reference-na.json",
      ...detectPressOnly(corpus.incidents),
    };
  });
}
