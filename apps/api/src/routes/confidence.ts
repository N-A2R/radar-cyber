/**
 * GET /api/confidence/* — scores calculated by scripts/compute-confidence-scores.mts.
 *
 * A number without its four components is not an explanation, so every detail
 * response carries `components`, `breakdown` (value x weight = points, with
 * the reason for each line) and the raw `measures` used to compute them.
 * `/confidence/distribution` reports the published score distribution and the
 * corroboration split measured on stored facts, never recomputed in the front.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SCORE_LEVELS, SCORE_WEIGHTS } from "../analyse/confidence-score.js";
import { query } from "../db.js";

const Id = z.coerce.number().int().positive();
const EventParams = z.object({ eventId: Id });
const AttachmentParams = z.object({ eventId: Id, orgId: Id });

type ConfidenceRow = {
  event_id: string;
  org_id?: string;
  fact_key: string;
  score: number;
  level: string;
  sources_distinct: number;
  components: unknown;
  breakdown: unknown;
  measures: unknown;
  computed_at: string;
};

type DistributionRow = {
  total: number;
  corroborated: number;
  single_source: number;
  established: number;
};

type ScoreRow = { score: number; events: number };
type LevelRow = { level: string; events: number };

function present(row: ConfidenceRow) {
  return {
    eventId: Number(row.event_id),
    orgId: row.org_id === undefined ? null : Number(row.org_id),
    factKey: row.fact_key,
    score: Number(row.score),
    level: row.level,
    sourcesDistinct: Number(row.sources_distinct),
    components: row.components,
    breakdown: row.breakdown,
    measures: row.measures,
    computedAt: row.computed_at,
  };
}



export default async function confidenceRoute(app: FastifyInstance) {
  app.get("/confidence/distribution", async () => {
    const [facts, scores, levels] = await Promise.all([
      query<DistributionRow>(
        `WITH facts AS (
           SELECT fact_key, max(sources_distinct) AS sources_distinct
           FROM event_confidence GROUP BY fact_key
         )
         SELECT count(*)::int AS total,
                count(*) FILTER (WHERE sources_distinct >= 2)::int AS corroborated,
                count(*) FILTER (WHERE sources_distinct = 1)::int AS single_source,
                count(*) FILTER (WHERE sources_distinct >= 3)::int AS established
         FROM facts`,
      ),
      query<ScoreRow>(
        `SELECT score::int AS score, count(*)::int AS events
         FROM event_confidence GROUP BY score ORDER BY score`,
      ),
      query<LevelRow>(
        `SELECT level, count(*)::int AS events
         FROM event_confidence GROUP BY level ORDER BY level`,
      ),
    ]);
    const row = facts.rows[0];
    const total = Number(row?.total ?? 0);
    return {
      generatedAt: new Date().toISOString(),
      weights: SCORE_WEIGHTS,
      levels: { thresholds: SCORE_LEVELS, counts: levels.rows },
      scores: scores.rows.map((s) => ({ score: Number(s.score), events: Number(s.events) })),
      facts: {
        total,
        corroborated: Number(row?.corroborated ?? 0),
        singleSource: Number(row?.single_source ?? 0),
        established: Number(row?.established ?? 0),
        definition: "distinct source ids sharing one fact_key within the 72 h window",
      },
    };
  });

  app.get("/confidence/events/:eventId", async (req, reply) => {
    const parsed = EventParams.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid event id" });
    const id = parsed.data.eventId;
    const result = await query<ConfidenceRow>(
      `SELECT event_id::text, fact_key, score, level, sources_distinct,
              components, breakdown, measures, computed_at::text
       FROM event_confidence WHERE event_id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: "event has no stored confidence score" });
    return present(row);
  });

  app.get("/confidence/attachments/:eventId/:orgId", async (req, reply) => {
    const parsed = AttachmentParams.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid attachment id" });
    const { eventId, orgId } = parsed.data;
    const result = await query<ConfidenceRow>(
      `SELECT event_id::text, org_id::text, fact_key, score, level, sources_distinct,
              components, breakdown, measures, computed_at::text
       FROM attachment_confidence WHERE event_id = $1 AND org_id = $2`,
      [eventId, orgId],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: "attachment has no stored confidence score" });
    return present(row);
  });
}
