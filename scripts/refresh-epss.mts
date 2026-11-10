/**
 * Rafraîchissement des scores EPSS (FIRST, API publique sans clé).
 *
 * Sort la règle d'admission `admitByEpss` (`collectors/relevance.ts`) de son
 * état inerte : la base ne contenait que 100 scores de test, la règle rendait
 * donc 0 item. Ce script télécharge le dump du jour, ne garde que les CVE que
 * le radar suit déjà (indicator / event / org_alias) et écrit dans `event`
 * (source `epss`, dedup `epss:<CVE>`) les scores >= EPSS_ADMISSION_THRESHOLD,
 * au format exact du collecteur `epss` : titre `CVE-AAAA-N — EPSS x`,
 * `evidence->>'epss'` portant le score. C'est la seule table lue par
 * `loadCoverageContext()` ; aucun cache séparé. Les scores sous le seuil ne
 * peuvent jamais admettre un item et restent dehors : ils ne feraient que
 * gonfler le fil (les CVE suivies restent mesurées, cf. « retenues »).
 *
 * Défaut : --dry-run (aucune écriture). --apply pour écrire.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/refresh-epss.mts            # simulation
 *   apps/api/node_modules/.bin/tsx scripts/refresh-epss.mts --apply    # écrit
 *   apps/api/node_modules/.bin/tsx scripts/refresh-epss.mts --apply --date=2026-11-10
 *   apps/api/node_modules/.bin/tsx scripts/refresh-epss.mts --limit=2000 --page-delay=1500
 */
import { ingestQuery, closePools } from "../apps/api/src/db.js";
import { EPSS_ADMISSION_THRESHOLD } from "../apps/api/src/collectors/relevance.js";

const API = "https://api.first.org/data/v1/epss";
const USER_AGENT = "radar-cyber-epss/1.0 (+https://radar-cyber.local; EPSS refresh)";
/** L'API plafonne `limit` à 10 000 (vérifié : demander 100 001 rend limit=10000). */
const MAX_LIMIT = 10_000;
/** Politesse : 1 requête par seconde maximum. */
const MIN_REQUEST_INTERVAL_MS = 1_000;

interface Options {
	apply: boolean;
	date: string | null;
	limit: number;
	pageDelayMs: number;
}

interface EpssApiRow {
	cve?: unknown;
	epss?: unknown;
	percentile?: unknown;
	date?: unknown;
}

interface EpssApiPage {
	total?: unknown;
	offset?: unknown;
	limit?: unknown;
	data?: unknown;
}

interface ScoreRow {
	cve: string;
	score: number;
	percentile: number | null;
	date: string;
}

function parseArgs(argv: string[]): Options {
	const opts: Options = { apply: false, date: null, limit: MAX_LIMIT, pageDelayMs: 1_100 };
	for (const arg of argv) {
		if (arg === "--apply") opts.apply = true;
		else if (arg === "--dry-run") opts.apply = false;
		else if (arg.startsWith("--date=")) opts.date = arg.slice(7).trim() || null;
		else if (arg.startsWith("--limit=")) opts.limit = Math.min(MAX_LIMIT, Math.max(1, Number(arg.slice(8)) || MAX_LIMIT));
		else if (arg.startsWith("--page-delay=")) opts.pageDelayMs = Math.max(MIN_REQUEST_INTERVAL_MS, Number(arg.slice(13)) || 1_100);
		else if (arg === "--help" || arg === "-h") {
			console.log("usage: refresh-epss.mts [--apply] [--date=AAAA-MM-JJ] [--limit=N] [--page-delay=ms]");
			process.exit(0);
		}
	}
	return opts;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Date du jour (UTC) au format de l'API ; validation stricte d'un --date. */
function resolveDate(explicit: string | null): string {
	if (explicit !== null) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(explicit)) throw new Error(`--date invalide : ${explicit} (attendu AAAA-MM-JJ)`);
		return explicit;
	}
	return new Date().toISOString().slice(0, 10);
}

/** CVE déjà suivies par le radar : indicateurs, textes d'événements, alias d'organisation. */
async function loadTrackedCves(): Promise<Set<string>> {
	const { rows } = await ingestQuery<{ cve: string }>(
		`WITH matches AS (
		   SELECT m[1] AS cve FROM indicator, regexp_matches(value, 'CVE-[0-9]{4}-[0-9]+', 'gi') m
		   UNION
		   SELECT m[1] FROM event, regexp_matches(
		     coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(evidence::text, ''),
		     'CVE-[0-9]{4}-[0-9]+', 'gi') m
		   UNION
		   SELECT m[1] FROM org_alias, regexp_matches(alias, 'CVE-[0-9]{4}-[0-9]+', 'gi') m
		 )
		 SELECT DISTINCT upper(cve) AS cve FROM matches`
	);
	const set = new Set<string>();
	for (const row of rows) if (row.cve) set.add(row.cve);
	return set;
}

async function fetchPage(offset: number, limit: number, date: string | null): Promise<EpssApiPage> {
	const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
	if (date !== null) params.set("date", date);
	const res = await fetch(`${API}?${params.toString()}`, {
		headers: { "user-agent": USER_AGENT, accept: "application/json" },
		signal: AbortSignal.timeout(30_000),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} sur ${API} (offset ${offset})`);
	const payload: unknown = await res.json();
	if (payload === null || typeof payload !== "object") throw new Error("réponse EPSS non objet");
	return payload as EpssApiPage;
}

function asRows(page: EpssApiPage): EpssApiRow[] {
	return Array.isArray(page.data) ? (page.data.filter((row): row is EpssApiRow => row !== null && typeof row === "object") as EpssApiRow[]) : [];
}

/** Compte d'insertions vs mises à jour d'un upsert (`xmax = 0` = ligne créée). */
function splitCounts(rows: { inserted: boolean }[]): { inserted: number; updated: number } {
	let inserted = 0;
	for (const row of rows) if (row.inserted) inserted++;
	return { inserted, updated: rows.length - inserted };
}

async function main(): Promise<void> {
	const opts = parseArgs(process.argv.slice(2));
	const date = resolveDate(opts.date);

	const tracked = await loadTrackedCves();
	if (tracked.size === 0) throw new Error("aucune CVE suivie en base : rien à rafraîchir");

	let offset = 0;
	let total: number | null = null;
	let downloaded = 0;
	const retained: ScoreRow[] = [];
	const seenDate = new Set<string>();

	while (true) {
		if (offset > 0) await sleep(opts.pageDelayMs);
		const page = await fetchPage(offset, opts.limit, opts.date);
		if (page.total !== undefined && Number.isFinite(Number(page.total))) total = Number(page.total);
		const rows = asRows(page);
		if (rows.length === 0) break;

		for (const row of rows) {
			downloaded++;
			const cve = String(row.cve ?? "").trim().toUpperCase();
			if (!cve || !tracked.has(cve)) continue;
			const score = Number(row.epss);
			if (!Number.isFinite(score)) continue;
			const rawDate = typeof row.date === "string" ? row.date : date;
			seenDate.add(rawDate);
			const percentile = row.percentile === undefined || row.percentile === null ? null : Number(row.percentile);
			retained.push({ cve, score, percentile: percentile !== null && Number.isFinite(percentile) ? percentile : null, date: rawDate });
		}

		offset += rows.length;
		if (total !== null && offset >= total) break;
		// Garde-fou : une API qui renvoie toujours la même page ne boucle pas à l'infini.
		if (offset > 2_000_000) throw new Error("dépassement du plafond de pagination (API incohérente)");
	}

	const dumpDate = seenDate.size > 0 ? [...seenDate].sort().at(-1) ?? date : date;
	const coverage = ((retained.length / tracked.size) * 100).toFixed(1);
	console.log(`EPSS ${dumpDate} — téléchargées=${downloaded} (total API ${total ?? "?"}), retenues=${retained.length} `
		+ `sur ${tracked.size} CVE suivies (${coverage} %)`);

	const mirrored = retained.filter((row) => row.score >= EPSS_ADMISSION_THRESHOLD);
	console.log(`  score >= ${EPSS_ADMISSION_THRESHOLD} : ${mirrored.length} (seules celles-ci sont matérialisées dans event)`);

	if (!opts.apply) {
		console.log("  mode dry-run : aucune écriture (utiliser --apply)");
		console.log(`  event : ${mirrored.length} ligne(s) visée(s), insertion/mise à jour non calculée`);
		return;
	}

	if (mirrored.length > 0) {
		const eventUpsert = await ingestQuery<{ inserted: boolean }>(
			`INSERT INTO event (dedup_key, family, assertion_type, title, severity, confidence,
			                    source_id, source_url, evidence, geo_type, date_source)
			 SELECT 'epss:' || cve, 'vuln', 'technical_indicator', cve || ' — EPSS ' || score,
			        CASE WHEN score >= 0.5 THEN 5 ELSE 3 END, 'A2', 'epss',
			        'https://www.first.org/epss/',
			        jsonb_build_object('epss', score, 'percentile', coalesce(percentile, 0)),
			        'unknown', 'missing'
			   FROM unnest($1::text[], $2::numeric[], $3::numeric[]) AS t(cve, score, percentile)
			 ON CONFLICT (dedup_key) DO UPDATE SET
			   title = EXCLUDED.title, evidence = EXCLUDED.evidence, severity = EXCLUDED.severity
			 RETURNING (xmax = 0) AS inserted`,
			[mirrored.map((row) => row.cve), mirrored.map((row) => row.score), mirrored.map((row) => row.percentile)]
		);
		const eventCounts = splitCounts(eventUpsert.rows);
		console.log(`  event (source epss) : insérées=${eventCounts.inserted}, mises à jour=${eventCounts.updated}`);
	}
}

main()
	.catch((error: unknown) => {
		console.error(`refresh-epss : ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
