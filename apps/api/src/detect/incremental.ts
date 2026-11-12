/**
 * Détection incrémentale — le chaînon qui manquait entre collecte et alerte.
 *
 * Problème résolu : `evaluateEvent` n'était appelé que depuis la promotion de
 * quarantaine. Tout ce qui entrait par les collecteurs, l'ingestion générique,
 * Hermes ou la route /ingest traversait sans être évalué. `evaluateAll` existe
 * mais balaie toute la base à chaque appel : inutilisable sur un tick.
 *
 * Principe : un curseur par nature (événement, indicateur), avancé par lots
 * bornés. Les insertions d'alertes sont idempotentes (`ON CONFLICT DO NOTHING`
 * dans le moteur), donc rejouer un lot ne coûte que du temps, jamais de
 * doublon. Aucune migration : l'état vit en mémoire et se reconstitue au
 * démarrage en reprenant les derniers identifiants.
 *
 * Deuxième passage, « rattrapage des rattachements tardifs » : un événement
 * collecté sans organisation, puis rattaché plus tard par `match-orgs`, doit
 * finir par produire son alerte. On rebalaie donc un lot borné d'événements
 * récents rattachés mais sans alerte.
 */
import { query } from "../db.js";
import { evaluateEvent, evaluateIndicator } from "./engine.js";

/** Lots par passage : assez pour absorber un tick de collecte, jamais la base. */
const DEFAULT_EVENT_LIMIT = Number(process.env.RADAR_DETECT_EVENT_LIMIT ?? 500);
const DEFAULT_INDICATOR_LIMIT = Number(process.env.RADAR_DETECT_INDICATOR_LIMIT ?? 1000);
/** Au démarrage, on reprend les N derniers identifiants (idempotent). */
const DEFAULT_CATCH_UP = Number(process.env.RADAR_DETECT_CATCH_UP ?? 500);
/** Fenêtre du rattrapage des rattachements tardifs. */
const LATE_WINDOW_DAYS = Number(process.env.RADAR_DETECT_LATE_DAYS ?? 7);
const LATE_LIMIT = Number(process.env.RADAR_DETECT_LATE_LIMIT ?? 200);

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

/** Remet les curseurs à zéro (tests, ou rejeu explicite). */
export function resetDetectionCursors(): void {
	eventCursor = null;
	indicatorCursor = null;
}

async function maxId(table: "event" | "indicator"): Promise<number> {
	const r = await query<{ m: string }>(`SELECT COALESCE(MAX(id),0)::text AS m FROM ${table}`);
	return Number(r.rows[0]?.m ?? 0);
}

/**
 * Corroboration : nombre de sources distinctes par organisation sur 30 jours.
 * Une seule requête par passage, partagée par tous les événements du lot.
 */
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
}): Promise<DetectionPass> {
	const eventLimit = opts?.eventLimit ?? DEFAULT_EVENT_LIMIT;
	const indicatorLimit = opts?.indicatorLimit ?? DEFAULT_INDICATOR_LIMIT;
	const catchUp = opts?.catchUp ?? DEFAULT_CATCH_UP;
	const lateLimit = opts?.lateLimit ?? LATE_LIMIT;

	if (eventCursor === null) eventCursor = Math.max(0, (await maxId("event")) - catchUp);
	if (indicatorCursor === null) indicatorCursor = Math.max(0, (await maxId("indicator")) - catchUp);

	const corroboration = await corroborationByOrg();
	let alerts = 0;

	const fresh = await query<{ id: number }>(
		"SELECT id FROM event WHERE id > $1 ORDER BY id LIMIT $2",
		[eventCursor, eventLimit],
	);
	for (const row of fresh.rows) {
		// event.id est un bigint : pg le rend en chaîne, on normalise ici.
		const id = Number(row.id);
		alerts += await evaluateEvent(id, { corroboration });
		eventCursor = Math.max(eventCursor ?? 0, id);
	}

	const freshIndicators = await query<{ id: number }>(
		"SELECT id FROM indicator WHERE id > $1 ORDER BY id LIMIT $2",
		[indicatorCursor, indicatorLimit],
	);
	for (const row of freshIndicators.rows) {
		const id = Number(row.id);
		alerts += await evaluateIndicator(id);
		indicatorCursor = Math.max(indicatorCursor ?? 0, id);
	}

	// Rattachements tardifs : l'événement a été évalué avant de connaître son
	// organisation. Sans ce passage, l'alerte n'arriverait jamais.
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
			late++;
			alerts += await evaluateEvent(Number(row.id), { corroboration });
		}
	}

	return {
		events: fresh.rows.length,
		indicators: freshIndicators.rows.length,
		late,
		alerts,
		lastEventId: eventCursor ?? 0,
		lastIndicatorId: indicatorCursor ?? 0,
	};
}
