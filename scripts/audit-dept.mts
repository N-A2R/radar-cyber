/**
 * Audit de la règle (b) « un département cité est admis » — mesure des faux
 * positifs d'homonymie (Vienne la ville/rivière, Lot le fleuve, etc.).
 *
 * Principe : on rejoue la porte de pertinence RÉELLE (`isRelevant`, orgs
 * chargées depuis la table `org`, domaine du flux ignoré comme en production)
 * sur les items déjà en base, on ne garde que ceux qu'elle REJETTE, puis on
 * applique la règle département à ce lot. Les items retenus par la règle mais
 * sans aucun terme cyber sont, par construction, les faux positifs qu'elle
 * introduit.
 *
 * Lecture seule : uniquement des SELECT. Aucune écriture, aucune collecte,
 * aucun appel réseau.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/audit-dept.mts
 *   apps/api/node_modules/.bin/tsx scripts/audit-dept.mts --limit=400 --show=20
 *   apps/api/node_modules/.bin/tsx scripts/audit-dept.mts --json
 */
import { query, closePools } from "../apps/api/src/db.js";
import {
	DEPT_LABELS,
	PREFECTURES,
	admitsDepartment,
	isRelevant,
	loadRelevanceOrgIndex,
	normalizeMatchText,
	type RelevanceOrg,
} from "../apps/api/src/collectors/relevance.js";

// --------------------------------------------------------------------------
// Options
// --------------------------------------------------------------------------

interface Options {
	limit: number;
	show: number;
	json: boolean;
}

function parseArgs(argv: string[]): Options {
	const opts: Options = { limit: 400, show: 20, json: false };
	for (const arg of argv) {
		const [key, value = ""] = arg.split("=", 2);
		if (key === "--limit") opts.limit = Math.max(1, Number(value) || 400);
		else if (key === "--show") opts.show = Math.max(0, Number(value) || 20);
		else if (key === "--json") opts.json = true;
	}
	return opts;
}

// --------------------------------------------------------------------------
// Données
// --------------------------------------------------------------------------

interface Candidate {
	id: number;
	title: string;
	summary: string;
	sourceUrl: string;
	sourceId: string;
}

/** Hôte d'une URL, sans www. — sert d'`ignoreDomains` comme en production. */
function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return "";
	}
}

async function loadCandidates(limit: number): Promise<{ scanned: number; rejected: Candidate[] }> {
	const { rows } = await query<Candidate>(
		`SELECT id, coalesce(title, '') AS title, coalesce(summary, '') AS summary,
		        coalesce(source_url, '') AS "sourceUrl", source_id AS "sourceId"
		   FROM event
		  WHERE source_id NOT LIKE 'epss%'
		  ORDER BY id`
	);
	const orgs: RelevanceOrg[] = loadRelevanceOrgIndex(
		(
			await query<{ name: string; slug: string | null; domain: string | null }>(
				"SELECT name, slug, domain FROM org"
			)
		).rows
	);
	const rejected: Candidate[] = [];
	for (const row of rows) {
		const ignore = hostOf(row.sourceUrl);
		const verdict = isRelevant(
			{ title: row.title, summary: row.summary, url: row.sourceUrl },
			{ orgs, ignoreDomains: ignore ? [ignore] : [] }
		);
		if (verdict.relevant) continue;
		rejected.push(row);
		if (rejected.length >= limit) break;
	}
	return { scanned: rows.length, rejected };
}

/** Départements réellement présents en base + préfectures (comme `generic.ts`). */
async function loadDeptNames(): Promise<string[]> {
	const { rows } = await query<{ dept: string }>(
		"SELECT DISTINCT dept FROM org WHERE dept IS NOT NULL"
	);
	const names = new Set<string>();
	for (const row of rows) {
		const label = DEPT_LABELS[row.dept];
		if (label) names.add(label);
	}
	for (const prefecture of PREFECTURES) names.add(prefecture);
	return [...names];
}

// --------------------------------------------------------------------------
// Mesure
// --------------------------------------------------------------------------

/** Homonymes connus à recenser, indépendamment de la liste de départements. */
const HOMONYMS: readonly string[] = ["vienne", "lot", "pau", "dax", "saintes", "niort"];

/** Composite non ambigu : « lot-et-garonne » ne compte pas comme « lot » seul. */
const COMPOSITES: readonly string[] = [
	"lot-et-garonne",
	"charente-maritime",
	"deux-sevres",
	"haute-vienne",
	"pyrenees-atlantiques",
];

interface HomonymHit {
	term: string;
	count: number;
	samples: string[];
}

function censusHomonyms(items: Candidate[]): HomonymHit[] {
	const hits: HomonymHit[] = [];
	for (const term of HOMONYMS) {
		const re = new RegExp(`(?<![\\p{L}\\p{N}])${term}(?![\\p{L}\\p{N}])`, "gu");
		let count = 0;
		const samples: string[] = [];
		for (const item of items) {
			const hay = normalizeMatchText(`${item.title} ${item.summary}`);
			let stripped = hay;
			for (const composite of COMPOSITES) stripped = stripped.split(composite).join(" ");
			if (!re.test(stripped)) {
				re.lastIndex = 0;
				continue;
			}
			re.lastIndex = 0;
			count += 1;
			if (samples.length < 3) samples.push(item.title.slice(0, 110));
		}
		hits.push({ term, count, samples });
	}
	return hits;
}

function snippetAround(text: string, term: string): string {
	const hay = normalizeMatchText(text);
	const at = hay.indexOf(term);
	if (at < 0) return hay.slice(0, 90);
	return hay.slice(Math.max(0, at - 45), Math.min(hay.length, at + term.length + 45));
}

async function main(): Promise<void> {
	const opts = parseArgs(process.argv.slice(2));
	const [deptNames, pool] = await Promise.all([loadDeptNames(), loadCandidates(opts.limit)]);
	if (pool.rejected.length < opts.limit) {
		console.warn(
			`attention : seulement ${pool.rejected.length} item(s) rejeté(s) sur ${pool.scanned} scanné(s)`
		);
	}

	interface Admitted {
		id: number;
		title: string;
		sourceId: string;
		context: string;
	}

	const admitted: Admitted[] = [];
	for (const item of pool.rejected) {
		const text = `${item.title} ${item.summary}`;
		if (!admitsDepartment(text, deptNames)) continue;
		const term = HOMONYMS.find((h) => snippetAround(text, h).includes(h)) ?? "";
		admitted.push({
			id: item.id,
			title: item.title.slice(0, 140),
			sourceId: item.sourceId,
			context: term ? snippetAround(text, term) : normalizeMatchText(text).slice(0, 90),
		});
	}

	const homonyms = censusHomonyms(
		admitted.map((a) => ({ id: a.id, title: a.title, summary: "", sourceUrl: "", sourceId: a.sourceId }))
	);

	if (opts.json) {
		console.log(
			JSON.stringify(
				{
					scanned: pool.scanned,
					rejected: pool.rejected.length,
					limit: opts.limit,
					admitted: admitted.length,
					deptNames: deptNames.length,
					homonyms,
					items: admitted,
				},
				null,
				2
			)
		);
		await closePools();
		return;
	}

	console.log(`items scannés           : ${pool.scanned}`);
	console.log(`rejetés par isRelevant  : ${pool.rejected.length}`);
	console.log(`lieux surveillés        : ${deptNames.length}`);
	console.log(`admis par la règle dept : ${admitted.length}/${pool.rejected.length}`);
	console.log("");
	console.log("homonymes dans les items admis :");
	for (const h of homonyms) {
		console.log(`  ${h.term.padEnd(8)} ${String(h.count).padStart(4)}`);
		for (const s of h.samples) console.log(`    - ${s}`);
	}
	console.log("");
	console.log(`--- ${Math.min(opts.show, admitted.length)} premiers admis ---`);
	admitted.slice(0, opts.show).forEach((a, i) => {
		console.log(`${String(i + 1).padStart(2)}. [${a.sourceId}] ${a.title}`);
		console.log(`    …${a.context}…`);
	});

	await closePools();
}

main().catch(async (err: unknown) => {
	console.error(err);
	await closePools().catch(() => undefined);
	process.exitCode = 1;
});
