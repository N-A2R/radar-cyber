/**
 * Public, read-only endpoints of the organization insurance score.
 *
 * The response carries numeric evidence and source identifiers only: no
 * victim data, no event title or summary, no source URL, no write operation.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  loadInsuranceCorpus,
  loadOrganizationInputs,
  inputFromRow,
} from "../insurance/query.js";
import { computeInsuranceScore, insuranceMethodology } from "../insurance/score.js";
import { badRequest, notFound } from "../errors.js";

const OrganizationParams = z.object({
  id: z.coerce.number().int().positive(),
});

export default async function (app: FastifyInstance): Promise<void> {
  app.get("/insurance/methodology", async () => insuranceMethodology());

  app.get("/insurance/organisations/:id", async (request) => {
    const parsed = OrganizationParams.safeParse(request.params ?? {});
    if (!parsed.success) throw badRequest("a positive numeric organization id is required");

    const corpus = await loadInsuranceCorpus();
    const row = await loadOrganizationInputs(parsed.data.id, corpus.referenceDate);
    if (!row) throw notFound("organization not found in Nouvelle-Aquitaine");

    const score = computeInsuranceScore(inputFromRow(row));
    return {
      organizationId: parsed.data.id,
      sector: row.sector,
      referenceDate: corpus.referenceDate,
      score,
      evidence: {
        sourceIds: row.sourceIds,
        incidentCount: row.incidentCount,
        ambientCount: row.ambientCount,
        distinctSources: row.distinctSources,
      },
      methodology: {
        version: score.version,
        path: "docs/score-assurance-organisation.md",
        endpoint: "/api/insurance/methodology",
      },
    };
  });
}
