/**
 * Alerts eligible for external notification channels.
 *
 * One shared selector serves the webhook/email dispatcher and the RSS feed so
 * that both obey the same rules:
 *  - Nouvelle-Aquitaine only (regional department on the victim organization,
 *    or the regional flag computed by the territorial resolver);
 *  - review-only scopes are never published;
 *  - TLP:RED events are never published;
 *  - the free-text alert and event titles are deliberately not selected:
 *    notification payloads are built from structured fields only.
 */
import { ALERT_SCOPES_REVUE } from "../alert-scope.js";
import { DEPT_LABELS } from "../collectors/relevance.js";
import { query } from "../db.js";

/** Twelve departments of Nouvelle-Aquitaine, from the canonical label table. */
export const NA_DEPARTMENTS: readonly string[] = Object.keys(DEPT_LABELS);
export const MAX_DELIVERY_ATTEMPTS = 10;

export interface NotificationAlert {
  id: number;
  severity: number;
  status: string;
  created_at: Date | string;
  attempts: number;
  webhook_delivered_at: Date | string | null;
  telegram_delivered_at: Date | string | null;
  email_delivered_at: Date | string | null;
  org_name: string | null;
  org_dept: string | null;
  source_name: string | null;
  source_url: string | null;
  event_regional: boolean | null;
}

const BASE_SELECT = `
SELECT a.id, a.severity, a.status, a.created_at, a.attempts,
       a.webhook_delivered_at, a.telegram_delivered_at,
       (to_jsonb(a) ->> 'email_delivered_at')::timestamptz AS email_delivered_at,
       o.name AS org_name, o.dept AS org_dept,
       s.name AS source_name, COALESCE(e.source_url, s.url) AS source_url,
       e.regional AS event_regional
  FROM alert a
  LEFT JOIN event e ON e.id = a.event_id
  LEFT JOIN org o ON o.id = a.org_id
  LEFT JOIN source s ON s.id = e.source_id
 WHERE a.scope <> ALL($2::text[])
   AND (e.tlp IS NULL OR e.tlp <> 'RED')
   AND ((o.id IS NOT NULL AND o.dept = ANY($3::text[])) OR (o.id IS NULL AND e.regional = true))
`;

export interface FetchOptions {
  /** Pending delivery queue (oldest first) or public feed (newest first). */
  pendingOnly?: boolean;
  limit?: number;
}

/** The queue and the feed share the scope filter but not their ordering. */
export async function fetchNotificationAlerts(options: FetchOptions = {}): Promise<NotificationAlert[]> {
  const limit = options.limit ?? 50;
  const pendingOnly = options.pendingOnly ?? true;
  const pendingClause = pendingOnly
    ? `   AND a.status = 'open'
   AND a.delivered_at IS NULL
   AND a.attempts < $4
   AND (a.next_attempt_at IS NULL OR a.next_attempt_at <= now())
`
    : "";
  const order = pendingOnly ? "a.created_at ASC, a.id ASC" : "a.created_at DESC, a.id DESC";
  const sql = `${BASE_SELECT}${pendingClause} ORDER BY ${order} LIMIT $1`;
  const params: unknown[] = [limit, [...ALERT_SCOPES_REVUE], [...NA_DEPARTMENTS]];
  if (pendingOnly) params.push(MAX_DELIVERY_ATTEMPTS);
  const r = await query<NotificationAlert>(sql, params);
  return r.rows;
}
