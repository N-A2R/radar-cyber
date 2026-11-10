/**
 * Triage des sources muettes : pourquoi une source ne produit-elle rien ?
 *
 * `scripts/source-health.mts` constate le silence ; ce script en cherche la
 * cause. Pour chaque source sans événement sur 30 jours, on sonde son URL en
 * HTTP (GET borné à 5 s, une requête par seconde au maximum) puis on classe :
 *
 *   disabled         source déjà désactivée, non sondée ;
 *   unreachable      timeout, DNS, TLS, URL invalide — rien à récupérer ;
 *   http_error       4xx/5xx explicite ;
 *   ok_but_empty     200, source collectée récemment, mais aucun item retenu
 *                    (filtre de pertinence, parser, ou flux réellement vide) ;
 *   never_collected 200, mais aucune collecte récente : rien n'a été tenté.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/triage-sources.mts            # dry-run (défaut)
 *   apps/api/node_modules/.bin/tsx scripts/triage-sources.mts --dry-run
 *   apps/api/node_modules/.bin/tsx scripts/triage-sources.mts --limit=50
 *   apps/api/node_modules/.bin/tsx scripts/triage-sources.mts --json
 *   apps/api/node_modules/.bin/tsx scripts/triage-sources.mts --apply    # écrit disabled_at
 *
 * `--apply` renseigne `source.disabled_at` / `disabled_reason` pour les seules
 * causes `http_error` et `unreachable`. Aucune source n'est supprimée, aucune
 * n'est mise à `enabled = false` par ce script.
 */
import { query, closePools } from "../apps/api/src/db.js";

type Cause = "http_error" | "unreachable" | "ok_but_empty" | "never_collected" | "disabled";

const CAUSES: Cause[] = ["http_error", "unreachable", "ok_but_empty", "never_collected", "disabled"];

interface CandidateRow {
	id: string;
	name: string;
	family: string;
	format: string;
	url: string;
	enabled: boolean;
	last_ok_at: Date | null;
	last_collect: Date | null;
	last_event: Date | null;
	last_error: string | null;
}

interface ProbeResult {
	status: number | null;
	error: string | null;
	elapsed_ms: number;
}

interface Triaged extends CandidateRow {
	cause: Cause;
	detail: string;
	elapsed_ms: number | null;
}

interface TriageReport {
	generatedAt: string;
	windowDays: number;
	dryRun: boolean;
	probed: number;
	counts: Record<Cause, number>;
	sources: Triaged[];
}

const WINDOW_DAYS = 30;
const PROBE_TIMEOUT_MS = 5_000;
const MIN_INTERVAL_MS = 1_000;
const USER_AGENT = "radar-cyber-source-triage/1.0 (+ops@radar-cyber.local)";

const SQL = `
WITH ev AS (
	SELECT source_id, max(collected_at) AS last_event
	FROM event
	GROUP BY source_id
),
col AS (
	SELECT source_id, max(started_at) AS last_collect
	FROM collector_run
	GROUP BY source_id
)
SELECT s.id,
       s.name,
       s.family,
       s.format,
       s.url,
       s.enabled,
       s.last_ok_at,
       s.last_error,
       c.last_collect,
       e.last_event
FROM source s
LEFT JOIN ev  e ON e.source_id = s.id
LEFT JOIN col c ON c.source_id = s.id
WHERE e.last_event IS NULL
   OR e.last_event < now() - ($1::int || ' days')::interval
ORDER BY s.family, s.id
`;

function isRecent(value: Date | null, now: number): boolean {
	return value !== null && now - value.getTime() < WINDOW_DAYS * 86_400_000;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Erreur réseau normalisée, sans `any` : on ne lit que les champs connus. */
function describeError(error: unknown): string {
	if (error instanceof Error) {
		let code: string | null = null;
		if ("cause" in error && error.cause !== null && typeof error.cause === "object" && "code" in error.cause) {
			const raw: unknown = error.cause.code;
			if (typeof raw === "string") code = raw;
		}
		const name = error.name === "TimeoutError" ? "timeout" : (code ?? error.name);
		return `${name}: ${error.message}`.slice(0, 160);
	}
	return String(error).slice(0, 160);
}

async function probe(url: string): Promise<ProbeResult> {
	const started = Date.now();
	try {
		const res = await fetch(url, {
			method: "GET",
			redirect: "follow",
			headers: { "user-agent": USER_AGENT, accept: "*/*" },
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
			cache: "no-store",
		});
		// On ne lit pas le corps : le status suffit et le socket est libéré.
		await res.body?.cancel();
		return { status: res.status, error: null, elapsed_ms: Date.now() - started };
	} catch (error) {
		return { status: null, error: describeError(error), elapsed_ms: Date.now() - started };
	}
}

/**
 * Limiteur de débit global : une sonde à la fois, jamais deux départs à moins
 * d'une seconde d'intervalle (326 sources ⇒ ~6 min).
 */
class RateLimitedProber {
	private lastStart = 0;
	private count = 0;

	async run(url: string): Promise<ProbeResult> {
		const wait = this.lastStart + MIN_INTERVAL_MS - Date.now();
		if (wait > 0) await sleep(wait);
		this.lastStart = Date.now();
		this.count++;
		return probe(url);
	}

	get probed(): number {
		return this.count;
	}
}

function classify(row: CandidateRow, result: ProbeResult | null, now: number): { cause: Cause; detail: string } {
	if (!row.enabled) return { cause: "disabled", detail: "source désactivée, non sondée" };
	if (result === null) return { cause: "never_collected", detail: "non sondée" };

	if (result.status === null) {
		if (!/^https?:\/\//i.test(row.url)) return { cause: "unreachable", detail: `url non http : ${row.url.slice(0, 60)}` };
		return { cause: "unreachable", detail: result.error ?? "erreur réseau inconnue" };
	}
	if (result.status >= 400) return { cause: "http_error", detail: `HTTP ${result.status}` };

	const collected = isRecent(row.last_collect, now) || isRecent(row.last_ok_at, now);
	if (collected) return { cause: "ok_but_empty", detail: `HTTP ${result.status}, collectée, 0 item` };
	return { cause: "never_collected", detail: `HTTP ${result.status}, jamais collectée` };
}

function fmtDate(value: Date | null): string {
	return value === null ? "—" : value.toISOString().slice(0, 10);
}

function cell(text: string): string {
	return text.replace(/\|/g, "\\|");
}

function render(report: TriageReport, sources: Triaged[]): string {
	const lines: string[] = [];
	lines.push(`# Triage des sources muettes — ${report.generatedAt.slice(0, 10)}${report.dryRun ? " (dry-run)" : ""}`);
	lines.push("");
	lines.push(`Fenêtre ${report.windowDays} j · ${report.sources.length} sources sans événement · ${report.probed} sondées en HTTP.`);
	lines.push("");
	lines.push("| Cause | Sources | Part |");
	lines.push("| --- | ---: | ---: |");
	const total = sources.length;
	for (const cause of CAUSES) {
		const n = report.counts[cause];
		const share = total === 0 ? 0 : Math.round((n / total) * 100);
		lines.push(`| ${cause} | ${n} | ${share} % |`);
	}
	lines.push("");
	for (const cause of CAUSES) {
		const rows = sources.filter((s) => s.cause === cause);
		if (rows.length === 0) continue;
		lines.push(`## ${cause} (${rows.length})`);
		lines.push("");
		lines.push("| Source | Famille | Format | HTTP / erreur | Dernière OK |");
		lines.push("| --- | --- | --- | --- | --- |");
		for (const s of rows) {
			lines.push(`| ${cell(s.name)} \`${cell(s.id)}\` | ${s.family} | ${s.format} | ${cell(s.detail)} | ${fmtDate(s.last_ok_at)} |`);
		}
		lines.push("");
	}
	return lines.join("\n");
}

function synthesis(report: TriageReport): string[] {
	const dead = report.counts.http_error + report.counts.unreachable;
	const lines = [
		`Synthèse — ${report.sources.length} sources muettes, ${report.probed} sondées.`,
		`Vraies mortes (http_error + unreachable) : ${dead}${report.dryRun ? " — candidates à la désactivation (--apply)" : " — traitées"}.`,
		`ok_but_empty : ${report.counts.ok_but_empty} (source vivante, aucun item retenu — à garder, cause côté parser/filtre).`,
		`never_collected : ${report.counts.never_collected} (jamais collectées — problème d'ordonnancement, pas de source).`,
		`disabled : ${report.counts.disabled} (déjà neutralisées).`,
	];
	return lines;
}

interface Options {
	dryRun: boolean;
	json: boolean;
	limit: number | null;
}

function parseArgs(argv: string[]): Options {
	const options: Options = { dryRun: true, json: false, limit: null };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--dry-run") {
			options.dryRun = true;
		} else if (arg === "--apply") {
			options.dryRun = false;
		} else if (arg === "--json") {
			options.json = true;
		} else if (arg === "--limit") {
			const raw = argv[i + 1];
			if (raw === undefined || raw.startsWith("--")) throw new Error("--limit attend un entier");
			options.limit = Number.parseInt(raw, 10);
			if (!Number.isInteger(options.limit) || options.limit <= 0) throw new Error("--limit doit être un entier positif");
			i++;
		} else {
			throw new Error(`argument inconnu : ${arg}`);
		}
	}
	return options;
}

async function loadCandidates(): Promise<CandidateRow[]> {
	const { rows } = await query<CandidateRow>(SQL, [WINDOW_DAYS]);
	return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled) }));
}

async function applyDisable(targets: Triaged[]): Promise<number> {
	let updated = 0;
	for (const target of targets) {
		const { rowCount } = await query(
			`UPDATE source
			    SET disabled_at = now(),
			        disabled_reason = $1
			  WHERE id = $2
			    AND enabled IS TRUE
			    AND disabled_at IS NULL`,
			[`${target.cause}: ${target.detail}`, target.id],
		);
		if ((rowCount ?? 0) > 0) updated++;
	}
	return updated;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const candidates = await loadCandidates();
	const limited = options.limit === null ? candidates : candidates.slice(0, options.limit);
	const now = Date.now();
	const prober = new RateLimitedProber();
	const sources: Triaged[] = [];

	for (const row of limited) {
		let result: ProbeResult | null = null;
		if (row.enabled) result = await prober.run(row.url);
		const { cause, detail } = classify(row, result, now);
		sources.push({ ...row, cause, detail, elapsed_ms: result?.elapsed_ms ?? null });
	}

	const counts: Record<Cause, number> = { http_error: 0, unreachable: 0, ok_but_empty: 0, never_collected: 0, disabled: 0 };
	for (const s of sources) counts[s.cause]++;

	const report: TriageReport = {
		generatedAt: new Date(now).toISOString(),
		windowDays: WINDOW_DAYS,
		dryRun: options.dryRun,
		probed: prober.probed,
		counts,
		sources,
	};

	const targets = sources.filter((s) => s.cause === "http_error" || s.cause === "unreachable");

	if (options.json) {
		process.stdout.write(JSON.stringify({ ...report, disabled: options.dryRun ? [] : targets.map((s) => s.id) }, null, 2) + "\n");
	} else {
		process.stdout.write(render(report, sources) + "\n");
		process.stdout.write(synthesis(report).join("\n") + "\n");
	}

	if (options.dryRun) {
		process.stdout.write(`dry-run : ${targets.length} désactivations simulées, aucune écriture.\n`);
	} else {
		const updated = await applyDisable(targets);
		process.stdout.write(`${updated} sources marquées disabled_at (${targets.length} candidates).\n`);
	}
}

try {
	await main();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`triage-sources: ${message}\n`);
	await closePools();
	process.exit(1);
}
await closePools();
process.exit(0);
