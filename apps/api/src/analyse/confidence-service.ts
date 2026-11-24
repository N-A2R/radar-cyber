/**
 * Calcul et persistance des scores de confiance par fait.
 *
 * Regroupement déterministe : même famille, même organisation, même titre
 * normalisé, fenêtre glissante de 72 h. Rien n'est fusionné en base : les
 * événements restent distincts, et `fact_key` permet de compter les faits
 * corroborés par plusieurs sources sans détruire la trace de chaque source.
 *
 * Les scores sont recalculés par `scripts/compute-confidence-scores.mts`, puis
 * lus par l'API. Le calcul est pur à partir des lignes chargées, donc le même
 * jeu de données donne toujours les mêmes notes.
 */
import { createHash } from "node:crypto";
import { ingestQuery, withIngestTransaction } from "../db.js";
import {
	scoreConfidence,
	CONFIDENCE_REGLE_VERSION,
	type ConfidenceScore,
	type CorpusPresence,
	type DatePrecision,
	type FactSource,
	type ScoreOverrides,
	type SourceRank,
} from "./confidence-score.js";
import { corpusPresence, loadValidatedCorpus, type ValidatedCorpus } from "./validated-corpus.js";

/** Même fenêtre que le regroupement de corroboration déjà utilisé dans l'API. */
export const FACT_WINDOW_MS = 72 * 3_600_000;

/** Mêmes assertions que `/api/corpus/stats` : les indicateurs ne sont pas des incidents. */
const INCIDENT_ASSERTIONS: Record<string, true> = {
	confirmed_incident: true,
	third_party_claim: true,
};

/** Familles éditées par des producteurs directs (CERT, éditeurs de référence). */
const PRIMARY_FAMILIES: Record<string, true> = {
	cert: true,
	cert_fr: true,
	vuln: true,
	warninglist: true,
};

export type EventForScore = {
	id: number;
	family: string;
	assertionType: string;
	title: string;
	summary: string | null;
	observedAt: string | null;
	at: string;
	collectedAt: string;
	confidence: string | null;
	sourceId: string;
	sourceFamily: string;
	sourceName: string;
	sourceUrl: string | null;
	orgId: number | null;
	regional: boolean;
};

export type Fact = {
	key: string;
	family: string;
	orgId: number | null;
	title: string;
	events: EventForScore[];
	incident: boolean;
	start: string;
	end: string;
	sources: FactSource[];
	corpusPresence: CorpusPresence;
	score: ConfidenceScore;
};

export type ScoredEvent = {
	eventId: number;
	orgId: number | null;
	factKey: string;
	sourcesDistinct: number;
	score: ConfidenceScore;
};

export type ScoredAttachment = {
	eventId: number;
	orgId: number;
	factKey: string;
	sourcesDistinct: number;
	score: ConfidenceScore;
};

/** Score du fait lui-même, avant les surcharges propres à chaque source. */
export type FactScore = {
	factKey: string;
	family: string;
	orgId: number | null;
	title: string;
	start: string;
	end: string;
	sourcesDistinct: number;
	eventIds: number[];
	incident: boolean;
	score: ConfidenceScore;
};

export type ConfidenceBatch = {
	events: ScoredEvent[];
	attachments: ScoredAttachment[];
	facts: { total: number; corroborated: number; singleSource: number };
	factScores: FactScore[];
};

/**
 * Une source primaire : producteur direct (CERT, bulletin de vulnérabilité)
 * ou code Admiralty A1/A2. Les autres sont des relais — deux relais qui
 * recopient la même dépêche ne corroborent pas un fait, ils le répètent.
 */
export function sourceRank(event: EventForScore): SourceRank {
	const code = String(event.confidence ?? "").toUpperCase();
	return PRIMARY_FAMILIES[event.sourceFamily] === true || code === "A1" || code === "A2" ? "primary" : "secondary";
}

/** Date publiée, déduite du texte au-delà de sept jours, ou simple collecte. */
export function datePrecision(event: EventForScore, now: Date): DatePrecision {
	if (!event.observedAt) return "collection";
	const observed = new Date(event.observedAt).getTime();
	const learned = new Date(event.at).getTime();
	if (!Number.isFinite(observed) || !Number.isFinite(learned)) return "collection";
	return learned - observed > 7 * 24 * 3_600_000 ? "inferred" : "certain";
}

function titleKey(title: string): string {
	return title
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}
/** Clé courte mais sensible au titre entier : deux titres de même préfixe ne fusionnent pas. */
function cleTitre(titre: string): string {
	return createHash("sha256").update(titre, "utf8").digest("hex").slice(0, 24);
}

function eventTime(event: EventForScore): number {
	const value = new Date(event.observedAt ?? event.at).getTime();
	return Number.isFinite(value) ? value : 0;
}

/** Regroupe en faits, sans écraser le moindre événement. */
export function groupFacts(events: readonly EventForScore[], now: Date = new Date()): Fact[] {
	const corpus = loadValidatedCorpus();
	return groupFactsWithCorpus(events, corpus, now);
}

export function groupFactsWithCorpus(
	events: readonly EventForScore[],
	corpus: ValidatedCorpus,
	now: Date = new Date(),
): Fact[] {
	const ordered = [...events].sort((a, b) => eventTime(a) - eventTime(b) || a.id - b.id);
	type Group = { key: string; family: string; orgId: number | null; title: string; items: EventForScore[]; start: number };
	const groups: Group[] = [];
	// Le fait peut revenir après un autre fait : on garde le groupe ouvert par
	// clé, pas seulement le dernier groupe de la liste.
	const active = new Map<string, Group>();

	for (const event of ordered) {
		const time = eventTime(event);
		const title = titleKey(event.title) || `event-${event.id}`;
		const key = `${event.family}|${event.orgId ?? "na"}|${cleTitre(title)}`;
		const current = active.get(key);
		if (!current || time - current.start > FACT_WINDOW_MS) {
			const group: Group = { key, family: event.family, orgId: event.orgId, title: event.title, items: [event], start: time };
			groups.push(group);
			active.set(key, group);
		} else {
			current.items.push(event);
		}
	}

	return groups.map((group) => {
		const start = new Date(Math.min(...group.items.map(eventTime))).toISOString();
		const end = new Date(Math.max(...group.items.map(eventTime))).toISOString();
		const seen = new Map<string, FactSource>();
		for (const event of group.items) {
			if (seen.has(event.sourceId)) continue;
			seen.set(event.sourceId, {
				sourceId: event.sourceId,
				rank: sourceRank(event),
				date: event.observedAt ?? event.at,
				precision: datePrecision(event, now),
			});
		}
		const presences = group.items.map((event) => corpusPresence(event, corpus));
		const presence: CorpusPresence = presences.includes("exact")
			? "exact"
			: presences.includes("publisher")
				? "publisher"
				: "absent";
		return {
			key: `${group.key}|${start}`,
			family: group.family,
			orgId: group.orgId,
			title: group.title,
			events: group.items,
			incident: group.items.some((event) => INCIDENT_ASSERTIONS[event.assertionType] === true),
			start,
			end,
			sources: [...seen.values()],
			corpusPresence: presence,
			score: scoreConfidence(
				{ sources: [...seen.values()], start, end, corpusPresence: presence },
				{},
				now,
			),
		};
	});
}

function overridesFor(event: EventForScore, now: Date, corpus: ValidatedCorpus): ScoreOverrides {
	return {
		rank: sourceRank(event),
		precision: datePrecision(event, now),
		date: event.observedAt ?? event.at,
		corpusPresence: corpusPresence(event, corpus),
	};
}

/** Calcule les scores d'événements et de rattachements d'un jeu de lignes. */
export function computeConfidence(
	events: readonly EventForScore[],
	now: Date = new Date(),
	corpus: ValidatedCorpus = loadValidatedCorpus(),
): ConfidenceBatch {
	const facts = groupFactsWithCorpus(events, corpus, now);
	const scoredEvents: ScoredEvent[] = [];
	const scoredAttachments: ScoredAttachment[] = [];

	for (const fact of facts) {
		for (const event of fact.events) {
			const score = scoreConfidence(
				{
					sources: fact.sources,
					start: fact.start,
					end: fact.end,
					corpusPresence: fact.corpusPresence,
				},
				overridesFor(event, now, corpus),
				now,
			);
			const distinct = score.measures.independentSources;
			scoredEvents.push({ eventId: event.id, orgId: event.orgId, factKey: fact.key, sourcesDistinct: distinct, score });
			if (event.orgId != null) {
				scoredAttachments.push({
					eventId: event.id,
					orgId: event.orgId,
					factKey: fact.key,
					sourcesDistinct: distinct,
					score,
				});
			}
		}
	}

	return {
		events: scoredEvents,
		attachments: scoredAttachments,
		facts: {
			total: facts.length,
			corroborated: facts.filter((f) => f.sources.length >= 2).length,
			singleSource: facts.filter((f) => f.sources.length === 1).length,
		},
		factScores: facts.map((fact) => ({
			factKey: fact.key,
			family: fact.family,
			orgId: fact.orgId,
			title: fact.title,
			start: fact.start,
			end: fact.end,
			sourcesDistinct: fact.sources.length,
			eventIds: fact.events.map((event) => event.id),
			incident: fact.incident,
			score: fact.score,
		})),
	};
}

/** Charge les événements avec ce qu'il faut pour expliquer chaque composante. */
export async function loadEvents(ids?: readonly number[]): Promise<EventForScore[]> {
	const sql = `SELECT e.id, e.family, e.assertion_type AS "assertionType", e.title, e.summary,
		e.observed_at AS "observedAt", e.at, e.collected_at AS "collectedAt", e.confidence,
		e.source_id AS "sourceId", s.family AS "sourceFamily", s.name AS "sourceName",
		e.source_url AS "sourceUrl", e.org_id AS "orgId", e.regional
		FROM event e JOIN source s ON s.id = e.source_id
		${ids ? 'WHERE e.id = ANY($1::bigint[])' : ''}
		ORDER BY e.id`;
	const result = await ingestQuery<EventForScore>(sql, ids ? [[...ids]] : []);
	return result.rows.map((row) => ({
		...row,
		id: Number(row.id),
		orgId: row.orgId === null ? null : Number(row.orgId),
		regional: Boolean(row.regional),
	}));
}

const CHUNK = 500;

type ConfidenceRunner = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

async function upsertEvents(run: ConfidenceRunner, rows: readonly ScoredEvent[]): Promise<void> {
	for (let offset = 0; offset < rows.length; offset += CHUNK) {
		const chunk = rows.slice(offset, offset + CHUNK);
		const params: unknown[] = [];
		const values = chunk.map((row) => {
			const i = params.length;
			params.push(
				row.eventId, row.factKey, row.score.score, row.score.level, row.sourcesDistinct,
				JSON.stringify(row.score.components), JSON.stringify(row.score.breakdown), JSON.stringify(row.score.measures),
				CONFIDENCE_REGLE_VERSION,
			);
			return `($${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6}::jsonb,$${i + 7}::jsonb,$${i + 8}::jsonb,$${i + 9})`;
		});
		await run(
			`INSERT INTO event_confidence
				(event_id, fact_key, score, level, sources_distinct, components, breakdown, measures, regle_version)
			 VALUES ${values.join(",")}
			 ON CONFLICT (event_id) DO UPDATE SET
				fact_key = EXCLUDED.fact_key, score = EXCLUDED.score, level = EXCLUDED.level,
				sources_distinct = EXCLUDED.sources_distinct, components = EXCLUDED.components,
				breakdown = EXCLUDED.breakdown, measures = EXCLUDED.measures,
				regle_version = EXCLUDED.regle_version, computed_at = now()`,
			params,
		);
	}
}

async function upsertAttachments(run: ConfidenceRunner, rows: readonly ScoredAttachment[]): Promise<void> {
	for (let offset = 0; offset < rows.length; offset += CHUNK) {
		const chunk = rows.slice(offset, offset + CHUNK);
		const params: unknown[] = [];
		const values = chunk.map((row) => {
			const i = params.length;
			params.push(
				row.eventId, row.orgId, row.factKey, row.score.score, row.score.level, row.sourcesDistinct,
				JSON.stringify(row.score.components), JSON.stringify(row.score.breakdown), JSON.stringify(row.score.measures),
				CONFIDENCE_REGLE_VERSION,
			);
			return `($${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7}::jsonb,$${i + 8}::jsonb,$${i + 9}::jsonb,$${i + 10})`;
		});
		await run(
			`INSERT INTO attachment_confidence
				(event_id, org_id, fact_key, score, level, sources_distinct, components, breakdown, measures, regle_version)
			 VALUES ${values.join(",")}
			 ON CONFLICT (event_id, org_id) DO UPDATE SET
				fact_key = EXCLUDED.fact_key, score = EXCLUDED.score, level = EXCLUDED.level,
				sources_distinct = EXCLUDED.sources_distinct, components = EXCLUDED.components,
				breakdown = EXCLUDED.breakdown, measures = EXCLUDED.measures,
				regle_version = EXCLUDED.regle_version, computed_at = now()`,
			params,
		);
	}
}

/** Écrit les deux projections dans une seule transaction : jamais l'une sans l'autre. */
export async function persistConfidence(batch: ConfidenceBatch): Promise<void> {
	await withIngestTransaction(async (client) => {
		const run: ConfidenceRunner = (text, params) => client.query(text, params);
		await upsertEvents(run, batch.events);
		await upsertAttachments(run, batch.attachments);
	});
}
