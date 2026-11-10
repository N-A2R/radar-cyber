#!/usr/bin/env -S npx tsx
/**
 * Rattachement des événements aux organisations via `org_alias`.
 *
 * Usage :
 *   npx tsx scripts/match-orgs.mts [--dry-run] [--apply] [--limit=N] [--min-confidence=0.7]
 *
 *   --dry-run         affiche ce qui serait rattaché, sans écrire (défaut)
 *   --apply           écrit `event.org_id` pour les correspondances retenues
 *   --limit=N         plafonne le nombre d'événements examinés
 *   --min-confidence  seuil d'application d'un match (défaut : 0.7)
 *
 * Un `org_id` déjà renseigné n'est jamais écrasé : la requête de sélection
 * filtre `org_id IS NULL` et l'UPDATE la répète dans son WHERE.
 *
 * Les alias de ville (`limoges`, `bordeaux`, …) et les alias courts sans
 * contexte institutionnel sont rejetés en amont par `matchOrg` : ils ne
 * figurent jamais parmi les candidats.
 *
 * Prérequis : db/migrate-014-org-alias.sql et db/migrate-016-org-alias-fix.sql
 * appliquées.
 */

import { closePools, pool } from "../apps/api/src/db.js";
import { matchOrgDetailed, normalize, type MatchReason } from "../apps/api/src/match/orgs.js";

type EventRow = { id: string; title: string; summary: string | null };

type Candidate = {
	id: string;
	title: string;
	orgId: number;
	orgName: string;
	alias: string;
	confidence: number;
};

type Counts = { total: number; attached: number; orgs: number };

const log = (msg: string): void => console.log(`[match] ${msg}`);

function usage(): never {
	console.error(
		"usage : npx tsx scripts/match-orgs.mts [--dry-run] [--apply] [--limit=N] [--min-confidence=0.7]",
	);
	process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) usage();

const apply = args.includes("--apply");
const dryRun = !apply || args.includes("--dry-run");

let limit: number | undefined;
const limitArg = args.find((arg) => arg.startsWith("--limit="));
if (limitArg) {
	const raw = limitArg.slice("--limit=".length);
	limit = Number(raw);
	if (!Number.isInteger(limit) || limit <= 0) {
		console.error(`--limit invalide : « ${raw} » (entier positif attendu)`);
		process.exit(1);
	}
}

let minConfidence = 0.7;
const confidenceArg = args.find((arg) => arg.startsWith("--min-confidence="));
if (confidenceArg) {
	const raw = confidenceArg.slice("--min-confidence=".length);
	minConfidence = Number(raw);
	if (!Number.isFinite(minConfidence) || minConfidence <= 0 || minConfidence > 1) {
		console.error(`--min-confidence invalide : « ${raw} » (nombre dans ]0, 1] attendu)`);
		process.exit(1);
	}
}

async function counts(): Promise<Counts> {
	const { rows } = await pool.query<{ total: string; attached: string; orgs: string }>(
		"SELECT count(*)::text AS total, count(org_id)::text AS attached, count(DISTINCT org_id)::text AS orgs FROM event",
	);
	const row = rows[0];
	return { total: Number(row.total), attached: Number(row.attached), orgs: Number(row.orgs) };
}

async function main(): Promise<void> {
	const { rows: aliasRows } = await pool.query<{ active: string; rejected: string }>(
		`SELECT count(*) FILTER (WHERE status = 'active')::text AS active,
		        count(*) FILTER (WHERE status <> 'active')::text AS rejected
		   FROM org_alias`,
	);
	const activeAliases = Number(aliasRows[0].active);
	if (activeAliases === 0) {
		log("aucun alias actif en base : appliquer db/migrate-014-org-alias.sql et db/migrate-016-org-alias-fix.sql");
		return;
	}
	log(`${activeAliases} alias actifs (${aliasRows[0].rejected} rejeté(s) en base), seuil ${minConfidence}`);

	const before = await counts();
	log(
		`avant : ${before.attached}/${before.total} événements rattachés (${before.orgs} organisation(s))` +
			(dryRun ? " — dry-run, aucune écriture" : " — application"),
	);

	const { rows: events } = await pool.query<EventRow>(
		`SELECT id::text AS id, title, summary
		   FROM event
		  WHERE org_id IS NULL
		  ORDER BY observed_at DESC NULLS LAST, id DESC
		  LIMIT $1`,
		[limit ?? null],
	);
	log(`${events.length} événement(s) sans organisation examiné(s)`);

	const candidates: Candidate[] = [];
	let belowThreshold = 0;
	// Motif de rejet : sans lui, on ne sait pas s'il faut ajouter un alias,
	// lever une ambiguïté ou accepter que le texte ne nomme personne.
	const reasons: Record<MatchReason | "below-threshold", number> = {
		matched: 0,
		"empty-text": 0,
		"no-alias": 0,
		"short-only": 0,
		ambiguous: 0,
		"below-threshold": 0,
	};
	for (const event of events) {
		const text = `${event.title} ${event.summary ?? ""}`;
		const { match, reason } = await matchOrgDetailed(text);
		if (!match) {
			reasons[reason] += 1;
			continue;
		}
		if (match.confidence < minConfidence) {
			belowThreshold += 1;
			reasons["below-threshold"] += 1;
			continue;
		}
		reasons.matched += 1;
		candidates.push({
			id: event.id,
			title: event.title,
			orgId: match.orgId,
			orgName: "",
			alias: match.alias,
			confidence: match.confidence,
		});
	}

	const orgIds = [...new Set(candidates.map((candidate) => candidate.orgId))];
	if (orgIds.length > 0) {
		const { rows: names } = await pool.query<{ id: number; name: string }>(
			"SELECT id, name FROM org WHERE id = ANY($1::int[])",
			[orgIds],
		);
		const byId = new Map(names.map((row) => [row.id, row.name]));
		for (const candidate of candidates) candidate.orgName = byId.get(candidate.orgId) ?? `#${candidate.orgId}`;
	}

	log("motifs sur les événements examinés :");
	for (const [reason, count] of Object.entries(reasons)) {
		if (count > 0) log(`  ${reason.padEnd(16)} ${count}`);
	}
	log(
		`${candidates.length} événement(s) rattachable(s) vers ${new Set(candidates.map((c) => c.orgId)).size} organisation(s)` +
			` — ${belowThreshold} écarté(s) sous le seuil ${minConfidence}`,
	);

	// Échantillon régulier : 30 lignes réparties sur l'ensemble des candidats,
	// pour le contrôle humain demandé par le roadmap.
	const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
	const step = Math.max(1, Math.floor(sorted.length / 30));
	const sample = sorted.filter((_, index) => index % step === 0).slice(0, 30);
	if (sample.length > 0) {
		log("échantillon de 30 rattachements pour contrôle humain :");
		for (const candidate of sample) {
			log(
				`  ${candidate.id.padStart(6)}  conf=${candidate.confidence.toFixed(1)}  ` +
					`${candidate.orgName} (alias « ${normalize(candidate.alias)} ») ← ${candidate.title.slice(0, 90)}`,
			);
		}
	}

	if (dryRun || candidates.length === 0) {
		log("dry-run : aucune écriture");
		return;
	}

	const client = await pool.connect();
	let updated = 0;
	try {
		await client.query("BEGIN");
		for (const candidate of candidates) {
			const res = await client.query(
				"UPDATE event SET org_id = $1 WHERE id = $2 AND org_id IS NULL",
				[candidate.orgId, candidate.id],
			);
			updated += res.rowCount ?? 0;
		}
		await client.query("COMMIT");
	} catch (err) {
		await client.query("ROLLBACK");
		throw err;
	} finally {
		client.release();
	}

	const after = await counts();
	log(
		`après : ${after.attached}/${after.total} événements rattachés (${after.orgs} organisation(s)) ` +
			`— ${updated} ligne(s) mise(s) à jour, ${after.attached - before.attached} rattachement(s) net(s)`,
	);
}

try {
	await main();
} finally {
	await closePools();
}
