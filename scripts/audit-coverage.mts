/**
 * Mesure de la couverture élargie (règles (a) EPSS et (b) département).
 *
 * Rejoue la porte de pertinence réelle (`isRelevant`, importée de
 * `collectors/relevance.ts`) sur un échantillon de sources `ok_but_empty`,
 * puis compte, pour chaque item rejeté aujourd'hui :
 *   - combien passeraient par la règle (a) : CVE dont le score EPSS (joint en
 *     base sur `event.source_id = 'epss'`, aucun appel réseau) dépasse le seuil ;
 *   - combien passeraient par la règle (b) : un département de Nouvelle-Aquitaine
 *     ou une préfecture est cité en mot entier dans titre ou résumé (jamais l'URL) ;
 *   - combien cumulent les deux.
 *
 * --epss-sweep balaie plusieurs seuils sur les CVE 2025-2026 et mesure la
 * précision (part des items admis qui contiennent un terme cyber) pour justifier
 * le seuil retenu.
 *
 * Lecture seule : uniquement des SELECT. Aucune écriture, aucune collecte.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/audit-coverage.mts
 *   apps/api/node_modules/.bin/tsx scripts/audit-coverage.mts --limit=12
 *   apps/api/node_modules/.bin/tsx scripts/audit-coverage.mts --sources=a,b,c
 *   apps/api/node_modules/.bin/tsx scripts/audit-coverage.mts --epss-sweep
 *   apps/api/node_modules/.bin/tsx scripts/audit-coverage.mts --json
 */
import { query, closePools } from "../apps/api/src/db.js";
import { detectItems } from "../apps/api/src/collectors/generic.js";
import {
	DEPT_LABELS,
	PREFECTURES,
	admitsDepartment,
	admitByEpss,
	extractCveIds,
	type CoverageContext,
} from "../apps/api/src/collectors/relevance.js";
import { isRelevant, type RelevanceOrg } from "../apps/api/src/collectors/relevance.js";
import { isCyberText } from "../apps/api/src/collectors/classify.js";

// --------------------------------------------------------------------------
// Options
// --------------------------------------------------------------------------
interface Options {
	limit: number;
	sources: string[] | null;
	sweep: boolean;
	json: boolean;
	/** Justification du seuil : scores EPSS live (jamais utilisés par la règle en production). */
	liveEpss: boolean;
}

function parseArgs(argv: string[]): Options {
	const opts: Options = { limit: 12, sources: null, sweep: false, json: false, liveEpss: false };
	for (const arg of argv) {
		const [key, value = ""] = arg.split("=", 2);
		if (key === "--limit") opts.limit = Math.max(1, Number(value) || 12);
		else if (key === "--sources") opts.sources = value.split(",").map((s) => s.trim()).filter(Boolean);
		else if (key === "--epss-sweep") opts.sweep = true;
		else if (key === "--json") opts.json = true;
		else if (key === "--live-epss") opts.liveEpss = true;
	}
	return opts;
}

// --------------------------------------------------------------------------
// Constantes recopiées de generic.ts (non exportées là-bas) : extraction des
// champs d'un item, identique à `ingestNarrative`.
// --------------------------------------------------------------------------
const TITLE_FIELDS = ["title", "name", "cveID", "cve", "value", "indicator", "description", "summary", "vulnerabilityName", "post_title"];
const LINK_FIELDS = ["link", "url", "reference", "href", "source_url", "permalink"];
const SUMMARY_FIELDS = ["summary", "description", "content", "excerpt", "abstract", "body", "text", "post_content"];

function pickAny(item: Record<string, unknown>, candidates: string[]): string {
	for (const field of candidates) {
		const v = item[field];
		if (v === undefined || v === null) continue;
		if (Array.isArray(v)) {
			const first = v.find((x) => typeof x === "string");
			if (first !== undefined) return String(first);
			continue;
		}
		if (typeof v === "object") {
			const nested = v as Record<string, unknown>;
			for (const key of ["cveID", "id", "name", "value", "url", "link"]) {
				if (typeof nested[key] === "string") return nested[key] as string;
			}
			continue;
		}
		return String(v);
	}
	return "";
}

/** Champs portant des identifiants CVE en plus du titre (OSV `aliases`, `cve`…). */
const CVE_ALIAS_FIELDS = ["aliases", "cve", "cveID", "cves", "vulnerabilityId", "identifiers"];

function collectStrings(value: unknown, out: string[]): void {
	if (typeof value === "string") out.push(value);
	else if (Array.isArray(value)) for (const entry of value) collectStrings(entry, out);
	else if (value && typeof value === "object") for (const entry of Object.values(value)) collectStrings(entry, out);
}

/** Texte où chercher les CVE de l'item (titres + champs d'alias), hors URL. */
function cveTextOf(item: Record<string, unknown>, title: string, summary: string): string {
	const extra: string[] = [];
	for (const field of CVE_ALIAS_FIELDS) collectStrings(item[field], extra);
	return [title, summary, ...extra].join(" ");
}

function explicitOr(item: Record<string, unknown>, field: unknown, candidates: string[]): string {
	if (typeof field === "string" && field && typeof item[field] === "string") return item[field] as string;
	return pickAny(item, candidates);
}

/** Copie de `detectIndicatorType` (privée dans generic.ts) : ligne → type d'indicateur. */
function detectIndicatorType(line: string): string | null {
	const value = line.trim();
	if (!value || value.startsWith("#")) return null;
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return "ip";
	if (/^[0-9a-fA-F]{32}$/.test(value) || /^[0-9a-fA-F]{40}$/.test(value) || /^[0-9a-fA-F]{64}$/.test(value)) return "hash";
	if (/^https?:\/\//.test(value)) return "url";
	if (/^cve-\d{4}-\d+$/i.test(value)) return "cve";
	if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return "domain";
	return null;
}

// --------------------------------------------------------------------------
// Réseau (lecture des flux, comme le collecteur)
// --------------------------------------------------------------------------
const USER_AGENT = "radar-cyber-coverage-audit/1.0 (+https://radar-cyber.local; coverage audit)";
const ACCEPT = "application/json, application/rss+xml, application/atom+xml, text/xml, text/csv, text/plain, text/html;q=0.9, */*;q=0.5";
const MAX_BYTES = 25 * 1024 * 1024;

interface Fetched {
	body: string;
	contentType: string;
	status: number;
	error: string | null;
}

async function fetchBody(url: string): Promise<Fetched> {
	try {
		const res = await fetch(url, {
			headers: { "user-agent": USER_AGENT, accept: ACCEPT },
			signal: AbortSignal.timeout(30_000),
			redirect: "follow",
		});
		if (!res.ok) {
			await res.body?.cancel();
			return { body: "", contentType: "", status: res.status, error: `HTTP ${res.status}` };
		}
		const buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.byteLength > MAX_BYTES) {
			return { body: "", contentType: "", status: res.status, error: `corps ${(buffer.byteLength / 1048576).toFixed(1)} Mo` };
		}
		return { body: buffer.toString("utf8"), contentType: res.headers.get("content-type") ?? "", status: res.status, error: null };
	} catch (e) {
		return { body: "", contentType: "", status: 0, error: e instanceof Error ? e.message : String(e) };
	}
}

// --------------------------------------------------------------------------
// Base : sources vides, orgs, scores EPSS
// --------------------------------------------------------------------------
interface SourceRow {
	id: string;
	name: string;
	family: string;
	url: string;
	kind: string;
	format: string;
	parser: Record<string, unknown>;
	relevance: string;
	last_items: number | null;
}

/** `ok_but_empty` = source saine mais aucun événement produit (pas `last_items = 0`). */
const EMPTY_SOURCES_SQL = `SELECT s.id, s.name, s.family, s.url, s.kind, s.format, s.parser, s.relevance, s.last_items
   FROM source s
  WHERE s.enabled AND s.last_ok_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM event e WHERE e.source_id = s.id)`;

const EMPTY_SOURCES_ORDERED = `${EMPTY_SOURCES_SQL} ORDER BY s.last_ok_at DESC`;

/**
 * Échantillon par défaut : 12 sources `ok_but_empty` réellement parsables,
 * dont `feed:ecrimelabs:cveid:aHR0cHM6` (3 267 items CVE jetés). Les sources
 * Telegram (`tg-*`, HTML) sont volontairement écartées : la règle (a) ne peut
 * s'y mesurer, elles ne publient aucune CVE.
 */
const DEFAULT_SOURCES: readonly string[] = [
	"feed:ecrimelabs:cveid:aHR0cHM6",
	"presse-francebleu-rss",
	"presse-lmi-feedburner",
	"estorides:r-gion-actualit-s",
	"estorides:aquitaine-online-bordeau",
	"tg-cvenotify",
	"tg-itsecalert",
	"tg-aptanalysis",
	"actu-crowdstrike",
	"actu-cybersecuritydive",
	"actu-helpnetsecurity",
	"actu-zdnet-security",
];

async function loadEmptySources(limit: number): Promise<SourceRow> {
	const { rows } = await query<SourceRow>(`${EMPTY_SOURCES_ORDERED} LIMIT $1`, [limit]);
	return rows;
}

/** Échantillon par défaut : la liste nommée, complétée par les sources vides si besoin. */
async function loadDefaultSample(limit: number): Promise<SourceRow[]> {
	const { rows } = await query<SourceRow>(`${EMPTY_SOURCES_SQL} AND s.id = ANY($1::text[]) ORDER BY s.id`, [DEFAULT_SOURCES]);
	const chosen = rows.slice(0, limit);
	if (chosen.length >= limit) return chosen;
	const seen = new Set(chosen.map((row) => row.id));
	const filler = await loadEmptySources(limit * 2);
	for (const row of filler) {
		if (chosen.length >= limit) break;
		if (seen.has(row.id)) continue;
		seen.add(row.id);
		chosen.push(row);
	}
	return chosen;
}

async function loadSourcesByIds(ids: string[]): Promise<SourceRow[]> {
	const { rows } = await query<SourceRow>(
		`SELECT id, name, family, url, kind, format, parser, relevance, last_items
		   FROM source WHERE id = ANY($1::text[]) ORDER BY id`,
		[ids],
	);
	return rows;
}

async function loadOrgIndex(): Promise<RelevanceOrg[]> {
	const { rows } = await query<{ name: string; domain: string | null; assets: string[] | null }>(
		"SELECT o.name, o.domain, array_remove(array_agg(DISTINCT a.value), NULL) AS assets FROM org o LEFT JOIN asset a ON a.org_id = o.id AND a.kind IN ('domain','subdomain') GROUP BY o.id",
	);
	return rows.map((o) => ({ name: o.name, slug: null, domain: o.domain, assets: o.assets ?? [] }));
}

async function loadDeptCodes(): Promise<string[]> {
	const { rows } = await query<{ dept: string }>("SELECT DISTINCT dept FROM org WHERE dept IS NOT NULL ORDER BY dept");
	return rows.map((r) => r.dept);
}

/** Scores EPSS de la source `epss`, joints sur l'identifiant CVE : zéro réseau. */
async function loadEpssScores(): Promise<Map<string, number>> {
	const { rows } = await query<{ cve: string; score: number }>(
		`SELECT upper((regexp_match(title, 'CVE-[0-9]{4}-[0-9]+'))[1]) AS cve,
		        (evidence->>'epss')::float8 AS score
		   FROM event
		  WHERE source_id = 'epss' AND evidence ? 'epss' AND title ~ 'CVE-[0-9]{4}-[0-9]+'`,
	);
	const map = new Map<string, number>();
	for (const row of rows) {
		if (row.cve && Number.isFinite(row.score)) map.set(row.cve, row.score);
	}
	return map;
}

/** Vocabulaire règle (b) : départements de Nouvelle-Aquitaine présents en base + préfectures. */
function buildVocabulary(deptCodes: string[]): string[] {
	const names = new Set<string>();
	for (const code of deptCodes) {
		const label = DEPT_LABELS[code];
		if (label) names.add(label);
	}
	for (const pref of PREFECTURES) names.add(pref);
	return [...names];
}

// --------------------------------------------------------------------------
// Mesure d'une source
// --------------------------------------------------------------------------
interface SourceMeasure {
	source: string;
	items: number;
	parse: string;
	kept: number;
	rejected: number;
	ruleA: number;
	ruleB: number;
	both: number;
	/** Rejetés aujourd'hui et admis par au moins une règle. */
	won: number;
	error: string | null;
}

interface RejectedItem {
	source: string;
	title: string;
	summary: string;
	cves: string[];
	cyber: boolean;
	byB: boolean;
}

interface AuditState {
	orgIndex: RelevanceOrg[];
	ctx: CoverageContext;
	rejected: RejectedItem[];
}

async function measureSource(source: SourceRow, state: AuditState): Promise<SourceMeasure> {
	const measure: SourceMeasure = {
		source: source.id,
		items: 0,
		parse: "",
		kept: 0,
		rejected: 0,
		ruleA: 0,
		ruleB: 0,
		both: 0,
		won: 0,
		error: null,
	};
	const fetched = await fetchBody(source.url);
	if (fetched.error) {
		measure.error = fetched.error;
		return measure;
	}
	const detected = detectItems(fetched.body, fetched.contentType || null);
	measure.parse = detected.strategy;
	if (detected.strategy === "none" || detected.items.length === 0) {
		// Même repli que generic.ts : liste de lignes d'indicateurs. Les CVE y
		// entrent en base comme indicateurs, jamais comme événements : c'est le
		// trou de couverture mesuré pour `feed:ecrimelabs:cveid:aHR0cHM6`.
		const lines = fetched.body.split(/\r?\n/).filter((line) => detectIndicatorType(line) !== null);
		measure.parse = "lignes-indicateur";
		measure.items = lines.length;
		for (const line of lines) {
			measure.rejected++;
			const cve = line.trim().toUpperCase();
			const score = state.ctx.epssByCve.get(cve);
			if (score !== undefined && score >= state.ctx.epssThreshold) measure.ruleA++;
			state.rejected.push({ source: source.id, title: cve, summary: "", cves: [cve], cyber: true, byB: false });
		}
		measure.kept = lines.length - measure.rejected;
		if (lines.length === 0) measure.error = "format non reconnu";
		measure.won = measure.ruleA;
		return measure;
	}
	measure.items = detected.items.length;

	const gate = source.relevance !== "strict";
	let sourceHost = "";
	try {
		sourceHost = new URL(source.url).host;
	} catch {
		sourceHost = "";
	}

	for (const item of detected.items) {
		const title = explicitOr(item, source.parser.titleField, TITLE_FIELDS).slice(0, 400);
		const summary = explicitOr(item, source.parser.summaryField, SUMMARY_FIELDS).slice(0, 2000);
		if (!title) continue;
		const link = explicitOr(item, source.parser.linkField, LINK_FIELDS);
		if (!gate || isRelevant({ title, url: link, sourceUrl: link }, { orgs: state.orgIndex, ignoreDomains: [sourceHost] }).relevant) {
			measure.kept++;
			continue;
		}
		measure.rejected++;
		const text = `${title} ${summary}`;
		const cves = extractCveIds(cveTextOf(item, title, summary));
		const byA = admitByEpss(cveTextOf(item, title, summary), state.ctx) !== null;
		const byB = admitsDepartment(text, state.ctx.deptNames);
		if (byA) measure.ruleA++;
		if (byB) measure.ruleB++;
		if (byA && byB) measure.both++;
		if (byA || byB) measure.won++;
		state.rejected.push({ source: source.id, title, summary, cves, cyber: isCyberText(title, summary), byB });
	}
	return measure;
}

/**
 * Scores EPSS live (api.first.org) : servent UNIQUEMENT à justifier le seuil.
 * La règle en production ne lit que la table `event` (source `epss`).
 */
async function fetchLiveEpss(cves: string[]): Promise<Map<string, number>> {
	const scores = new Map<string, number>();
	const unique = [...new Set(cves)];
	for (let i = 0; i < unique.length; i += 50) {
		const batch = unique.slice(i, i + 50);
		try {
			const res = await fetch(`https://api.first.org/data/v1/epss?cve=${batch.join(",")}`, {
				headers: { "user-agent": USER_AGENT, accept: "application/json" },
				signal: AbortSignal.timeout(20_000),
			});
			if (!res.ok) continue;
			const payload = (await res.json()) as { data?: { cve: string; epss: string }[] };
			for (const row of payload.data ?? []) {
				const value = Number(row.epss);
				if (Number.isFinite(value)) scores.set(row.cve.toUpperCase(), value);
			}
		} catch {
			// mesure best-effort : un lot en échec n'invalide pas les autres
		}
	}
	return scores;
}

/** Recalcule la règle (a) sur les rejetés avec les scores fournis. */
function recomputeRuleA(rows: SourceMeasure[], rejected: RejectedItem[], scores: Map<string, number>, threshold: number): void {
	const ruleA = new Map<string, number>();
	const both = new Map<string, number>();
	for (const item of rejected) {
		const maxScore = Math.max(0, ...item.cves.map((cve) => scores.get(cve) ?? 0));
		if (maxScore < threshold) continue;
		ruleA.set(item.source, (ruleA.get(item.source) ?? 0) + 1);
		if (item.byB) both.set(item.source, (both.get(item.source) ?? 0) + 1);
	}
	for (const row of rows) {
		const a = ruleA.get(row.source) ?? 0;
		const b = row.ruleB;
		row.ruleA = a;
		row.both = both.get(row.source) ?? 0;
		row.won = a + b - row.both;
	}
}

// --------------------------------------------------------------------------
// Seuil EPSS : précision mesurée par seuil, CVE 2025-2026 seulement
// --------------------------------------------------------------------------
interface SweepRow {
	threshold: number;
	/** Admis par la règle (a) parmi les rejetés, toutes années. */
	admitted: number;
	/** Parmi eux, CVE 2025-2026. */
	candidates: number;
	/** Parmi eux, items dont le texte est cyber. */
	cyber: number;
	precision: number;
}

const SWEEP_THRESHOLDS: readonly number[] = [0.01, 0.05, 0.1, 0.2, 0.5];

function sweep(rejected: RejectedItem[], scores: Map<string, number>): SweepRow[] {
	const rows: SweepRow[] = [];
	for (const threshold of SWEEP_THRESHOLDS) {
		let admitted = 0;
		let candidates = 0;
		let cyber = 0;
		for (const item of rejected) {
			const maxScore = Math.max(0, ...item.cves.map((cve) => scores.get(cve) ?? 0));
			if (maxScore < threshold) continue;
			admitted++;
			if (!item.cves.some((cve) => /^CVE-202[56]-/.test(cve))) continue;
			candidates++;
			if (item.cyber) cyber++;
		}
		rows.push({ threshold, admitted, candidates, cyber, precision: candidates === 0 ? 0 : cyber / candidates });
	}
	return rows;
}

// --------------------------------------------------------------------------
// Affichage
// --------------------------------------------------------------------------
function pad(value: string, width: number): string {
	return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}

function printTable(rows: SourceMeasure[]): void {
	const header = ["source", "parse", "items", "gardés", "rejetés", "règle-a", "règle-b", "les deux", "gagnés"];
	const widths = [34, 16, 7, 8, 8, 8, 8, 9, 8];
	const total = { items: 0, kept: 0, rejected: 0, ruleA: 0, ruleB: 0, both: 0, won: 0 };
	const print = (cells: string[]): void => {
		console.log(cells.map((c, i) => pad(c, widths[i])).join(" "));
	};
	print(header);
	console.log(widths.map((w) => "-".repeat(w)).join(" "));
	for (const row of rows) {
		print([
			row.source,
			row.parse + (row.error ? ` (${row.error})` : ""),
			String(row.items),
			String(row.kept),
			String(row.rejected),
			String(row.ruleA),
			String(row.ruleB),
			String(row.both),
			String(row.won),
		]);
		total.items += row.items;
		total.kept += row.kept;
		total.rejected += row.rejected;
		total.ruleA += row.ruleA;
		total.ruleB += row.ruleB;
		total.both += row.both;
		total.won += row.won;
	}
	console.log(widths.map((w) => "-".repeat(w)).join(" "));
	print([
		"TOTAL",
		"",
		String(total.items),
		String(total.kept),
		String(total.rejected),
		String(total.ruleA),
		String(total.ruleB),
		String(total.both),
		String(total.won),
	]);
}

function printSweep(rows: SweepRow[], epssSize: number): void {
	console.log(`\nSeuil EPSS (CVE 2025-2026 parmi les rejetés ; scores en base : ${epssSize})`);
	const header = ["seuil", "admis", "dont 25-26", "cyber", "précision"];
	const widths = [8, 8, 12, 8, 10];
	const print = (cells: string[]): void => {
		console.log(cells.map((c, i) => pad(c, widths[i])).join(" "));
	};
	print(header);
	console.log(widths.map((w) => "-".repeat(w)).join(" "));
	for (const row of rows) {
		print([
			row.threshold.toFixed(2),
			String(row.admitted),
			String(row.candidates),
			String(row.cyber),
			`${(row.precision * 100).toFixed(1)} %`,
		]);
	}
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main(): Promise<void> {
	const opts = parseArgs(process.argv.slice(2));
	const orgIndex = await loadOrgIndex();
	const deptCodes = await loadDeptCodes();
	const scores = await loadEpssScores();
	const deptNames = buildVocabulary(deptCodes);
	const threshold = Number(process.env.COVERAGE_EPSS_THRESHOLD ?? "0.1");
	const ctx: CoverageContext = { epssByCve: scores, epssThreshold: threshold, deptNames };

	const sources = opts.sources ? await loadSourcesByIds(opts.sources) : await loadDefaultSample(opts.limit);
	const state: AuditState = { orgIndex, ctx, rejected: [] };
	const rows: SourceMeasure[] = [];
	for (const source of sources) {
		try {
			rows.push(await measureSource(source, state));
		} catch (e) {
			rows.push({
				source: source.id,
				items: 0,
				parse: "",
				kept: 0,
				rejected: 0,
				ruleA: 0,
				ruleB: 0,
				both: 0,
				won: 0,
				error: e instanceof Error ? e.message : String(e),
			});
		}
	}

	let justificationScores = scores;
	let justificationSource = "base (event source_id='epss')";
	if (opts.liveEpss) {
		const cited = state.rejected.flatMap((item) => item.cves);
		const live = await fetchLiveEpss(cited);
		if (live.size > 0) {
			justificationScores = live;
			justificationSource = "live api.first.org (justification seulement)";
			recomputeRuleA(rows, state.rejected, live, threshold);
		}
	}

	if (opts.json) {
		console.log(JSON.stringify({ rows, sweep: sweep(state.rejected, justificationScores), epssSize: scores.size, deptNames }, null, 2));
	} else {
		printTable(rows);
		console.log(`\nScores règle (a) : ${justificationSource} — seuil ${threshold}`);
		if (opts.sweep) {
			const measured = sweep(state.rejected, justificationScores);
			const recent = state.rejected.filter((item) => item.cves.some((cve) => /^CVE-202[56]-/.test(cve))).length;
			console.log(`Rejetés citant une CVE 2025-2026 : ${recent} — scores connus : ${justificationScores.size}\n`);
			printSweep(measured, justificationScores.size);
		}
	}
}

main()
	.catch((e) => {
		console.error(e instanceof Error ? e.stack ?? e.message : String(e));
		process.exitCode = 1;
	})
	.finally(() => closePools());
