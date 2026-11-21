/**
 * Pourquoi le filtre de pertinence jette-t-il (presque) tout ?
 *
 * Le script rejoue, source par source, la chaîne de décision réelle de
 * `collectors/generic.ts` — sans écrire en base — et attribue chaque item
 * rejeté à un motif nommé, tel qu'il apparaît dans le code :
 *
 *   narrative  : sans_titre → pertinence (porte `isRelevant`) → doublon_db
 *   indicateur : pas_indicateur → doublon_lot → hors_perimetre
 *                (`isActionableIndicator`) → warninglist (`filterIndicators`)
 *
 * Les prédicats (`isRelevant`, `isActionableIndicator`, `detectItems`,
 * `filterIndicators`) sont IMPORTÉS, jamais réécrits : les comptes viennent du
 * code, pas d'une approximation. Sont recopiées ici uniquement les constantes
 * non exportées de `generic.ts` (listes de champs, `detectIndicatorType`,
 * `hashKey`, `looksLikeBlocklist`), signalées à chaque fois.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/audit-filter.mts
 *   apps/api/node_modules/.bin/tsx scripts/audit-filter.mts --sources=a,b,c
 *   apps/api/node_modules/.bin/tsx scripts/audit-filter.mts --samples=3
 *   apps/api/node_modules/.bin/tsx scripts/audit-filter.mts --no-epss
 *   apps/api/node_modules/.bin/tsx scripts/audit-filter.mts --json
 *
 * Lecture seule : uniquement des SELECT. Aucune insertion, aucun UPDATE,
 * aucune désactivation de source.
 */
import { createHash } from "node:crypto";
import { closePools, query } from "../apps/api/src/db.js";
import { detectItems } from "../apps/api/src/collectors/generic.js";
import { isRelevant, type RelevanceOrg } from "../apps/api/src/collectors/relevance.js";
import { isActionableIndicator, loadActiveIndex } from "../apps/api/src/collectors/filter.js";
import { filterIndicators } from "../apps/api/src/collectors/warninglist.js";

// --------------------------------------------------------------------------
// Motifs. Chacun correspond à une ligne précise de generic.ts (citée en
// commentaire) : aucun motif n'est inventé.
// --------------------------------------------------------------------------
type Motif =
	| "source_vide" // fetchText() === "" (304) → processSource sort sans rien compter
	| "format_non_reconnu" // detectItems() → strategy "none"
	| "sans_titre" // `if (!title) continue;` (ingestNarrative) — non compté en `skipped`
	| "pertinence" // `if (gate && !isRelevant(...).relevant) skipped++`
	| "pas_indicateur" // detectIndicatorType() === null
	| "doublon_lot" // `if (seen.has(key)) continue;`
	| "hors_perimetre" // `if (idx && !isActionableIndicator(...).keep) skipped++`
	| "warninglist" // filterIndicators() → dropped (valeur légitime)
	| "doublon_db" // ON CONFLICT side : la clé existe déjà, d'où items_new = 0
	| "retenu"; // passerait toutes les portes et créerait une ligne

const MOTIFS: readonly Motif[] = [
	"source_vide",
	"format_non_reconnu",
	"sans_titre",
	"pertinence",
	"pas_indicateur",
	"doublon_lot",
	"hors_perimetre",
	"warninglist",
	"doublon_db",
	"retenu",
];

const MOTIF_LABEL: Record<Motif, string> = {
	source_vide: "vide/304",
	format_non_reconnu: "format",
	sans_titre: "sans-titre",
	pertinence: "pertinence",
	pas_indicateur: "pas-indic",
	doublon_lot: "dup-lot",
	hors_perimetre: "hors-perim",
	warninglist: "warninglist",
	doublon_db: "dup-db",
	retenu: "RETENU",
};

interface SourceRow {
	id: string;
	name: string;
	family: string;
	url: string;
	kind: string;
	format: string;
	parser: Record<string, unknown>;
	relevance: string;
}

interface AuditRow {
	source: string;
	kind: string;
	format: string;
	relevance: string;
	items: number;
	counts: Record<Motif, number>;
	parse: string;
}

/** Item rejeté par la porte de pertinence, conservé pour les contrefactuels. */
interface RejectedItem {
	source: string;
	title: string;
	text: string;
	cves: string[];
}

// --------------------------------------------------------------------------
// Constantes recopiées de generic.ts (non exportées là-bas).
// --------------------------------------------------------------------------
const TITLE_FIELDS = ["title", "name", "cveID", "cve", "value", "indicator", "description", "summary", "vulnerabilityName", "post_title"];
const LINK_FIELDS = ["link", "url", "reference", "href", "source_url", "permalink"];
const SUMMARY_FIELDS = ["summary", "description", "content", "excerpt", "abstract", "body", "text", "post_content"];

function looksLikeBlocklist(url: string): boolean {
	return /\.(txt|csv|json|zip)(\?|$)/i.test(url) || /blocklist|blacklist|hostfile|feed-osint/i.test(url);
}

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

function hashKey(value: string): string {
	return createHash("sha256").update(value).digest("base64url").slice(0, 24);
}

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

function explicitOr(item: Record<string, unknown>, field: unknown, candidates: string[]): string {
	if (typeof field === "string" && field && typeof item[field] === "string") return item[field] as string;
	return pickAny(item, candidates);
}

const CVE_RE = /\bCVE-\d{4}-\d{4,}\b/gi;

function cvesIn(text: string): string[] {
	const found = text.match(CVE_RE) ?? [];
	return [...new Set(found.map((c) => c.toUpperCase()))];
}

// --------------------------------------------------------------------------
// Réseau
// --------------------------------------------------------------------------
const USER_AGENT = "radar-cyber-filter-audit/1.0 (+https://radar-cyber.local; relevance audit)";
const ACCEPT = "application/json, application/rss+xml, application/atom+xml, text/xml, text/csv, text/plain, text/html;q=0.9, */*;q=0.5";
const MAX_BYTES = 20 * 1024 * 1024;

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
			signal: AbortSignal.timeout(20_000),
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
// Échantillon : 13 sources `last_items = 0`, choisies pour couvrir les quatre
// chemins possibles (narrative strict, narrative context, indicateur filtré,
// indicateur non filtré) — la sélection vient de collector_run.
// --------------------------------------------------------------------------
const DEFAULT_SOURCES: readonly string[] = [
	// narrative RSS + porte de pertinence ACTIVE (relevance != 'strict')
	"actu-hackread",
	"actu-infosecurity-magazine",
	"actu-crowdstrike",
	"actu-cybersecuritydive",
	"actu-welivesecurity",
	"actu-securityaffairs",
	"cert-cisa-advisories",
	// narrative RSS + porte DÉSACTIVÉE (relevance = 'strict') → doublons seuls
	"estorides:darkreading",
	"cert-fr-feed",
	"estorides:exploit-db-new-exploits",
	// JSON strict à fort volume (cas signalé par le parent)
	"feed:ecrimelabs:cveid:aHR0cHM6",
	// indicateur + filtre anti-bruit ACTIF
	"feed:elliot:usom-urls",
	"estorides:blocklist-de-all",
];

// --------------------------------------------------------------------------
// Contrefactuel : départements de notre périmètre (org.dept), noms normalisés.
// --------------------------------------------------------------------------
const DEPT_NAMES: Record<string, string> = {
	"16": "charente",
	"17": "charente-maritime",
	"19": "correze",
	"23": "creuse",
	"24": "dordogne",
	"31": "haute-garonne",
	"33": "gironde",
	"38": "isere",
	"40": "landes",
	"46": "lot",
	"47": "lot-et-garonne",
	"64": "pyrenees-atlantiques",
	"71": "saone-et-loire",
	"75": "paris",
	"79": "deux-sevres",
	"86": "vienne",
	"87": "haute-vienne",
};

function normalizeText(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

// --------------------------------------------------------------------------
// EPSS (first.org). Aucune table EPSS en base : on interroge l'API publique.
// --------------------------------------------------------------------------
interface EpssRow {
	cve: string;
	epss: string;
}

async function fetchEpss(cves: string[]): Promise<Map<string, number> | null> {
	const scores = new Map<string, number>();
	const unique = [...new Set(cves)];
	for (let i = 0; i < unique.length; i += 50) {
		const batch = unique.slice(i, i + 50);
		try {
			const res = await fetch(`https://api.first.org/data/v1/epss?cve=${batch.join(",")}`, {
				headers: { "user-agent": USER_AGENT, accept: "application/json" },
				signal: AbortSignal.timeout(20_000),
			});
			if (!res.ok) return null;
			const payload = (await res.json()) as { data?: EpssRow[] };
			for (const row of payload.data ?? []) {
				const value = Number(row.epss);
				if (Number.isFinite(value)) scores.set(row.cve.toUpperCase(), value);
			}
		} catch {
			return null;
		}
	}
	return scores;
}

// --------------------------------------------------------------------------
// Traitement d'une source
// --------------------------------------------------------------------------
function emptyCounts(): Record<Motif, number> {
	const counts = Object.create(null) as Record<Motif, number>;
	for (const motif of MOTIFS) counts[motif] = 0;
	return counts;
}

async function existingEventKeys(keys: string[]): Promise<Set<string>> {
	if (keys.length === 0) return new Set<string>();
	const { rows } = await query<{ dedup_key: string }>(
		"SELECT dedup_key FROM event WHERE dedup_key = ANY($1::text[])",
		[keys],
	);
	return new Set(rows.map((r) => r.dedup_key));
}

async function existingIndicatorKeys(keys: string[]): Promise<Set<string>> {
	if (keys.length === 0) return new Set<string>();
	const { rows } = await query<{ k: string }>(
		"SELECT type || ':' || value AS k FROM indicator WHERE type || ':' || value = ANY($1::text[])",
		[keys],
	);
	return new Set(rows.map((r) => r.k));
}

interface AuditContext {
	orgIndex: RelevanceOrg[];
	activeIndex: Awaited<ReturnType<typeof loadActiveIndex>>;
	rejected: RejectedItem[];
	samples: string[];
	sampleLimit: number;
	/** Pourquoi les items ont passé la porte : mot-clé cyber ou entité org. */
	passKeyword: number;
	passOrg: number;
}

async function auditNarrative(
	source: SourceRow,
	body: string,
	contentType: string,
	ctx: AuditContext,
): Promise<{ row: AuditRow; parse: string }> {
	const row: AuditRow = {
		source: source.id,
		kind: source.kind,
		format: source.format,
		relevance: source.relevance,
		items: 0,
		counts: emptyCounts(),
		parse: "",
	};

	const detected = detectItems(body, contentType || null);
	// generic.ts : si le parse narrative ne rend aucun item, le corps est
	// retenté comme liste d'indicateurs (`ingestIndicator(source, body)`) —
	// SANS index d'actifs, donc sans filtre de périmètre.
	if (detected.strategy === "none" || detected.items.length === 0) {
		const fallback = await auditIndicator(source, body, ctx, false);
		if (fallback.items === 0) fallback.counts.format_non_reconnu = 1;
		fallback.parse = `fallback-indicateur (${detected.strategy})`;
		return { row: fallback, parse: fallback.parse };
	}
	row.parse = detected.strategy;
	row.items = detected.items.length;

	const gate = source.relevance !== "strict";
	let sourceHost = "";
	try {
		sourceHost = new URL(source.url).host;
	} catch {
		sourceHost = "";
	}

	const retainedKeys: string[] = [];

	for (const item of detected.items) {
		const title = explicitOr(item, source.parser.titleField, TITLE_FIELDS).slice(0, 400);
		const summary = explicitOr(item, source.parser.summaryField, SUMMARY_FIELDS).slice(0, 2000);
		if (!title) {
			row.counts.sans_titre++;
			continue;
		}
		const link = explicitOr(item, source.parser.linkField, LINK_FIELDS);
		if (gate) {
			const verdict = isRelevant({ title, url: link, sourceUrl: link }, { orgs: ctx.orgIndex, ignoreDomains: [sourceHost] });
			if (!verdict.relevant) {
				row.counts.pertinence++;
				ctx.rejected.push({ source: source.id, title, text: `${title} ${summary}`, cves: cvesIn(`${title} ${summary}`) });
				if (ctx.samples.length < ctx.sampleLimit) ctx.samples.push(`  ${source.id} :: ${title.slice(0, 110)}`);
				continue;
			}
			if (verdict.reason === "keyword") ctx.passKeyword++;
			else if (verdict.reason === "org") ctx.passOrg++;
		}
		retainedKeys.push(`feed:${source.id}:${hashKey(link || title)}`);
	}

	const existing = await existingEventKeys(retainedKeys);
	for (let i = 0; i < retainedKeys.length; i++) {
		if (existing.has(retainedKeys[i])) row.counts.doublon_db++;
		else row.counts.retenu++;
	}
	return { row, parse: detected.strategy };
}

async function auditIndicator(
	source: SourceRow,
	body: string,
	ctx: AuditContext,
	allowFilter = true,
): Promise<AuditRow> {
	const row: AuditRow = {
		source: source.id,
		kind: source.kind,
		format: source.format,
		relevance: source.relevance,
		items: 0,
		counts: emptyCounts(),
		parse: "lignes",
	};

	const filterIdx =
		allowFilter && (looksLikeBlocklist(source.url) || source.family === "reputation" || source.family === "phishing")
			? ctx.activeIndex
			: undefined;

	const seen = new Set<string>();
	const retained: { type: string; value: string }[] = [];

	for (const line of body.split(/\r?\n/)) {
		const type = detectIndicatorType(line);
		if (!type) continue;
		row.items++;
		const value = line.trim();
		const key = `${type}:${value}`;
		if (seen.has(key)) {
			row.counts.doublon_lot++;
			continue;
		}
		seen.add(key);
		if (filterIdx && !isActionableIndicator(value, type, filterIdx).keep) {
			row.counts.hors_perimetre++;
			continue;
		}
		retained.push({ type, value });
	}

	// filterIndicators s'applique en lot dans generic.ts ; sur l'échantillon
	// complet d'une source la partition est identique.
	const { kept, dropped } = filterIndicators(retained.map((r) => ({ kind: r.type, value: r.value, row: r })));
	row.counts.warninglist += dropped;

	const existing = await existingIndicatorKeys(kept.map((k) => `${k.kind}:${k.value}`));
	for (const entry of kept) {
		if (existing.has(`${entry.kind}:${entry.value}`)) row.counts.doublon_db++;
		else row.counts.retenu++;
	}
	return row;
}

// --------------------------------------------------------------------------
// Affichage
// --------------------------------------------------------------------------
function pad(value: string, width: number): string {
	return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}

function printTable(rows: AuditRow[]): void {
	const header = ["source", "kind", "rel", "items", ...MOTIFS.map((m) => MOTIF_LABEL[m])];
	const widths = [34, 9, 7, 6, ...MOTIFS.map(() => 12)];
	const total = emptyCounts();
	let totalItems = 0;

	const print = (cells: string[]): void => {
		console.log(cells.map((c, i) => pad(c, widths[i])).join(" "));
	};

	print(header);
	console.log(widths.map((w) => "-".repeat(w)).join(" "));
	for (const row of rows) {
		print([
			row.source,
			row.kind,
			row.relevance,
			String(row.items),
			...MOTIFS.map((m) => String(row.counts[m])),
		]);
		for (const motif of MOTIFS) total[motif] += row.counts[motif];
		totalItems += row.items;
	}
	console.log(widths.map((w) => "-".repeat(w)).join(" "));
	print(["TOTAL", "", "", String(totalItems), ...MOTIFS.map((m) => String(total[m]))]);
}

/**
 * Second étage de `isRelevant` (branche org), isolé : sert à mesurer la
 * surface de faux positifs d'une règle proposée (item admis mais sans lien
 * avec un actif surveillé).
 */
function mentionsOrg(text: string, orgs: RelevanceOrg[]): boolean {
	const textNorm = normalizeText(text).replace(/[^a-z0-9.\s-]+/g, " ");
	const textLower = text.toLowerCase();
	for (const org of orgs) {
		const nameNorm = normalizeText(org.name ?? "")
			.replace(/\b(sarl|sas|sa|eurl|sci|scp|association|assoc\.?|groupe|group)\b/g, "")
			.replace(/\s+/g, " ")
			.trim();
		if (nameNorm.length >= 4 && textNorm.includes(nameNorm)) return true;
		for (const candidate of [org.domain, ...(org.assets ?? [])]) {
			const dom = (candidate ?? "").toLowerCase().trim();
			if (dom && textLower.includes(dom)) return true;
		}
	}
	return false;
}

/** Lexique anglais autonome de l'audit : mesure historique, indépendant du moteur actuel. */
const EN_LEXICON: readonly (readonly [string, RegExp])[] = [
	["vulnerab", /\bvulnerab/i],
	["exploit", /\bexploit/i],
	["malware", /\bmalware/i],
	["ransom", /\bransom/i],
	["breach", /\bbreach/i],
	["attack", /\battack/i],
	["threat actor", /\bthreat actor/i],
	["hacker", /\bhacker/i],
	["zero-day", /\bzero.day/i],
	["patch", /\bpatch/i],
	["phishing", /\bphishing/i],
	["cyber", /\bcyber/i],
	["security", /\bsecurity\s+(?:flaw|issue|bug|update|research|firm|team|vendor|breach)/i],
];

interface RuleScore {
	name: string;
	hits: Set<RejectedItem>;
	detail?: string;
}

function printCounterfactuals(
	rejected: RejectedItem[],
	epss: Map<string, number> | null,
	deptNames: string[],
	epssAvailable: boolean,
	orgs: RelevanceOrg[],
): void {
	console.log("\n--- contrefactuels sur les items rejetés par la porte de pertinence ---");
	console.log(`items rejetés (motif pertinence) : ${rejected.length}`);
	const pct = (n: number): string => (rejected.length > 0 ? ((n / rejected.length) * 100).toFixed(1) : "0") + " %";

	const withCve = rejected.filter((r) => r.cves.length > 0);
	console.log(`dont citant ≥1 CVE : ${withCve.length} (${new Set(withCve.flatMap((r) => r.cves)).size} CVE distinctes)`);

	const rules: RuleScore[] = [];

	if (!epssAvailable || !epss) {
		console.log("EPSS : indisponible (API first.org injoignable) — contrefactuel EPSS non mesuré");
	} else {
		const hot = withCve.filter((r) => r.cves.some((c) => (epss.get(c) ?? 0) > 0.1));
		const noOrg = hot.filter((r) => !mentionsOrg(r.text, orgs)).length;
		rules.push({
			name: "EPSS>0,10 sur une CVE citée",
			hits: new Set(hot),
			detail: `${withCve.length - hot.length} items à CVE resteraient rejetés ; ${noOrg} des ${hot.length} admis ne citent aucune de nos orgs`,
		});
	}

	const norm = rejected.map((r) => ({ item: r, text: normalizeText(r.text) }));
	const deptHits: { name: string; count: number; items: RejectedItem[] }[] = [];
	for (const name of deptNames) {
		// Frontières de mot : « lot » sans délimiteur matcherait « pilot », « slot »…
		const re = new RegExp(`(?:^|[^a-z0-9-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9-])`);
		const hits = norm.filter((entry) => re.test(entry.text));
		deptHits.push({ name, count: hits.length, items: hits.map((h) => h.item) });
	}
	const deptUnion = new Set<RejectedItem>();
	for (const hit of deptHits) for (const item of hit.items) deptUnion.add(item);
	rules.push({
		name: "département de la région cité",
		hits: deptUnion,
		detail: deptHits.filter((h) => h.count > 0).sort((a, b) => b.count - a.count).map((h) => `${h.name}=${h.count}`).join(", ") || "aucune mention",
	});

	const lexHits = new Map<string, RejectedItem[]>();
	const lexUnion = new Set<RejectedItem>();
	for (const [term, re] of EN_LEXICON) {
		const hits = rejected.filter((r) => re.test(normalizeText(r.text)) || re.test(r.text));
		for (const hit of hits) lexUnion.add(hit);
		if (hits.length > 0) lexHits.set(term, hits);
	}
	rules.push({
		name: "lexique cyber anglais (13 termes)",
		hits: lexUnion,
		detail: [...lexHits.entries()].sort((a, b) => b[1].length - a[1].length).map(([t, h]) => `${t}=${h.length}`).join(", "),
	});

	for (const rule of rules) {
		console.log(`\nrègle « ${rule.name} » : +${rule.hits.size} item(s) (${pct(rule.hits.size)})`);
		if (rule.detail) console.log(`  ${rule.detail}`);
	}

	const union = new Set<RejectedItem>();
	for (const rule of rules) for (const item of rule.hits) union.add(item);
	console.log(`\nunion des règles mesurées : +${union.size} item(s) (${pct(union.size)})`);

	// Combien de ces items admis portent une entité org ? Le reste est la
	// surface de faux positifs qu'une règle ajouterait au corpus.
	const unionNoOrg = [...union].filter((r) => !mentionsOrg(r.text, orgs)).length;
	console.log(`dont ${unionNoOrg}/${union.size} sans aucune de nos 529 orgs citée`);
}

// --------------------------------------------------------------------------
// main
// --------------------------------------------------------------------------
const args = process.argv.slice(2);
const sourcesArg = args.find((a) => a.startsWith("--sources="));
const samplesArg = args.find((a) => a.startsWith("--samples="));
const sampleLimit = samplesArg ? Number(samplesArg.split("=")[1] ?? 0) : 0;
const noEpss = args.includes("--no-epss");
const asJson = args.includes("--json");
const sourceIds = sourcesArg
	? sourcesArg.slice("--sources=".length).split(",").map((s) => s.trim()).filter(Boolean)
	: [...DEFAULT_SOURCES];

async function main(): Promise<void> {
	const { rows: sourceRows } = await query<SourceRow>(
		`SELECT id, name, family, url, kind, format, parser, relevance
		   FROM source
		  WHERE id = ANY($1::text[]) AND enabled`,
		[sourceIds],
	);
	const byId = new Map(sourceRows.map((s) => [s.id, s]));

	const { rows: orgRows } = await query<{ name: string; domain: string | null; assets: string[] | null }>(
		`SELECT o.name, o.domain, array_remove(array_agg(DISTINCT a.value), NULL) AS assets
		   FROM org o
		   LEFT JOIN asset a ON a.org_id = o.id AND a.kind IN ('domain','subdomain')
		  GROUP BY o.id`,
	);
	const ctx: AuditContext = {
		orgIndex: orgRows.map((o) => ({ name: o.name, slug: null, domain: o.domain, assets: o.assets ?? [] })),
		activeIndex: await loadActiveIndex(),
		rejected: [],
		samples: [],
		sampleLimit,
		passKeyword: 0,
		passOrg: 0,
	};

	if (!asJson) {
		console.log(`index : ${ctx.orgIndex.length} org(s), ${ctx.activeIndex.domains.size} domaine(s), ${ctx.activeIndex.cves.size} CVE(s)`);
		console.log(`sources demandées : ${sourceIds.length}, trouvées : ${sourceRows.length}\n`);
	}

	const results: AuditRow[] = [];
	const missing: string[] = [];
	for (const id of sourceIds) {
		const source = byId.get(id);
		if (!source) {
			missing.push(id);
			continue;
		}
		const fetched = await fetchBody(source.url);
		if (fetched.error) {
			results.push({
				source: source.id,
				kind: source.kind,
				format: source.format,
				relevance: source.relevance,
				items: 0,
				counts: { ...emptyCounts(), source_vide: 1 },
				parse: `erreur: ${fetched.error}`,
			});
			continue;
		}
		if (fetched.body.trim() === "") {
			results.push({
				source: source.id,
				kind: source.kind,
				format: source.format,
				relevance: source.relevance,
				items: 0,
				counts: { ...emptyCounts(), source_vide: 1 },
				parse: "corps vide",
			});
			continue;
		}
		const asIndicator = source.kind === "indicator" || (source.format !== "rss" && looksLikeBlocklist(source.url));
		const audited = asIndicator
			? await auditIndicator(source, fetched.body, ctx)
			: (await auditNarrative(source, fetched.body, fetched.contentType, ctx)).row;
		results.push(audited);
	}

	// Contrefactuels
	const deptCodes = await query<{ dept: string; n: string }>(
		"SELECT dept, count(*)::text AS n FROM org WHERE dept IS NOT NULL GROUP BY dept HAVING count(*) >= 2 ORDER BY 2 DESC",
	);
	const deptNames = deptCodes.rows
		.map((r) => DEPT_NAMES[r.dept])
		.filter((name): name is string => typeof name === "string");

	let epss: Map<string, number> | null = null;
	const allCves = [...new Set(ctx.rejected.flatMap((r) => r.cves))];
	const epssWanted = !noEpss && allCves.length > 0;
	if (epssWanted) epss = await fetchEpss(allCves);

	if (asJson) {
		console.log(JSON.stringify({ rows: results, missing, rejected: ctx.rejected.length, epssAvailable: epss !== null }, null, 2));
		return;
	}

	printTable(results);
	if (missing.length > 0) console.log(`\nabsentes du catalogue : ${missing.join(", ")}`);
	if (sampleLimit > 0 && ctx.samples.length > 0) {
		console.log("\n--- échantillon d'items rejetés par la pertinence ---");
		for (const line of ctx.samples) console.log(line);
	}
	printCounterfactuals(ctx.rejected, epss, deptNames, !noEpss, ctx.orgIndex);
	console.log(`\nporte de pertinence — items passés : ${ctx.passKeyword} par mot-clé cyber, ${ctx.passOrg} par entité org`);
}

main()
	.catch((e: unknown) => {
		console.error(e instanceof Error ? e.message : String(e));
		process.exitCode = 1;
	})
	.finally(() => closePools());
