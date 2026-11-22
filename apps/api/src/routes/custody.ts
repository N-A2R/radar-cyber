/**
 * GET /custody?subject=<dedup_key> — the chain of custody of one event.
 *
 * Read-only, public, and deliberately narrow: the response carries source
 * metadata, journal actors and timestamps only. No victim data, no free text
 * from the event, and no way to rewrite the journal.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { evaluateCustody, iso, type CustodyEvent, type CustodyFact } from "../custody/chain.js";
import { query } from "../db.js";
import { badRequest, notFound } from "../errors.js";
import { evenementPublicSql } from "../security/tlp.js";

const CustodyQuery = z.object({
  subject: z.string().trim().min(1).max(300),
});

type EventRow = {
  dedup_key: string;
  family: string | null;
  title: string | null;
  source_id: string | null;
  source_url: string | null;
  observed_at: string | Date | null;
  collected_at: string | Date | null;
  regional: boolean;
};

type FactRow = {
  kind: string;
  actor: string;
  summary: string;
  payload: Record<string, unknown>;
  valid_at: string | Date | null;
  recorded_at: string | Date | null;
};

export default async function (app: FastifyInstance): Promise<void> {
  app.get("/custody", async (request) => {
    const parsed = CustodyQuery.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest("a subject is required");
    const { subject } = parsed.data;

    const [events, facts] = await Promise.all([
      query<EventRow>(
        `SELECT dedup_key, family, title, source_id, source_url,
                observed_at, collected_at, regional
           FROM event e WHERE e.dedup_key = $1 AND ${evenementPublicSql("e")}`,
        [subject],
      ),
      query<FactRow>(
        `SELECT kind, actor, summary, payload, valid_at, recorded_at
           FROM journal WHERE subject = $1
          ORDER BY recorded_at ASC, id ASC`,
        [subject],
      ),
    ]);

    const row = events.rows[0];
    if (!row) throw notFound("no event for this subject");

    const event: CustodyEvent = {
      dedupKey: row.dedup_key,
      family: row.family,
      title: null,
      sourceId: row.source_id,
      sourceUrl: row.source_url,
      observedAt: iso(row.observed_at),
      collectedAt: iso(row.collected_at),
      regional: row.regional,
    };
    const journal: CustodyFact[] = facts.rows.map((fact) => ({
      kind: fact.kind,
      actor: fact.actor,
      summary: fact.summary,
      payload: fact.payload ?? {},
      validAt: iso(fact.valid_at),
      recordedAt: iso(fact.recorded_at),
    }));
    return evaluateCustody(event, journal);
  });
}
