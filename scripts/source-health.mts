/**
 * Rendement des sources : lesquelles produisent réellement.
 *
 * Le tableau de santé (`/sources`) dit si une source répond ; ce script dit ce
 * qu'elle rapporte. Une source est classée sur deux axes distincts :
 *   - le volume récent (événements collectés sur 30 jours) ;
 *   - la fraîcheur de la collecte (`collector_run` sur 7 jours).
 *
 * Usage :
 *   pnpm exec tsx scripts/source-health.mts
 *   pnpm exec tsx scripts/source-health.mts --out /tmp/sources.md
 *   pnpm exec tsx scripts/source-health.mts --json > /tmp/sources.json
 *
 * Lecture seule : deux agrégats bornés, aucun `SELECT *`, aucun verrou.
 */
import { query, closePools } from "../apps/api/src/db.js";

type Category = "muettes" | "faibles" | "saines" | "dormantes";

interface SourceRow {
	id: string;
	name: string;
	family: string;
	enabled: boolean;
	events_total: number;
	events_30d: number;
	last_event: Date | null;
	indicators: number;
	last_collect: Date | null;
	median_gap_sec: number | null;
}

interface SourceHealth extends SourceRow {
	category: Category;
}

interface HealthReport {
	generatedAt: string;
	windowDays: number;
	dormantDays: number;
	counts: Record<Category, number>;
	sources: SourceHealth[];
}

const EVENT_WINDOW_DAYS = 30;
const DORMANT_DAYS = 7;
const WEAK_MAX_EVENTS = 5;

const SQL = `
WITH recent_runs AS (
	SELECT source_id,
	       started_at,
	       lag(started_at) OVER (PARTITION BY source_id ORDER BY started_at) AS previous
	FROM collector_run
	WHERE started_at >= now() - ($1::int || ' days')::interval
),
gaps AS (
	SELECT source_id,
	       percentile_cont(0.5) WITHIN GROUP (
	         ORDER BY extract(epoch FROM (started_at - previous))
	       ) AS median_gap_sec
	FROM recent_runs
	WHERE previous IS NOT NULL
	GROUP BY source_id
),
events AS (
	SELECT source_id,
	       count(*)::int AS events_total,
	       count(*) FILTER (WHERE collected_at >= now() - ($1::int || ' days')::interval)::int AS events_30d,
	       max(collected_at) AS last_event
	FROM event
	GROUP BY source_id
),
indicators AS (
	SELECT source_id, count(*)::int AS indicators
	FROM indicator
	GROUP BY source_id
),
collects AS (
	SELECT source_id, max(started_at) AS last_collect
	FROM collector_run
	GROUP BY source_id
)
SELECT s.id,
       s.name,
       s.family,
       s.enabled,
       coalesce(e.events_total, 0) AS events_total,
       coalesce(e.events_30d, 0)   AS events_30d,
       e.last_event,
       coalesce(i.indicators, 0)   AS indicators,
       c.last_collect,
       g.median_gap_sec
FROM source s
LEFT JOIN events e     ON e.source_id = s.id
LEFT JOIN indicators i ON i.source_id = s.id
LEFT JOIN collects c   ON c.source_id = s.id
LEFT JOIN gaps g       ON g.source_id = s.id
ORDER BY s.id
`;

function classify(row: SourceRow, now: number): Category {
	const dormantSince = now - DORMANT_DAYS * 86_400_000;
	// La dormance prime : une source qu'on n'a pas collectée n'est pas muette,
	// on ignore simplement ce qu'elle aurait rapporté.
	if (row.last_collect === null || row.last_collect.getTime() < dormantSince) return "dormantes";
	if (row.events_30d === 0) return "muettes";
	if (row.events_30d <= WEAK_MAX_EVENTS) return "faibles";
	return "saines";
}

function fmtDate(value: Date | null): string {
	if (value === null) return "—";
	return value.toISOString().slice(0, 10);
}

function fmtGap(seconds: number | null): string {
	if (seconds === null || !Number.isFinite(seconds)) return "—";
	if (seconds < 90) return `${Math.round(seconds)} s`;
	if (seconds < 5_400) return `${Math.round(seconds / 60)} min`;
	if (seconds < 129_600) return `${(seconds / 3_600).toFixed(1)} h`;
	return `${(seconds / 86_400).toFixed(1)} j`;
}

function cell(text: string): string {
	return text.replace(/\|/g, "\\|");
}

function renderMarkdown(report: HealthReport): string {
	const lines: string[] = [];
	const window = report.windowDays;
	lines.push(`# Rendement des sources — ${report.generatedAt.slice(0, 10)}`);
	lines.push("");
	lines.push("| Source | Famille | Événements | Événements 30 j | Dernier | Indicateurs | Médiane collecte | Catégorie |");
	lines.push("| --- | --- | ---: | ---: | --- | ---: | ---: | --- |");
	for (const s of report.sources) {
		lines.push(
			`| ${cell(s.name)} \`${cell(s.id)}\` | ${s.family} | ${s.events_total} | ${s.events_30d} | ${fmtDate(s.last_event)} | ${s.indicators} | ${fmtGap(s.median_gap_sec)} | ${s.category} |`,
		);
	}
	lines.push("");
	lines.push(...synthesis(report, window));
	lines.push("");
	return lines.join("\n");
}

function synthesis(report: HealthReport, window: number): string[] {
	const { counts } = report;
	const total = report.sources.length;
	const active = report.sources.filter((s) => s.enabled).length;
	const productive = counts.saines;
	const share = total === 0 ? 0 : Math.round((productive / total) * 100);
	return [
		`**Synthèse** — ${total} sources (${active} actives), fenêtre ${window} j.`,
		`Saines : ${counts.saines} (> ${WEAK_MAX_EVENTS} événements sur ${window} j), soit ${share} % du parc.`,
		`Faibles : ${counts.faibles} (1 à ${WEAK_MAX_EVENTS} événements sur ${window} j).`,
		`Muettes : ${counts.muettes} (aucun événement sur ${window} j, mais collectées récemment).`,
		`Dormantes : ${counts.dormantes} (aucune collecte depuis ${DORMANT_DAYS} j) — rendement inconnu, à ne pas confondre avec muettes.`,
	];
}

interface Options {
	out: string | null;
	json: boolean;
}

function parseArgs(argv: string[]): Options {
	const options: Options = { out: null, json: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--json") {
			options.json = true;
		} else if (arg === "--out") {
			const target = argv[i + 1];
			if (target === undefined || target.startsWith("--")) throw new Error("--out attend un chemin de fichier");
			options.out = target;
			i++;
		} else {
			throw new Error(`argument inconnu : ${arg}`);
		}
	}
	if (options.json && options.out !== null) throw new Error("--json et --out sont exclusifs");
	return options;
}

async function loadRows(): Promise<SourceRow[]> {
	const { rows } = await query<SourceRow>(SQL, [EVENT_WINDOW_DAYS]);
	return rows.map((row) => ({
		...row,
		events_total: Number(row.events_total),
		events_30d: Number(row.events_30d),
		indicators: Number(row.indicators),
		median_gap_sec: row.median_gap_sec === null ? null : Number(row.median_gap_sec),
	}));
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const rows = await loadRows();
	const now = Date.now();

	const sources: SourceHealth[] = rows
		.map((row) => ({ ...row, category: classify(row, now) }))
		.sort((a, b) => b.events_30d - a.events_30d || b.events_total - a.events_total || a.id.localeCompare(b.id));

	const counts: Record<Category, number> = { muettes: 0, faibles: 0, saines: 0, dormantes: 0 };
	for (const s of sources) counts[s.category]++;

	const report: HealthReport = {
		generatedAt: new Date(now).toISOString(),
		windowDays: EVENT_WINDOW_DAYS,
		dormantDays: DORMANT_DAYS,
		counts,
		sources,
	};

	if (options.json) {
		process.stdout.write(JSON.stringify(report, null, 2) + "\n");
	} else if (options.out !== null) {
		const { writeFile } = await import("node:fs/promises");
		await writeFile(options.out, renderMarkdown(report), "utf8");
		process.stdout.write(synthesis(report, EVENT_WINDOW_DAYS).join("\n") + "\n");
		process.stdout.write(`tableau complet : ${options.out}\n`);
	} else {
		process.stdout.write(renderMarkdown(report));
	}
}

try {
	await main();
} finally {
	await closePools();
}
process.exit(0);
