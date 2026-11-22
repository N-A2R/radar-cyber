/**
 * Détection incrémentale — le chaînon qui manquait entre collecte et alerte.
 *
 * Principe : un curseur par nature (événement, indicateur), avancé par lots
 * bornés. Les insertions d'alertes sont idempotentes (`ON CONFLICT DO NOTHING`
 * dans le moteur), donc rejouer un lot ne coûte que du temps, jamais de
 * doublon.
 *
 * État persistant : les curseurs vivent dans `source.cursor` (ligne
 * synthétique `radar-detection`), donc survivent aux redémarrages. Les
 * événements déjà évalués sans alerte sont mémorisés dans `lateEvaluated`
 * pour ne pas être réévalués à chaque passage (borne des non-matchants).
 */
import { query } from "../db.js";
import { evaluateEvent, evaluateIndicator } from "./engine.js";
import { sweepRecentFalseEvents, sweepUnrecordedFalseEvents } from "./false-events.js";

const DEFAULT_EVENT_LIMIT = Number(process.env.RADAR_DETECT_EVENT_LIMIT ?? 500);
const DEFAULT_INDICATOR_LIMIT = Number(process.env.RADAR_DETECT_INDICATOR_LIMIT ?? 1000);
const DEFAULT_CATCH_UP = Number(process.env.RADAR_DETECT_CATCH_UP ?? 500);
const LATE_WINDOW_DAYS = Number(process.env.RADAR_DETECT_LATE_DAYS ?? 7);
const LATE_LIMIT = Number(process.env.RADAR_DETECT_LATE_LIMIT ?? 200);
/** Plafond de la mémoire des non-matchants : au-delà, les plus anciens sortent.
 *  Sans plafond, la ligne d'état grossirait indéfiniment dans `source.cursor`. */
const LATE_REMEMBERED = Number(process.env.RADAR_DETECT_LATE_REMEMBER ?? 5000);
/** Le lot des événements sans ancrage dépasse 25 000 lignes : à 500 par passage,
 *  une décision devenue fausse après un changement d'org_id restait en attente.
 *  20 000 lignes classées en ~5 s mesurées, dans le budget d'un tick de 60 s. */
const DEFAULT_FALSE_LIMIT = Number(process.env.RADAR_DETECT_FALSE_LIMIT ?? 20000);

export type DetectionPass = {
	events: number;
	indicators: number;
	late: number;
	alerts: number;
	lastEventId: number;
	lastIndicatorId: number;
};

let eventCursor: number | null = null;
let indicatorCursor: number | null = null;
let lateEvaluated: Set<number> = new Set();
let falseCursor: number | null = null;

const STATE_SOURCE_ID = "radar-detection";

export function resetDetectionCursors(): void {
	eventCursor = null;
	indicatorCursor = null;
	lateEvaluated = new Set();
	falseCursor = null;
}

async function maxId(table: "event" | "indicator"): Promise<number> {
	const r = await query<{ m: string }>(`SELECT COALESCE(MAX(id),0)::text AS m FROM ${table}`);
	return Number(r.rows[0]?.m ?? 0);
}

async function ensureStateRow(): Promise<void> {
	await query(
		`INSERT INTO source (id, name, family, url, cursor) VALUES ($1,$2,$3,$4,'{}'::jsonb)
		  ON CONFLICT (id) DO NOTHING`,
		[STATE_SOURCE_ID, "Radar detection cursor", "cti", "internal://detection"],
	);
}

async function loadState(): Promise<void> {
	await ensureStateRow();
	const r = await query<{ cursor: unknown }>("SELECT cursor FROM source WHERE id=$1", [STATE_SOURCE_ID]);
	const c = (r.rows[0]?.cursor ?? {}) as Record<string, unknown>;
	if (typeof c.eventCursor === "number") eventCursor = c.eventCursor;
	if (typeof c.indicatorCursor === "number") indicatorCursor = c.indicatorCursor;
	if (Array.isArray(c.lateEvaluated)) lateEvaluated = new Set(c.lateEvaluated.map(Number));
	if (typeof c.falseCursor === "number") falseCursor = c.falseCursor;
}

async function saveState(): Promise<void> {
	await query(
		"UPDATE source SET cursor=$1, last_ok_at=now() WHERE id=$2",
		[JSON.stringify({ eventCursor, indicatorCursor, lateEvaluated: [...lateEvaluated], falseCursor }), STATE_SOURCE_ID],
	);
}

async function corroborationByOrg(): Promise<Map<number, number>> {
	const r = await query<{ org_id: number; n: string }>(
		`SELECT org_id, COUNT(DISTINCT source_id)::text AS n
		   FROM event
		  WHERE org_id IS NOT NULL
		    AND COALESCE(observed_at, collected_at) >= now() - interval '30 days'
		  GROUP BY org_id`,
	);
	return new Map(r.rows.map((row) => [Number(row.org_id), Number(row.n)]));
}

export async function runDetectionPass(opts?: {
	eventLimit?: number;
	indicatorLimit?: number;
	catchUp?: number;
	lateLimit?: number;
	falseLimit?: number;
}): Promise<DetectionPass> {
	const eventLimit = opts?.eventLimit ?? DEFAULT_EVENT_LIMIT;
	const indicatorLimit = opts?.indicatorLimit ?? DEFAULT_INDICATOR_LIMIT;
	const catchUp = opts?.catchUp ?? DEFAULT_CATCH_UP;
	const lateLimit = opts?.lateLimit ?? LATE_LIMIT;
	const falseLimit = opts?.falseLimit ?? DEFAULT_FALSE_LIMIT;

	if (eventCursor === null || indicatorCursor === null) await loadState();
	if (eventCursor === null) eventCursor = Math.max(0, (await maxId("event")) - catchUp);
	if (indicatorCursor === null) indicatorCursor = Math.max(0, (await maxId("indicator")) - catchUp);

	const corroboration = await corroborationByOrg();
	let alerts = 0;

	const fresh = await query<{ id: number }>(
		"SELECT id FROM event WHERE id > $1 ORDER BY id LIMIT $2",
		[eventCursor, eventLimit],
	);
	for (const row of fresh.rows) {
		const id = Number(row.id);
		alerts += await evaluateEvent(id, { corroboration });
		eventCursor = Math.max(eventCursor ?? 0, id);
	}

	// Un événement peut perdre son ancrage après son admission : le balayage
	// « late » ne le revoit pas (il exige un org_id). Ce rattrapage borne
	// enregistre ces faux et clôt leurs alertes, sans toucher aux vrais.
	const sweep = await sweepUnrecordedFalseEvents({
		after: falseCursor ?? 0,
		limit: falseLimit,
	});
	const highestEventId = await maxId("event");
	falseCursor =
		sweep.scanned === 0 || sweep.lastId >= highestEventId ? 0 : sweep.lastId;
	// Les événements frais passent en priorité : le curseur ascendant peut
	// balancer plusieurs fois sur un vieux lot avant d'atteindre la tête.
	await sweepRecentFalseEvents({ limit: falseLimit });

	const freshIndicators = await query<{ id: number }>(
		"SELECT id FROM indicator WHERE id > $1 ORDER BY id LIMIT $2",
		[indicatorCursor, indicatorLimit],
	);
	for (const row of freshIndicators.rows) {
		const id = Number(row.id);
		alerts += await evaluateIndicator(id);
		indicatorCursor = Math.max(indicatorCursor ?? 0, id);
	}

	let late = 0;
	if (lateLimit > 0) {
		const pending = await query<{ id: number }>(
			`SELECT e.id
			   FROM event e
			  WHERE e.org_id IS NOT NULL
			    AND COALESCE(e.observed_at, e.collected_at) >= now() - ($1::int * interval '1 day')
			    AND NOT EXISTS (SELECT 1 FROM alert a WHERE a.event_id = e.id)
			  ORDER BY e.id DESC
			  LIMIT $2`,
			[LATE_WINDOW_DAYS, lateLimit],
		);
		for (const row of pending.rows) {
			const id = Number(row.id);
			if (lateEvaluated.has(id)) continue;
			late++;
			alerts += await evaluateEvent(id, { corroboration });
			lateEvaluated.add(id);
			// Set conserve l'ordre d'insertion : on oublie les plus anciens.
			while (lateEvaluated.size > LATE_REMEMBERED) {
				const oldest = lateEvaluated.values().next();
				if (oldest.done) break;
				lateEvaluated.delete(oldest.value);
			}
		}
	}

	await saveState();

	return {
		events: fresh.rows.length,
		indicators: freshIndicators.rows.length,
		late,
		alerts,
		lastEventId: eventCursor ?? 0,
		lastIndicatorId: indicatorCursor ?? 0,
	};
}