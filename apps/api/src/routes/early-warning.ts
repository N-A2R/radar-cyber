/**
 * GET /early-warning/global-to-regional — hours from the first worldwide
 * observation of a campaign to its first observation in Nouvelle-Aquitaine.
 *
 * Public by design: the response contains campaign keys, labels, timestamps
 * and counts only. No victim title, summary, evidence or personal detail is
 * fetched from the database.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
	computePropagation,
	selectPastCampaigns,
	summarizePropagations,
} from "../early-warning/global-to-regional.js";
import { fetchCampaignTimelines } from "../early-warning/store.js";

const QUERY = z.object({ campaigns: z.coerce.number().int().min(1).max(50).default(10) });

export default async function (app: FastifyInstance): Promise<void> {
  app.get("/early-warning/global-to-regional", async (request) => {
    const parsed = QUERY.safeParse(request.query);
    const limit = parsed.success ? parsed.data.campaigns : 10;
    const timelines = await fetchCampaignTimelines();
    const propagations = timelines.map(computePropagation).filter((item) => item !== null);
    const selected = selectPastCampaigns(propagations, limit);
    return {
      scope: "Nouvelle-Aquitaine (12 departments)",
      definition: "Hours from the first worldwide observation to the first NA observation",
      limit,
      summary: summarizePropagations(selected),
      campaigns: selected,
    };
  });
}
