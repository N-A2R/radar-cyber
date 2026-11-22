/**
 * GET /api/github-secrets — aggregate count of credential-shaped strings found
 * in public GitHub repositories of Nouvelle-Aquitaine organizations.
 *
 * The response carries counters only: no file content, credential value,
 * fingerprint or victim data ever leaves the versioned redacted corpus.
 */
import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { summarizeCorpus, validateCorpus } from "../github/corpus.js";

const CORPUS = new URL("../../../../db/data/github-na-secrets.json", import.meta.url);

export default async function githubSecretsRoute(app: FastifyInstance): Promise<void> {
  app.get("/github-secrets", async () => {
    const corpus = validateCorpus(JSON.parse(readFileSync(CORPUS, "utf8")) as unknown);
    const summary = summarizeCorpus(corpus);
    return {
      scope: corpus.scope,
      origin: corpus.origin,
      count: summary.count,
      byKind: summary.byKind,
      organizationsScanned: corpus.organizations.length,
      organizationsWithFindings: summary.organizations,
      repositoriesScanned: summary.repositories,
      filesScanned: summary.filesScanned,
      collectedAt: corpus.collectedAt,
    };
  });
}
