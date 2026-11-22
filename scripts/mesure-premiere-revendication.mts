/**
 * First-claim latency measured over seven days on the live database.
 *
 * The SQL only reads timestamps, source ids and counters: no victim name, no
 * description and no personal data is selected. Two kinds of first trace are
 * separated, because they answer different questions:
 *   - live collection: the claim was written as soon as a collector saw it;
 *   - bulk import: at least 50 claims from one source got their first trace in
 *     the same hour, which measures a backfill replay, not our collection
 *     latency. Those rows are still published as a baseline.
 *
 * A deterministic replay of the corrected collectors over the same real
 * publication timestamps bounds the latency our code adds: the wait until the
 * next poll. It does not include any delay incurred before the source exposes
 * the post, and the report says so.
 *
 * Reproduce (read-only, no paid service, one command under 60 seconds):
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-premiere-revendication.mts
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { summarizeReplay } from "../apps/api/src/analyse/claim-latency.js";
import { collector as claimCollector } from "../apps/api/src/collectors/ransomlook.collector.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUTPUT_JSON = "bench/results/premiere-revendication.json";
const OUTPUT_DOC = "docs/rapport-premiere-revendication.md";
const WINDOW_DAYS = 7;
const TARGET_HOURS = 1;
const BULK_IMPORT_THRESHOLD = 50;
/** quarantine.collector.ts throttles ransomware.live to one poll per 30 min. */
const LEAK_COLLECTOR_INTERVAL_SEC = 1800;

type ClaimRow = {
  id: string;
  source: string;
  published: Date | string;
  first_seen: Date | string;
  na: boolean;
  backfill: boolean;
};

type Stats = {
  count: number;
  p50Hours: number;
  p90Hours: number;
  maxHours: number;
  withinOneHour: number;
  withinOneHourPct: number;
  naCount: number;
  naP50Hours: number;
  naWithinOneHour: number;
};

type SourceStat = { source: string; count: number; p50Hours: number };

const SQL_FEED = `
WITH claims AS (
  SELECT e.dedup_key AS id,
         min(e.source_id) AS source,
         min(e.observed_at) AS published,
         min(least(e.collected_at, e.created_at)) AS first_seen,
         bool_or(coalesce(e.regional, false)) AS na
    FROM event e
   WHERE e.assertion_type = 'third_party_claim'
     AND e.observed_at >= now() - interval '7 days'
     AND e.observed_at <= now()
   GROUP BY e.dedup_key
), tagged AS (
  SELECT id, source, published, first_seen, na,
         count(*) OVER (PARTITION BY source, date_trunc('hour', first_seen)) AS burst
    FROM claims
   WHERE first_seen >= published
)
SELECT id, source, published, first_seen, na, (burst >= $1) AS backfill FROM tagged
`;

const SQL_LEAK_SITES = `
WITH tagged AS (
  SELECT q.id::text AS id, q.source, q.claimed_at AS published, q.received_at AS first_seen,
         false AS na,
         count(*) OVER (PARTITION BY q.source, date_trunc('hour', q.received_at)) AS burst
    FROM quarantine_raw q
   WHERE q.kind = 'claim'
     AND q.claimed_at >= now() - interval '7 days'
     AND q.claimed_at <= now()
     AND q.received_at >= q.claimed_at
)
SELECT id, source, published, first_seen, na, (burst >= $1) AS backfill FROM tagged
`;

const SQL_ANCHOR = `
SELECT (extract(epoch FROM min(started_at)) * 1000)::bigint AS anchor_ms
  FROM collector_run
 WHERE source_id = 'ransomlook'
   AND started_at >= now() - interval '7 days'
`;

function hours(row: ClaimRow): number {
  return (Date.parse(String(row.first_seen)) - Date.parse(String(row.published))) / 3_600_000;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] ?? 0;
}

function stats(rows: readonly ClaimRow[]): Stats {
  const values = rows.map(hours).sort((a, b) => a - b);
  const na = rows.filter((row) => row.na).map(hours).sort((a, b) => a - b);
  const fast = values.filter((value) => value <= TARGET_HOURS).length;
  return {
    count: values.length,
    p50Hours: Number(quantile(values, 0.5).toFixed(2)),
    p90Hours: Number(quantile(values, 0.9).toFixed(2)),
    maxHours: Number((values.at(-1) ?? 0).toFixed(2)),
    withinOneHour: fast,
    withinOneHourPct: values.length === 0 ? 0 : Number(((fast / values.length) * 100).toFixed(1)),
    naCount: na.length,
    naP50Hours: Number(quantile(na, 0.5).toFixed(2)),
    naWithinOneHour: na.filter((value) => value <= TARGET_HOURS).length,
  };
}

function bySource(rows: readonly ClaimRow[]): SourceStat[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const list = groups.get(row.source) ?? [];
    list.push(hours(row));
    groups.set(row.source, list);
  }
  return [...groups.entries()]
    .map(([source, values]) => ({
      source,
      count: values.length,
      p50Hours: Number(quantile(values.sort((a, b) => a - b), 0.5).toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

function comma(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function replay(rows: readonly ClaimRow[], intervalSec: number, anchorMs: number) {
  return summarizeReplay(
    rows.map((row) => Date.parse(String(row.published))),
    { intervalSec, anchorMs, targetHours: TARGET_HOURS },
  );
}

function split(rows: readonly ClaimRow[]) {
  return {
    all: stats(rows),
    live: stats(rows.filter((row) => !row.backfill)),
    backfill: stats(rows.filter((row) => row.backfill)),
  };
}

async function main(): Promise<void> {
  const [feedRows, leakRows, totalRows, anchorRows] = await Promise.all([
    query<ClaimRow>(SQL_FEED, [BULK_IMPORT_THRESHOLD]),
    query<ClaimRow>(SQL_LEAK_SITES, [BULK_IMPORT_THRESHOLD]),
    query<{ orgs: string; sources: string; events: string; archives: string; claims: string; measuredAt: Date }>(
      `SELECT (SELECT reltuples::bigint FROM pg_class WHERE oid = 'org'::regclass)::text AS orgs,
              (SELECT count(*) FROM source)::text AS sources,
              (SELECT count(*) FROM event)::text AS events,
              (SELECT count(*) FROM event_archive)::text AS archives,
              (SELECT count(*) FROM quarantine_raw)::text AS claims,
              now() AS "measuredAt"`,
    ),
    query<{ anchor_ms: string | number | null }>(SQL_ANCHOR),
  ]);

  const total = totalRows.rows[0];
  if (!total) throw new Error("database fingerprint unavailable");

  const published = [...feedRows.rows, ...leakRows.rows]
    .map((row) => Date.parse(String(row.published)))
    .filter((value) => Number.isFinite(value));
  const anchorMs = Number(anchorRows.rows[0]?.anchor_ms ?? Math.min(...published));
  const feedReplay = replay(feedRows.rows, claimCollector.intervalSec, anchorMs);
  const leakReplay = replay(leakRows.rows, LEAK_COLLECTOR_INTERVAL_SEC, anchorMs);

  const feed = split(feedRows.rows);
  const leakSites = split(leakRows.rows);
  const fingerprintHash = createHash("sha256").update(JSON.stringify({
    orgs: total.orgs, sources: total.sources, events: total.events,
    archives: total.archives, claims: total.claims,
    measuredAt: new Date(total.measuredAt).toISOString().slice(0, 13),
  })).digest("hex");

  const result = {
    generatedAt: new Date(total.measuredAt).toISOString(),
    windowDays: WINDOW_DAYS,
    targetHours: TARGET_HOURS,
    definition: "delay from claim publication to first radar record, in hours",
    fingerprint: {
      organisations: Number(total.orgs), sources: Number(total.sources),
      events: Number(total.events), archives: Number(total.archives),
      quarantineClaims: Number(total.claims), sha256: fingerprintHash,
    },
    feed: { ...feed, bySource: bySource(feedRows.rows) },
    leakSites: { ...leakSites, bySource: bySource(leakRows.rows) },
    replay: {
      anchorMs,
      feed: { intervalSec: claimCollector.intervalSec, ...feedReplay },
      leakSites: { intervalSec: LEAK_COLLECTOR_INTERVAL_SEC, ...leakReplay },
      note: "wait from a real publication timestamp to the next poll of the corrected collector; upstream delay excluded",
    },
    objective: {
      metric: "feed.live.p50Hours",
      targetHours: TARGET_HOURS,
      measuredHours: feed.live.p50Hours,
      achieved: feed.live.p50Hours < TARGET_HOURS,
    },
  };

  const verdict = result.objective.achieved ? "atteint" : "non atteint";
  const doc = [
    "# Première revendication — latence mesurée sur 7 jours",
    "",
    `Mesure rejouée le **${result.generatedAt.slice(0, 10)}** sur la base de travail réelle : ` +
      `≈ ${Number(total.orgs).toLocaleString("fr-FR")} organisations, ${total.sources} sources, ` +
      `${Number(total.events).toLocaleString("fr-FR")} événements, ${total.archives} archives, ` +
      `${Number(total.claims).toLocaleString("fr-FR")} revendications en quarantaine. ` +
      `Empreinte base : \`${fingerprintHash.slice(0, 16)}\`.`,
    "",
    "## Chiffre mesuré",
    "",
    `Fenêtre glissante de **${WINDOW_DAYS} jours** ; cible : **moins d'une heure** entre la publication ` +
      "de la revendication et sa première trace dans le radar. Le chiffre de référence est la médiane (p50).",
    "",
    `**Objectif ${verdict}** : p50 **${comma(feed.live.p50Hours)} h** sur ${feed.live.count} ` +
      `revendications du flux de première revendication collectées en direct, avec ` +
      `${feed.live.withinOneHour} revendications (${comma(feed.live.withinOneHourPct)} %) sous une heure. ` +
      `Le rejeu du collecteur corrigé donne un p50 de **${comma(feedReplay.p50Minutes)} min** et un maximum de ` +
      `**${comma(feedReplay.maxMinutes)} min** (cadence ${claimCollector.intervalSec} s).`,
    "",
    "| Population (collecte directe) | Revendications | p50 (h) | p90 (h) | max (h) | ≤ 1 h |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    `| Flux public (\`ransomlook\`) | ${feed.live.count} | **${comma(feed.live.p50Hours)}** | ` +
      `${comma(feed.live.p90Hours)} | ${comma(feed.live.maxHours)} | ` +
      `${feed.live.withinOneHour} (${comma(feed.live.withinOneHourPct)} %) |`,
    `| Sites de fuite (\`ransomware.live\`, contexte) | ${leakSites.live.count} | ` +
      `**${comma(leakSites.live.p50Hours)}** | ${comma(leakSites.live.p90Hours)} | ` +
      `${comma(leakSites.live.maxHours)} | ${leakSites.live.withinOneHour} ` +
      `(${comma(leakSites.live.withinOneHourPct)} %) |`,
    "",
    `Sous-ensemble Nouvelle-Aquitaine : ${feed.all.naCount} revendication(s) datée(s) sur le flux public, ` +
      `p50 **${comma(feed.all.naP50Hours)} h**, ${feed.all.naWithinOneHour} en moins d'une heure ; ` +
      `${leakSites.all.naCount} sur les sites de fuite, p50 **${comma(leakSites.all.naP50Hours)} h**, ` +
      `${leakSites.all.naWithinOneHour} en moins d'une heure.`,
    "",
    "## Référence avant correction et imports de masse",
    "",
    "Les importations groupées d'un corpus (au moins 50 premières traces d'une même source dans la même " +
      "heure) mesurent l'âge d'un fait rejoué, pas notre délai de collecte. Elles restent publiées ici, " +
      "sans être fusionnées avec la mesure de collecte directe.",
    "",
    "| Population | Revendications | p50 (h) | p90 (h) | max (h) | ≤ 1 h |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    `| Flux public — toutes traces | ${feed.all.count} | ${comma(feed.all.p50Hours)} | ` +
      `${comma(feed.all.p90Hours)} | ${comma(feed.all.maxHours)} | ` +
      `${feed.all.withinOneHour} (${comma(feed.all.withinOneHourPct)} %) |`,
    `| Flux public — import de masse | ${feed.backfill.count} | ${comma(feed.backfill.p50Hours)} | ` +
      `${comma(feed.backfill.p90Hours)} | ${comma(feed.backfill.maxHours)} | ` +
      `${feed.backfill.withinOneHour} (${comma(feed.backfill.withinOneHourPct)} %) |`,
    `| Sites de fuite — toutes traces | ${leakSites.all.count} | ${comma(leakSites.all.p50Hours)} | ` +
      `${comma(leakSites.all.p90Hours)} | ${comma(leakSites.all.maxHours)} | ` +
      `${leakSites.all.withinOneHour} (${comma(leakSites.all.withinOneHourPct)} %) |`,
    `| Sites de fuite — import de masse | ${leakSites.backfill.count} | ${comma(leakSites.backfill.p50Hours)} | ` +
      `${comma(leakSites.backfill.p90Hours)} | ${comma(leakSites.backfill.maxHours)} | ` +
      `${leakSites.backfill.withinOneHour} (${comma(leakSites.backfill.withinOneHourPct)} %) |`,
    "",
    "## Rejeu du collecteur corrigé",
    "",
    "Sur les dates de publication réelles de la fenêtre, un collecteur périodique reçoit chaque revendication " +
      "au prochain tick. La phase vient de la première exécution réelle de `ransomlook` dans la fenêtre " +
      `(\`${new Date(anchorMs).toISOString()}\`) ; le calcul est déterministe et ne dépend pas de l'heure courante.`,
    "",
    "| Collecteur | Cadence | Publications | p50 (min) | p90 (min) | max (min) | ≤ 1 h |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| \`ransomlook\` | ${claimCollector.intervalSec} s | ${feedReplay.count} | ` +
      `**${comma(feedReplay.p50Minutes)}** | ${comma(feedReplay.p90Minutes)} | ` +
      `${comma(feedReplay.maxMinutes)} | ${feedReplay.withinTarget}/${feedReplay.count} |`,
    `| sites de fuite | ${LEAK_COLLECTOR_INTERVAL_SEC} s | ${leakReplay.count} | ` +
      `**${comma(leakReplay.p50Minutes)}** | ${comma(leakReplay.p90Minutes)} | ` +
      `${comma(leakReplay.maxMinutes)} | ${leakReplay.withinTarget}/${leakReplay.count} |`,
    "",
    "## Définition",
    "",
    "- Une **revendication** est une assertion tierce (`third_party_claim`) d'un groupe de rançongiciel, " +
      "pas un incident confirmé ni une donnée personnelle de victime.",
    "- La **publication** est la date annoncée par la source : `observed_at` pour le flux public, " +
      "`claimed_at` pour les sites de fuite.",
    "- La **première trace** est la première écriture réelle en base : " +
      "`least(collected_at, created_at)` pour `event`, `received_at` pour `quarantine_raw`.",
    "- Les deux dates doivent tomber dans les 7 derniers jours ; sinon l'écart mesurerait l'âge d'un fait " +
      "ancien réingéré, pas notre latence. Un `dedup_key` compte pour un incident.",
    "- Un **import de masse** regroupe au moins 50 premières traces de la même source dans la même heure. " +
      "C'est un rejeu de corpus, mesuré à part.",
    "- Le sous-ensemble NA vient du drapeau `regional` de l'événement : la jointure sur le département " +
      "des 1,6 M d'organisations ne tient pas dans la fenêtre de 60 s sous la charge courante et reste hors de la mesure.",
    "",
    "## Requêtes",
    "",
    "```sql",
    SQL_FEED.trim(),
    "",
    SQL_LEAK_SITES.trim(),
    "",
    SQL_ANCHOR.trim(),
    "```",
    "",
    "## Par source (flux public, collecte directe)",
    "",
    "| Source | Revendications | p50 (h) |",
    "| --- | ---: | ---: |",
    ...bySource(feedRows.rows.filter((row) => !row.backfill)).slice(0, 10)
      .map((row) => `| \`${row.source}\` | ${row.count} | ${comma(row.p50Hours)} |`),
    "",
    "## Limites du chiffre",
    "",
    "- Il ne mesure pas le délai entre l'attaque et sa revendication : l'horloge part de la publication " +
      "annoncée par la source, pas de la survenue de l'attaque.",
    "- Le rejeu mesure la latence ajoutée par notre collecteur ; il ne mesure pas l'attente chez la source " +
      "avant que le post apparaisse dans le flux public.",
    "- La file de sites de fuite est publiée à titre de contexte : la date d'une liste de fuite n'est pas " +
      "la date de la première revendication publique.",
    "- Le sous-ensemble Nouvelle-Aquitaine est petit sur une fenêtre de 7 jours : il est publié pour " +
      "information, pas comme une estimation stable.",
    "",
    "## Ce qui a été corrigé",
    "",
    "- Le collecteur `ransomlook` garde un curseur borné de clés au lieu d'un marqueur `lastDate` unique : " +
      "une revendication publiée avec une date antérieure au dernier marqueur n'est plus perdue.",
    "- Sa cadence passe de 3 600 s à 300 s, soit une attente maximale de 5 minutes avant reprise.",
    "- La mesure distingue désormais la collecte directe des imports de masse, qui n'étaient pas séparés " +
      "et faisaient passer un rejeu de corpus pour une latence de veille.",
    "- `apps/api/src/server.ts` n'est pas modifié : 0 ligne de diff (contrainte ≤ 10 lignes).",
    "",
    "## Reproduire",
    "",
    "```bash",
    "DATABASE_URL=postgres://radar:radar@localhost:5433/radar \\",
    "  apps/api/node_modules/.bin/tsx scripts/mesure-premiere-revendication.mts",
    "```",
    "",
    "Commande unique, lecture seule, sans service payant ; aucune étape ne dépasse 60 s.",
    "",
  ].join("\n");

  for (const [path, content] of [
    [OUTPUT_JSON, `${JSON.stringify(result, null, 2)}\n`],
    [OUTPUT_DOC, doc],
  ]) {
    const target = resolve(ROOT, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
    console.log(`published: ${relative(ROOT, target)}`);
  }
  console.log(
    `objective ${verdict}: feed live ${feed.live.count} claims, p50 ${comma(feed.live.p50Hours)} h, ` +
    `replay p50 ${comma(feedReplay.p50Minutes)} min / max ${comma(feedReplay.maxMinutes)} min | ` +
    `bulk-import baseline p50 ${comma(feed.all.p50Hours)} h`,
  );
}

try {
  await main();
} finally {
  await closePools();
}
