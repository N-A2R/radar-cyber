/**
 * GET /affected?q=<organization> — "Am I affected?" for Nouvelle-Aquitaine.
 *
 * Public, read-only and structured: the response lists what is recorded about
 * one organization, with the register or observation that supports each
 * statement. Level 4 also exposes the verbatim title, summary, source URL and
 * evidence payload of each observation under `statement.raw`.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildAffectedReport, OutsideRegionError } from "../affected/model.js";
import { findOrganization, listObservations } from "../affected/query.js";
import { badRequest, forbidden, notFound } from "../errors.js";

const AffectedQuery = z.object({
  q: z.string().trim().min(1).max(200),
});

export default async function (app: FastifyInstance): Promise<void> {
  app.get("/affected", async (request) => {
    const parsed = AffectedQuery.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest("an organization name, id or domain is required");
    const q = parsed.data.q;

    const lookup = /^\d+$/.test(q)
      ? { id: Number(q) }
      : /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(q) && !q.includes(" ")
        ? { domain: q }
        : { name: q };

    const organization = await findOrganization(lookup);
    if (!organization) throw notFound(`no organization recorded for: ${q}`);

    try {
      const observations = await listObservations(organization.id);
      return buildAffectedReport(organization, observations);
    } catch (error) {
      if (error instanceof OutsideRegionError) {
        throw forbidden("the assistant only covers Nouvelle-Aquitaine organizations");
      }
      throw error;
    }
  });
}
