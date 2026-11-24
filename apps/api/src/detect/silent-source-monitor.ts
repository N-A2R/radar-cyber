/**
 * Hourly silent-source monitor.
 *
 * Reads real collector runs, evaluates the pure detector and writes review
 * alerts only. Nothing is sent to victims or to the public: these are review
 * queue items, keyed by public source id and timestamps alone.
 */
import { query } from "../db.js";
import { loadRuleThresholds } from "./engine.js";
import {
	CADENCE_WINDOW_DAYS,
	DAY_MS,
	HOUR_MS,
	SILENCE_ALERT_HOURS,
	SILENT_SOURCE_RULE,
	SILENT_SOURCE_SCOPE,
	detectSilentSources,
	type SourceSignal,
} from "./silent-source.js";

/** One check per hour; the 60 s server tick only calls this entry point. */
export const CHECK_INTERVAL_MS = HOUR_MS;
/** History needed for a 7-day cadence plus the silence threshold. */
const LOOKBACK_DAYS = CADENCE_WINDOW_DAYS + 7;

type ProductionRow = {
	source_id: string;
	produced_at: string | Date;
};

const PRODUCTION_SQL = `
SELECT cr.source_id, cr.finished_at AS produced_at
  FROM collector_run cr
  JOIN source s ON s.id = cr.source_id
 WHERE s.enabled = true
   AND s.statut IS DISTINCT FROM 'morte'
   AND cr.kind IN ('live', 'scan', 'ingest')
   AND cr.status = 'ok'
   AND cr.items_in > 0
   AND cr.finished_at >= $1::timestamptz
   AND ($3::text[] IS NULL OR cr.source_id = ANY($3::text[]))
   AND cr.finished_at <= $2::timestamptz
 ORDER BY cr.source_id, cr.finished_at
`;

let lastCheckAt = 0;

/** Repart d'un créneau libre : utile quand l'horloge de test est remplacée. */
export function resetSilentSourceCheckState(): void {
	lastCheckAt = 0;
}

export type SilentSourceCheckResult = {
	ran: boolean;
	sources: number;
	alerts: number;
	created: number;
};

async function writeAlert(alert: {
	sourceId: string;
	lastProductionAt: number;
	silenceHours: number;
	cadenceDays: number;
	reason: string;
}): Promise<boolean> {
	const evidence = JSON.stringify({
		sourceId: alert.sourceId,
		lastProductionAt: new Date(alert.lastProductionAt).toISOString(),
		silenceHours: alert.silenceHours,
		cadenceDays: alert.cadenceDays,
		key: alert.sourceId,
	});
	const result = await query<{ id: number }>(
		`INSERT INTO alert (rule_id, title, severity, status, evidence, scope)
		 SELECT $1, $2, 3, 'open', $3::jsonb, $4
		  WHERE NOT EXISTS (
		    SELECT 1 FROM alert
		     WHERE rule_id = $1 AND scope = $4 AND evidence->>'sourceId' = $5
		  )
		 RETURNING id`,
		[SILENT_SOURCE_RULE, alert.reason, evidence, SILENT_SOURCE_SCOPE, alert.sourceId],
	);
	return result.rows.length > 0;
}

/** Run at most once per interval unless forced; safe to call from every tick. */
export async function runSilentSourceCheck(options: { now?: number; force?: boolean; sourceIds?: readonly string[] } = {}): Promise<SilentSourceCheckResult> {
	const now = options.now ?? Date.now();
	if (!options.force && now - lastCheckAt < CHECK_INTERVAL_MS) {
		return { ran: false, sources: 0, alerts: 0, created: 0 };
	}


	const from = new Date(now - LOOKBACK_DAYS * DAY_MS).toISOString();
	const until = new Date(now).toISOString();
	const { rows } = await query<ProductionRow>(PRODUCTION_SQL, [from, until, options.sourceIds ? [...options.sourceIds] : null]);

	const bySource = new Map<string, number[]>();
	for (const row of rows) {
		const instant = Date.parse(String(row.produced_at));
		if (!Number.isFinite(instant)) continue;
		const times = bySource.get(row.source_id) ?? [];
		times.push(instant);
		bySource.set(row.source_id, times);
	}

	const signals: SourceSignal[] = [...bySource].map(([sourceId, productionTimes]) => ({ sourceId, productionTimes }));
	// Seuil calibré en heures (table `rule_calibration`) ; 12 h historiques si
	// la mesure manque, pour ne jamais changer de comportement sans preuve.
	const thresholds = await loadRuleThresholds();
	const thresholdHours = thresholds.get(SILENT_SOURCE_RULE) ?? SILENCE_ALERT_HOURS;
	const alerts = detectSilentSources(signals, now, thresholdHours);
	let created = 0;
	for (const alert of alerts) {
		if (await writeAlert(alert)) created++;
	}
	lastCheckAt = now;
	return { ran: true, sources: signals.length, alerts: alerts.length, created };
}
