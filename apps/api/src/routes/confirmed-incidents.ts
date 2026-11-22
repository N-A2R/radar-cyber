/**
 * GET /api/confirmed-incidents/incidents — incidents in Nouvelle-Aquitaine
 * that the verified corpus labels `etabli` (confirmed by the victim or an
 * authority).
 *
 * Projection only: incident ids, department, date, publisher kind and type.
 * No victim name, no free text, no article URL.
 */
import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";
import { detectConfirmedIncidents, type CorpusIncident } from "../analyse/confirmed-incidents.js";

const CORPUS = fileURLToPath(new URL("../../../../bench/fixtures/corpus-reference-na.json", import.meta.url));

export default async function (app: FastifyInstance) {
  app.get("/confirmed-incidents/incidents", async () => {
    const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as { incidents: CorpusIncident[] };
    return {
      generatedAt: new Date().toISOString(),
      source: "bench/fixtures/corpus-reference-na.json",
      ...detectConfirmedIncidents(corpus.incidents),
    };
  });
}
