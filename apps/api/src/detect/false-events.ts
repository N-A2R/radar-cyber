/**
 * Detection of false events in the Nouvelle-Aquitaine feed.
 *
 * An event is false when it carries no cyber signal in its own text and has no
 * Nouvelle-Aquitaine anchor (no attached organisation, no regional flag). Such
 * rows are noise in the regional feed: generic press, agenda items, or victim
 * names scraped from external claim sites. They are kept in `event` for audit,
 * but they never reach the alert engine again.
 *
 * The relevance engine is the same one the collectors use at admission time;
 * no network call, no paid service, and no victim personal data is stored here.
 */
import { evaluatePertinence } from "../collectors/pertinence.js";
import { ingestQuery } from "../db.js";

export const FALSE_REASON = "irrelevant_without_na_signal";

export type FalseEventInput = {
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  org_id?: unknown;
  regional?: unknown;
};

export type FalseEventVerdict = {
  isFalse: boolean;
  reason: string | null;
  score: number;
};

/** Pure classification; safe to call over the whole event table. */
export function detectFalseEvent(event: FalseEventInput): FalseEventVerdict {
  const hasNaSignal =
    event.org_id != null ||
    event.regional === true ||
    event.regional === "t" ||
    event.regional === "true";
  const relevance = evaluatePertinence({
    title: String(event.title ?? ""),
    summary: event.summary == null ? null : String(event.summary),
  });
  if (hasNaSignal || relevance.relevant) {
    return { isFalse: false, reason: null, score: relevance.score };
  }
  return { isFalse: true, reason: FALSE_REASON, score: relevance.score };
}

/** Persists a detection once; the primary key makes repeated passes harmless. */
export async function recordFalseEvent(
  eventId: number,
  verdict: FalseEventVerdict
): Promise<boolean> {
  if (!verdict.isFalse || !verdict.reason) return false;
  const res = await ingestQuery(
    `INSERT INTO false_event (event_id, reason, relevance_score)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, verdict.reason, verdict.score]
  );
  await closeAlertsForFalseEvents([eventId], verdict.reason);
  return (res.rowCount ?? 0) > 0;
}

/** Retires alerts opened before the event was recognised as false. */
export async function closeAlertsForFalseEvents(
  eventIds: number[],
  reason: string
): Promise<number> {
  if (eventIds.length === 0) return 0;
  const res = await ingestQuery(
    `UPDATE alert
        SET status = 'resolved',
            evidence = COALESCE(evidence, '{}'::jsonb) ||
                       jsonb_build_object('false_event',
                         jsonb_build_object('reason', $2::text, 'at', now())),
            updated_at = now()
      WHERE event_id = ANY($1::bigint[]) AND status <> 'resolved'`,
    [eventIds, reason]
  );
  return res.rowCount ?? 0;
}

/**
 * Used by `evaluateEvent`. A human-promoted claim (`force`) keeps its alert:
 * an analyst decision outranks the automatic false-event gate.
 */
export async function discardIfFalse(
  event: FalseEventInput,
  opts: { force?: boolean } = {}
): Promise<boolean> {
  const verdict = detectFalseEvent(event);
  if (!verdict.isFalse || opts.force) return false;
  if (event.id == null) return true;
  await recordFalseEvent(Number(event.id), verdict);
  return true;
}

