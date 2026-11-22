/**
 * Daily pass: record each newly observed exposed service once.
 *
 * The pass is append-only and idempotent: a service already present in
 * `exposition_service_detection` is never inserted twice. It scans services
 * whose organisation proves Nouvelle-Aquitaine membership (INSEE code,
 * department name, or the region label). Only public network metadata is
 * read and written: no victim personal data, no active scanning.
 *
 * `now` is injectable and `client` can be a transaction-scoped client, so the
 * 7-day measurement replay runs the real SQL without touching production rows.
 */
import { query } from "../db.js";
import { isNaDepartmentValue } from "../geo/na-departments.js";
import {
	DETECTION_TARGET_HOURS,
	summarizeDetectionLatency,
	type DetectionLatency,
} from "./new-services.js";

/** One daily pass unless forced; the 60 s server tick only calls this entry point. */
export const DETECTION_INTERVAL_MS = 24 * 3600 * 1000;
const DEFAULT_BATCH = Number(process.env.RADAR_NEW_SERVICE_BATCH ?? 10_000);

let lastPassAt = 0;

/** Tests and the measurement replay start from a clean in-process cadence. */
export function resetNewServiceDetectionState(): void {
	lastPassAt = 0;
}

export type NewServiceDetectionPass = {
	ran: boolean;
	scanned: number;
	recorded: number;
	latency: DetectionLatency;
};

type Queryable = {
	query: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

type CandidateRow = {
	service_id: string;
	org_id: number;
	first_seen_at: Date | string;
	dept: string | null;
};

type InsertedRow = {
	first_seen_at: Date | string;
	detected_at: Date | string;
};

export async function runNewServiceDetection(
	options: { now?: number; force?: boolean; client?: Queryable } = {},
): Promise<NewServiceDetectionPass> {
	const now = options.now ?? Date.now();
	if (!options.force && now - lastPassAt < DETECTION_INTERVAL_MS) {
		return { ran: false, scanned: 0, recorded: 0, latency: summarizeDetectionLatency([]) };
	}

	const run = <T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> =>
		options.client
			? options.client.query<T>(text, params)
			: query<T>(text, params);

	const candidates = await run<CandidateRow>(
		`SELECT s.id AS service_id, s.org_id, s.first_seen_at, o.dept
		   FROM exposition_service s
		   JOIN org o ON o.id = s.org_id
		  WHERE NOT EXISTS (
		        SELECT 1 FROM exposition_service_detection d WHERE d.service_id = s.id
		      )
		  ORDER BY s.id
		  LIMIT $1`,
		[DEFAULT_BATCH],
	);

	const inScope = candidates.rows.filter((row) => isNaDepartmentValue(row.dept));
	let inserted: InsertedRow[] = [];
	if (inScope.length > 0) {
		const detectedAt = new Date(now).toISOString();
		const result = await run<InsertedRow>(
			`INSERT INTO exposition_service_detection
			   (service_id, org_id, first_seen_at, detected_at, detected_on)
			 SELECT x.service_id, x.org_id, x.first_seen_at,
			        $3::timestamptz, ($3::timestamptz AT TIME ZONE 'UTC')::date
			   FROM unnest($1::bigint[], $2::integer[], $4::timestamptz[])
			        AS x(service_id, org_id, first_seen_at)
			 ON CONFLICT (service_id) DO NOTHING
			 RETURNING first_seen_at, detected_at`,
			[
				inScope.map((row) => Number(row.service_id)),
				inScope.map((row) => row.org_id),
				detectedAt,
				inScope.map((row) => new Date(row.first_seen_at).toISOString()),
			],
		);
		inserted = result.rows;
	}

	lastPassAt = now;
	return {
		ran: true,
		scanned: inScope.length,
		recorded: inserted.length,
		latency: summarizeDetectionLatency(
			inserted.map((row) => ({ firstSeenAt: row.first_seen_at, detectedAt: row.detected_at })),
			{ targetHours: DETECTION_TARGET_HOURS },
		),
	};
}
