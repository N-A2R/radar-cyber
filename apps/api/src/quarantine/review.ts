/**
 * File de revue de la quarantaine — sélection priorisée et décisions groupées.
 *
 * La route `/quarantine` existante rend les faits par date d'arrivée. Utile pour
 * un journal, inutilisable pour trier 16 235 faits : rien ne dit lequel ouvrir.
 * Ce module produit une file **ordonnée par enjeu**, avec la trace du calcul,
 * et permet d'appliquer une décision à une sélection entière.
 *
 * Choix assumé, faute de migration autorisée : la trace de revue (auteur, date,
 * décision, motif) est déposée dans `extracted` sous la clé réservée `_review`.
 * Elle n'est jamais renvoyée telle quelle dans `extracted` — la route l'expose
 * à part. Une table dédiée serait plus propre ; ce sera le jour où les
 * migrations rentreront dans le périmètre.
 *
 * La promotion réutilise `promoteOne` : mêmes règles, même événement, même
 * évaluation d'alertes. Ce module ne réinvente pas la sortie de quarantaine.
 */
import type { PoolClient } from "pg";
import { query, withClient, withTransaction } from "../db.js";
import { buildAliasIndex, analyzeAliasIndex, type AliasRow } from "../match/core.js";
import { loadOrgIndex, matchOrgInIndex, promoteOne, promoteOneTx, type OrgIndexEntry } from "./promote.js";
import { evaluateEvent } from "../detect/engine.js";
import { consignerLot, type JournalEntry } from "../journal/index.js";
import { buildCandidateIndex, candidatesFor } from "./candidates.js";
import { compareQueueEntries, triageClaim, type TriageBucket, type TriageResult } from "./triage.js";

export type ReviewAction = "promote" | "reject" | "review" | "undo";

export type ReviewEntry = {
	at: string;
	by: string;
	action: ReviewAction;
	reason: string | null;
};

export type QueueParams = {
	status?: string | null;
	bucket?: TriageBucket | null;
	source?: string | null;
	groupe?: string | null;
	q?: string | null;
	page?: number;
	limit?: number;
	window?: number;
};

export type QueueRow = {
	id: number;
	source: string;
	sourceUrl: string;
	groupe: string | null;
	orgHint: string | null;
	claimedAt: string | null;
	receivedAt: string;
	tlp: string;
	status: string;
	promoted: boolean;
	promotedBy: string | null;
	promotedAt: string | null;
	hasDescription: boolean;
	triage: TriageResult;
	org: { id: number; name: string; kind: string; city: string | null } | null;
	orgConfidence: number | null;
	review: ReviewEntry[];
};

export type QueueFacet = { value: string; count: number };

export type QueueResult = {
	rows: QueueRow[];
	total: number;
	page: number;
	limit: number;
	/** Nombre de faits examinés pour construire la file. */
	window: number;
	/** Le stock dépasse la fenêtre : la file ne couvre pas tout. */
	truncated: boolean;
	facets: { source: QueueFacet[]; groupe: QueueFacet[]; bucket: QueueFacet[]; status: QueueFacet[] };
	counts: { pending: number; reviewed: number; rejected: number; promoted: number };
	tookMs: number;
};

const DEFAULT_WINDOW = Number(process.env.RADAR_REVIEW_WINDOW ?? 2000);
const MAX_WINDOW = 10000;
const MAX_LIMIT = 200;
const REVIEW_KEY = "_review";

type RawRow = {
	id: number;
	source: string;
	source_url: string;
	groupe: string | null;
	org_hint: string | null;
	claimed_at: Date | string | null;
	received_at: Date | string;
	tlp: string;
	status: string;
	promoted: boolean;
	promoted_by: string | null;
	promoted_at: Date | string | null;
	description: string | null;
	review: ReviewEntry[] | null;
};

function iso(value: Date | string | null): string | null {
	if (value === null) return null;
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function facetOf(values: Iterable<string | null>): QueueFacet[] {
	const counts = new Map<string, number>();
	for (const value of values) {
		if (!value) continue;
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "fr"));
}

/** Index d'alias du référentiel, second avis sur le rattachement. */
async function loadSecondOpinionIndex() {
	const r = await query<AliasRow>(
		`SELECT a.org_id, o.name, a.alias
		   FROM org_alias a JOIN org o ON o.id = a.org_id
		  WHERE o.status = 'confirme'`,
	);
	return buildAliasIndex(r.rows);
}

export async function reviewQueue(params: QueueParams = {}): Promise<QueueResult> {
	const started = performance.now();
	const limit = Math.min(MAX_LIMIT, Math.max(1, params.limit ?? 50));
	const page = Math.max(0, params.page ?? 0);
	const window = Math.min(MAX_WINDOW, Math.max(limit, params.window ?? DEFAULT_WINDOW));

	const clauses = ["promoted = false"];
	const values: unknown[] = [];
	const add = (clause: string, value: unknown) => {
		values.push(value);
		clauses.push(clause.replace("?", `$${values.length}`));
	};
	if (params.status) add("status = ?", params.status);
	else clauses.push("status IN ('pending','reviewed')");
	if (params.source) add("source = ?", params.source);
	if (params.groupe) add("groupe = ?", params.groupe);
	const search = (params.q ?? "").trim();
	if (search) {
		values.push(`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
		clauses.push(`(org_hint ILIKE $${values.length} OR groupe ILIKE $${values.length})`);
	}
	values.push(window + 1);

	const [raw, orgIndex, aliasIndex, countsRaw] = await Promise.all([
		query<RawRow>(
			`SELECT id, source, source_url, groupe, org_hint, claimed_at, received_at, tlp, status,
			        promoted, promoted_by, promoted_at,
			        NULLIF(extracted->>'description', '') AS description,
			        (extracted->'${REVIEW_KEY}') AS review
			   FROM quarantine_raw
			  WHERE ${clauses.join(" AND ")}
			  ORDER BY received_at DESC, id DESC
			  LIMIT $${values.length}`,
			values,
		),
		loadOrgIndex(),
		loadSecondOpinionIndex(),
		query<{ status: string; promoted: boolean; n: string }>(
			"SELECT status, promoted, count(*)::text AS n FROM quarantine_raw GROUP BY status, promoted",
		),
	]);

	const truncated = raw.rows.length > window;
	const candidates = buildCandidateIndex(orgIndex);
	const orgById = new Map<number, OrgIndexEntry>(orgIndex.map((entry) => [entry.id, entry]));
	const now = new Date();

	const scored: QueueRow[] = raw.rows.slice(0, window).map((row) => {
		const hint = row.org_hint ?? "";
		const primary = matchOrgInIndex(hint, candidatesFor(hint, candidates));
		const second = analyzeAliasIndex(aliasIndex, hint);
		const secondary = second.match ? { orgId: second.match.orgId, confidence: second.match.confidence } : null;
		const triage = triageClaim(
			{
				orgHint: row.org_hint,
				groupe: row.groupe,
				claimedAt: iso(row.claimed_at),
				receivedAt: iso(row.received_at),
				tlp: row.tlp,
				hasDescription: Boolean(row.description),
				source: row.source,
			},
			primary,
			secondary,
			now,
		);
		const org = primary ? orgById.get(primary.orgId) ?? null : null;
		return {
			id: Number(row.id),
			source: row.source,
			sourceUrl: row.source_url,
			groupe: row.groupe,
			orgHint: row.org_hint,
			claimedAt: iso(row.claimed_at),
			receivedAt: iso(row.received_at) ?? new Date(0).toISOString(),
			tlp: row.tlp,
			status: row.status,
			promoted: row.promoted,
			promotedBy: row.promoted_by,
			promotedAt: iso(row.promoted_at),
			hasDescription: Boolean(row.description),
			triage,
			org: org ? { id: org.id, name: org.name, kind: org.kind, city: org.city } : null,
			orgConfidence: primary?.confidence ?? null,
			review: Array.isArray(row.review) ? row.review : [],
		};
	});

	const filtered = params.bucket ? scored.filter((row) => row.triage.bucket === params.bucket) : scored;
	filtered.sort((a, b) => compareQueueEntries({
		score: a.triage.score, claimedAt: a.claimedAt, id: a.id,
	}, {
		score: b.triage.score, claimedAt: b.claimedAt, id: b.id,
	}));

	const counts = { pending: 0, reviewed: 0, rejected: 0, promoted: 0 };
	for (const row of countsRaw.rows) {
		const n = Number(row.n);
		if (row.promoted) counts.promoted += n;
		else if (row.status === "pending") counts.pending += n;
		else if (row.status === "reviewed") counts.reviewed += n;
		else if (row.status === "rejected") counts.rejected += n;
	}

	return {
		rows: filtered.slice(page * limit, page * limit + limit),
		total: filtered.length,
		page,
		limit,
		window: Math.min(raw.rows.length, window),
		truncated,
		facets: {
			source: facetOf(scored.map((row) => row.source)),
			groupe: facetOf(scored.map((row) => row.groupe)),
			bucket: facetOf(scored.map((row) => row.triage.bucket)),
			status: facetOf(scored.map((row) => row.status)),
		},
		counts,
		tookMs: Number((performance.now() - started).toFixed(1)),
	};
}

export type ReviewOutcome = {
	action: ReviewAction;
	requested: number;
	changed: number;
	promoted: number;
	alerts: number;
	skipped: Array<{ id: number; reason: string }>;
};

const STATUS_FOR: Record<Exclude<ReviewAction, "promote">, string> = {
	reject: "rejected",
	review: "reviewed",
	undo: "pending",
};

/**
 * Décision d'analyste sur une sélection. Idempotent : rejouer la même décision
 * ne casse rien, et un fait déjà promu n'est jamais dé-promeu ici — défaire une
 * promotion impliquerait de retirer l'événement public, ce qui n'est pas une
 * opération de file de revue.
 */
export async function applyReview(
	ids: readonly number[],
	action: ReviewAction,
	reason: string | null,
	actor: string,
): Promise<ReviewOutcome> {
	const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
	const outcome: ReviewOutcome = {
		action, requested: unique.length, changed: 0, promoted: 0, alerts: 0, skipped: [],
	};
	if (unique.length === 0) return outcome;

	const entry: ReviewEntry = { at: new Date().toISOString(), by: actor, action, reason };

	if (action === "promote") {
		for (const id of unique) {
			// Promotion + décision de revue dans la même transaction : une décision
			// ne peut pas exister sans la promotion qu'elle prétend justifier.
			const result = await withTransaction(async (client) => {
				const r = await promoteOneTx(client, id, actor);
				if (!r.found) {
					outcome.skipped.push({ id, reason: "introuvable" });
					return null;
				}
				if (r.alreadyPromoted) {
					outcome.skipped.push({ id, reason: "déjà promu" });
					return null;
				}
				await appendReview(id, entry, client);
				return r;
			});
			if (result === null) continue;
			outcome.changed++;
			outcome.promoted++;
			// Après COMMIT : l'évaluation ouvre une autre connexion et doit voir l'événement.
			outcome.alerts += result.inserted && result.eventId !== null
				? await evaluateEvent(result.eventId, { force: true })
				: 0;
		}
		return outcome;
	}

	const status = STATUS_FOR[action];
	const faits: JournalEntry[] = [];
	await withClient(async (client) => {
		await client.query("BEGIN");
		try {
			for (const id of unique) {
				const guard = action === "undo"
					? "promoted = false AND status IN ('rejected','reviewed')"
					: "promoted = false";
				const r = await client.query(
					`UPDATE quarantine_raw
					    SET status = $2,
					        extracted = jsonb_set(
					          COALESCE(extracted, '{}'::jsonb),
					          '{${REVIEW_KEY}}',
					          COALESCE(extracted->'${REVIEW_KEY}', '[]'::jsonb) || $3::jsonb
					        )
					  WHERE id = $1 AND ${guard}`,
					[id, status, JSON.stringify([entry])],
				);
				if ((r.rowCount ?? 0) > 0) {
					outcome.changed++;
					// Décision humaine : elle était écrasée par la suivante. Ici elle
					// reste, avec son auteur, son motif et sa date.
					faits.push({
						kind: "review.decided",
						subject: `quarantine:${id}`,
						summary: `${action} par ${actor}${reason ? ` — ${reason}` : ""}`,
						actor: `humain:${actor}`,
						payload: { action, reason, statutApplique: status, entry },
					});
				} else outcome.skipped.push({ id, reason: action === "undo" ? "non annulable" : "déjà promu ou introuvable" });
			}
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}
	});
	if (faits.length > 0) {
		try {
			await consignerLot(faits);
		} catch {
			// Une lacune de journal est visible ; une revue perdue ne l'est pas.
		}
	}
	return outcome;
}

async function appendReview(id: number, entry: ReviewEntry, client?: PoolClient): Promise<void> {
	const run = client
		? (text: string, params?: unknown[]) => client.query(text, params)
		: query;
	await run(
		`UPDATE quarantine_raw
		    SET extracted = jsonb_set(
		          COALESCE(extracted, '{}'::jsonb),
		          '{${REVIEW_KEY}}',
		          COALESCE(extracted->'${REVIEW_KEY}', '[]'::jsonb) || $2::jsonb
		        )
		  WHERE id = $1`,
		[id, JSON.stringify([entry])],
	);
}
