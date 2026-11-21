/**
 * Replay of silent-source detection over a 30-day window.
 *
 * The detector is evaluated on the hourly grid used in production. Each
 * detection is tied to the last real production timestamp of that source; a
 * pause is counted only when the source actually stayed quiet for at least
 * 24 hours. No delay is extrapolated and no victim data is read or written.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-silent-source.mts
 *
 *   ... --check   # fails if the published report no longer matches the base
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	CADENCE_WINDOW_DAYS,
	DAY_MS,
	HOUR_MS,
	MIN_CADENCE_DAYS,
	SILENCE_ALERT_HOURS,
	SILENT_SOURCE_RULE,
	detectSilentSource,
	summarizeSilenceDelays,
} from "../apps/api/src/detect/silent-source.js";
import {
	MIN_CONFIRMED_PAUSE_HOURS as MIN_PAUSE_HOURS,
	REPLAY_WINDOW_DAYS as WINDOW_DAYS,
	type ProductionRow,
	replaySilentSourceEpisodes,
} from "../apps/api/src/detect/silent-source-replay.js";

const REPORT_PATH = "docs/source-muette-24h.md";
const RESULT_PATH = "bench/results/silent-source-30d.json";


const PRODUCTION_SQL = `
SELECT cr.source_id, cr.finished_at AS produced_at
  FROM collector_run cr
  JOIN source s ON s.id = cr.source_id
 WHERE s.enabled = true
   AND s.statut IS DISTINCT FROM 'morte'
   AND cr.status = 'ok'
   AND cr.items_in > 0
   AND cr.finished_at >= $1::timestamptz
   AND cr.finished_at <= $2::timestamptz
 ORDER BY cr.source_id, cr.finished_at
`;

const BOUNDS_SQL = `
SELECT max(finished_at) AS last_run,
       min(finished_at) AS first_run,
       count(*)::int AS runs
  FROM collector_run
`;

function iso(epochMs: number): string {
	return new Date(epochMs).toISOString();
}

function french(value: number): string {
	return value.toFixed(2).replace(".", ",");
}

async function load(anchor: number): Promise<{
	production: ProductionRow[];
	firstRun: string | Date | null;
	runs: number;
}> {
	const bounds = await query<{ last_run: string | Date | null; first_run: string | Date | null; runs: number }>(BOUNDS_SQL);
	const { rows: production } = await query<ProductionRow>(PRODUCTION_SQL, [
		iso(anchor - (WINDOW_DAYS + CADENCE_WINDOW_DAYS) * DAY_MS),
		iso(anchor),
	]);
	return {
		production,
		firstRun: bounds.rows[0]?.first_run ?? null,
		runs: Number(bounds.rows[0]?.runs ?? 0),
	};
}


function fingerprint(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function renderMarkdown(result: {
	generatedFrom: string;
	windowStart: string;
	anchor: string;
	firstRun: string | null;
	runs: number;
	sources: number;
	episodes: number;
	summary: ReturnType<typeof summarizeSilenceDelays>;
	fingerprint: string;
}): string {
	const { summary: s } = result;
	const observedDays = result.firstRun
		? (Date.parse(result.anchor) - Date.parse(result.firstRun)) / DAY_MS
		: 0;
	const lines = [
		"# Source muette — délai de détection mesuré sur 30 jours",
		"",
		`Mesure rejouée sur la base de travail, ancrée au ${result.anchor}.`,
		`Fenêtre d'analyse : ${result.windowStart} → ${result.anchor} (${WINDOW_DAYS} jours, aucune extrapolation).`,
		`Collecte réellement observée : ${result.firstRun?.slice(0, 10) ?? "—"} → ${result.anchor.slice(0, 10)} (${french(observedDays)} jours) ; ${result.runs} passages de collecteur dans la base. Tous les épisodes comptés viennent de cette sous-fenêtre.`,
		"",
		"## Périmètre",
		"",
		"Sources actives du catalogue de l'observatoire Nouvelle-Aquitaine : aucun flux extérieur n'est ajouté pour élargir l'échantillon, aucun service payant n'est utilisé. Les sources grises déjà référencées restent éligibles ; aucune donnée personnelle de victime n'est lue.",
		"",
		"## Ce qui est compté",
		"",
		`Une source est éligible si elle est active, a produit sur au moins ${MIN_CADENCE_DAYS} jours UTC distincts durant les ${CADENCE_WINDOW_DAYS} jours précédant son dernier item, puis n'a plus rien produit depuis ${SILENCE_ALERT_HOURS} h. Le détecteur est évalué toutes les heures, comme en production. Un épisode n'est retenu que si la pause réelle a duré au moins ${MIN_PAUSE_HOURS} h : on mesure donc bien une source devenue muette, pas un simple trou de quelques heures.`,
		"",
		"## Résultat",
		"",
		`**Délai médian de détection : ${french(s.p50Hours)} h (p50)**, sur ${s.count} épisode(s) et ${result.sources} source(s) observée(s).`,
		"",
		"| Statistique | Heures |",
		"| --- | ---: |",
		`| p50 | ${french(s.p50Hours)} |`,
		`| p90 | ${french(s.p90Hours)} |`,
		`| max | ${french(s.maxHours)} |`,
		`| épisodes sous 24 h | ${s.under24h} / ${s.count} |`,
		"",
		`Le délai est mesuré entre le dernier item réellement produit et la première évaluation horaire qui déclenche l'alerte. Règle : \`${SILENT_SOURCE_RULE}\`. Empreinte base : \`${result.fingerprint}\`.`,
		"",
		"## Ce que ce chiffre ne mesure pas",
		"",
		"- Il ne mesure pas le délai entre la publication d'un incident et sa présence en base (autre mesure : `docs/delai-detection.md`).",
		"- Il n'extrapole pas sur les jours sans collecte : une source jamais collectée dans la fenêtre n'est pas dite muette.",
		"- Il ne contient aucune donnée de victime : seuls des identifiants publics de sources et des horodatages sont lus.",
		"",
		"## Reproduire",
		"",
		"```bash",
		"DATABASE_URL=postgres://radar:radar@localhost:5433/radar \\",
		"  apps/api/node_modules/.bin/tsx scripts/measure-silent-source.mts",
		"```",
		"",
		"Avec `--check`, la commande refuse toute dérive entre ce rapport et la base.",
		"",
	];
	return lines.join("\n");
}

async function main(): Promise<void> {
	const check = process.argv.includes("--check");
	const bound = await query<{ last_run: string | Date | null }>("SELECT max(finished_at) AS last_run FROM collector_run");
	const lastRun = bound.rows[0]?.last_run;
	if (lastRun === null || lastRun === undefined) throw new Error("no collector_run: nothing can be measured");
	const anchor = Math.floor(Date.parse(String(lastRun)) / HOUR_MS) * HOUR_MS;
	const windowStart = anchor - WINDOW_DAYS * DAY_MS;
	const loaded = await load(anchor);
	const detections = replaySilentSourceEpisodes(loaded.production, windowStart, anchor);
	const sources = new Set(detections.map((d) => d.sourceId)).size;
	const result = {
		generatedFrom: iso(anchor),
		windowStart: iso(windowStart),
		anchor: iso(anchor),
		firstRun: loaded.firstRun === null ? null : iso(Date.parse(String(loaded.firstRun))),
		runs: loaded.runs,
		sources,
		episodes: detections.length,
		productionRows: loaded.production.length,
		summary: summarizeSilenceDelays(detections.map((d) => d.delayHours)),
	};
	const signed = {
		...result,
		fingerprint: fingerprint({
			anchor: result.anchor,
			windowStart: result.windowStart,
			runs: result.runs,
			productionRows: result.productionRows,
			episodes: result.episodes,
		}),
	};
	if (check) {
		const published = JSON.parse(readFileSync(RESULT_PATH, "utf8")) as typeof signed;
		if (JSON.stringify(published) !== JSON.stringify(signed)) {
			throw new Error("published silent-source measurement is stale: rerun without --check");
		}
		process.stdout.write(`silent-source: ${signed.summary.p50Hours} h p50 sur ${signed.summary.count} épisode(s) — rapport conforme\n`);
		return;
	}
	writeFileSync(RESULT_PATH, `${JSON.stringify(signed, null, 2)}\n`, "utf8");
	writeFileSync(REPORT_PATH, renderMarkdown(signed), "utf8");
	process.stdout.write(`silent-source: ${signed.summary.p50Hours} h p50 sur ${signed.summary.count} épisode(s) — ${REPORT_PATH}\n`);
}

try {
	await main();
} catch (error) {
	process.stderr.write(`measure-silent-source: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
} finally {
	await closePools();
}
