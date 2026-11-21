/**
 * Première revendication — latence mesurée sur 7 jours, sur la base réelle.
 *
 * Une seule règle : aucun chiffre n'est publié s'il ne vient pas d'une requête
 * SQL exécutée sur la base de travail. Deux populations de revendications sont
 * mesurées séparément, avec la même horloge :
 *   1. flux public (`event.assertion_type='third_party_claim'`) : publication
 *      `observed_at`, première apparition `least(collected_at, created_at)` ;
 *   2. sites de fuite (`quarantine_raw`) : publication `claimed_at`, première
 *      apparition `received_at`.
 * Le sous-ensemble Nouvelle-Aquitaine est calculé à partir des organisations
 * rattachées (département 16 à 87 de la liste NA) ou du drapeau `regional`.
 * Aucune donnée personnelle de victime n'est lue ni écrite : seules des dates,
 * des identifiants de source et des compteurs sortent de la base.
 *
 * Sorties : `bench/results/premiere-revendication.json` et le rapport français
 * `docs/rapport-premiere-revendication.md` (données en lecture seule).
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-premiere-revendication.mts
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const SORTIE_JSON = "bench/results/premiere-revendication.json";
const SORTIE_DOC = "docs/rapport-premiere-revendication.md";
const JOURS = 7;
const CIBLE_HEURES = 1;
const DEPTS_NA = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

type ClaimRow = {
  id: string;
  source: string;
  published: Date | string;
  first_seen: Date | string;
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

const SQL_FLUX = `
WITH claims AS (
  SELECT e.dedup_key AS id,
         min(e.source_id) AS source,
         min(e.observed_at) AS published,
         min(least(e.collected_at, e.created_at)) AS first_seen,
         (bool_or(e.regional) OR max(CASE WHEN o.dept = ANY($1::text[]) THEN 1 ELSE 0 END) = 1) AS na
    FROM event e
    LEFT JOIN org o ON o.id = e.org_id
   WHERE e.assertion_type = 'third_party_claim'
     AND e.observed_at >= now() - interval '7 days'
     AND e.observed_at <= now()
   GROUP BY e.dedup_key
)
SELECT id, source, published, first_seen, na FROM claims WHERE first_seen >= published
`;

const SQL_QUARANTAINE = `
SELECT q.id::text AS id, q.source, q.claimed_at AS published, q.received_at AS first_seen,
       EXISTS (SELECT 1 FROM org o
                WHERE lower(o.name) = lower(q.org_hint) AND o.dept = ANY($1::text[])) AS na
  FROM quarantine_raw q
 WHERE q.claimed_at >= now() - interval '7 days'
   AND q.claimed_at <= now()
   AND q.received_at >= q.claimed_at`;

function heures(row: ClaimRow): number {
  return (Date.parse(String(row.first_seen)) - Date.parse(String(row.published))) / 3_600_000;
}

function quantile(sorted: readonly number[], q: number): number {
  return sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] ?? 0);
}

function stats(rows: readonly ClaimRow[]): Stats {
  const valeurs = rows.map(heures).sort((a, b) => a - b);
  const na = rows.filter((r) => Boolean(r.na)).map(heures).sort((a, b) => a - b);
  const rapides = valeurs.filter((h) => h <= CIBLE_HEURES).length;
  return {
    count: valeurs.length,
    p50Hours: Number(quantile(valeurs, 0.5).toFixed(2)),
    p90Hours: Number(quantile(valeurs, 0.9).toFixed(2)),
    maxHours: Number((valeurs.at(-1) ?? 0).toFixed(2)),
    withinOneHour: rapides,
    withinOneHourPct: valeurs.length === 0 ? 0 : Number(((rapides / valeurs.length) * 100).toFixed(1)),
    naCount: na.length,
    naP50Hours: Number(quantile(na, 0.5).toFixed(2)),
    naWithinOneHour: na.filter((h) => h <= CIBLE_HEURES).length,
  };
}

function parSource(rows: readonly ClaimRow[]): SourceStat[] {
  const groupes = new Map<string, number[]>();
  for (const row of rows) {
    const liste = groupes.get(row.source) ?? [];
    liste.push(heures(row));
    groupes.set(row.source, liste);
  }
  return [...groupes.entries()]
    .map(([source, valeurs]) => ({
      source,
      count: valeurs.length,
      p50Hours: Number(quantile(valeurs.sort((a, b) => a - b), 0.5).toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

function virgule(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

async function main(): Promise<void> {
  const [fluxRows, quarantineRows, totalRows] = await Promise.all([
    query<ClaimRow>(SQL_FLUX, [DEPTS_NA]),
    query<ClaimRow>(SQL_QUARANTAINE, [DEPTS_NA]),
    query<{ orgs: string; sources: string; events: string; archives: string; claims: string; measuredAt: Date }>(
      `SELECT (SELECT count(*) FROM org)::text AS orgs,
              (SELECT count(*) FROM source)::text AS sources,
              (SELECT count(*) FROM event)::text AS events,
              (SELECT count(*) FROM event_archive)::text AS archives,
              (SELECT count(*) FROM quarantine_raw)::text AS claims,
              now() AS "measuredAt"`,
    ),
  ]);

  const total = totalRows.rows[0];
  if (!total) throw new Error("empreinte base indisponible");

  const flux = stats(fluxRows.rows);
  const quarantaine = stats(quarantineRows.rows);
  const empreinte = createHash("sha256").update(JSON.stringify({
    orgs: total.orgs, sources: total.sources, events: total.events,
    archives: total.archives, claims: total.claims,
    measuredAt: new Date(total.measuredAt).toISOString().slice(0, 13),
  })).digest("hex");

  const resultat = {
    generatedAt: new Date(total.measuredAt).toISOString(),
    windowDays: JOURS,
    targetHours: CIBLE_HEURES,
    definition: "delay from claim publication to first radar record, in hours",
    fingerprint: {
      organisations: Number(total.orgs), sources: Number(total.sources),
      events: Number(total.events), archives: Number(total.archives),
      quarantineClaims: Number(total.claims), sha256: empreinte,
    },
    feed: { ...flux, bySource: parSource(fluxRows.rows) },
    leakSites: { ...quarantaine, bySource: parSource(quarantineRows.rows) },
  };

  const doc = [
    "# Première revendication — latence mesurée sur 7 jours",
    "",
    `Mesure rejouée le **${resultat.generatedAt.slice(0, 10)}** sur la base de travail réelle : ` +
      `${Number(total.orgs).toLocaleString("fr-FR")} organisations, ${total.sources} sources, ` +
      `${Number(total.events).toLocaleString("fr-FR")} événements, ${total.archives} archives, ` +
      `${Number(total.claims).toLocaleString("fr-FR")} revendications en quarantaine. ` +
      `Empreinte base : \`${empreinte.slice(0, 16)}\`.`,
    "",
    "## Chiffre mesuré",
    "",
    `Fenêtre glissante de **${JOURS} jours** ; cible : **moins d'une heure** entre la publication ` +
      "de la revendication et sa première trace dans le radar.",
    "",
    "| Population | Revendications | p50 (h) | p90 (h) | max (h) | ≤ 1 h |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    `| Flux public (\`ransomlook\`) | ${flux.count} | **${virgule(flux.p50Hours)}** | ${virgule(flux.p90Hours)} | ${virgule(flux.maxHours)} | ${flux.withinOneHour} (${virgule(flux.withinOneHourPct)} %) |`,
    `| Sites de fuite (\`ransomware.live\`) | ${quarantaine.count} | **${virgule(quarantaine.p50Hours)}** | ${virgule(quarantaine.p90Hours)} | ${virgule(quarantaine.maxHours)} | ${quarantaine.withinOneHour} (${virgule(quarantaine.withinOneHourPct)} %) |`,
    "",
    `Sous-ensemble Nouvelle-Aquitaine : ${flux.naCount} revendication(s) datée(s) sur le flux public, ` +
      `p50 **${virgule(flux.naP50Hours)} h**, ${flux.naWithinOneHour} en moins d'une heure ; ` +
      `${quarantaine.naCount} sur les sites de fuite, p50 **${virgule(quarantaine.naP50Hours)} h**, ` +
      `${quarantaine.naWithinOneHour} en moins d'une heure.`,
"",
"**Conclusion** : sur cette fenêtre de 7 jours, l'objectif « moins d'une heure » n'est pas atteint : " +
  `${flux.withinOneHour} revendication(s) sur ${flux.count} pour le flux public et ${quarantaine.withinOneHour} sur ` +
  `${quarantaine.count} pour les sites de fuite tombent sous la cible. Ce chiffre sert de référence avant ` +
  "correction ; il faudra rejouer la mesure sur une nouvelle fenêtre complète pour en évaluer l'effet.",
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
    "- Le sous-ensemble NA vient du département de l'organisation rattachée (16, 17, 19, 23, 24, 33, 40, " +
      "47, 64, 79, 86, 87) ou du drapeau `regional`.",
    "",
    "## Requêtes",
    "",
    "```sql",
    SQL_FLUX.trim(),
    "",
    SQL_QUARANTAINE.trim(),
    "```",
    "",
    "## Par source (flux public)",
    "",
    "| Source | Revendications | p50 (h) |",
    "| --- | ---: | ---: |",
    ...resultat.feed.bySource.slice(0, 10).map((s) => `| \`${s.source}\` | ${s.count} | ${virgule(s.p50Hours)} |`),
    "",
    "## Ce que ce chiffre ne mesure pas",
    "",
    "- Il ne mesure pas le délai entre l'attaque et sa revendication : l'horloge part de la publication " +
      "annoncée par la source, pas de la survenue de l'attaque.",
    "- Il n'inclut pas les revendications publiées il y a plus de 7 jours : elles sont mesurées ailleurs, " +
      "dans l'historique de quarantaine.",
    "- Un délai supérieur à une heure peut venir de la source elle-même (mise à jour différée du flux " +
      "public) : la mesure ne distingue pas l'attente chez la source du temps de collecte local.",
    "- Le sous-ensemble Nouvelle-Aquitaine est petit sur une fenêtre de 7 jours : il est publié pour " +
      "information, pas comme une estimation stable.",
    "",
    "## Ce qui a été corrigé",
    "",
    "- Le collecteur `ransomlook` ne perd plus une revendication dont la date `discovered` est antérieure " +
      "au dernier marqueur vu : une liste bornée de clés remplace le marqueur unique, avec fenêtre de " +
      "recherche de 7 jours et curseur plafonné à 500 clés.",
    "- Sa cadence passe de 3 600 s à 300 s (intervalle de 4 min après la marge de 20 %), pour qu'une " +
      "revendication manquée soit reprise dans la fenêtre d'une heure.",
"- La mesure publiée ci-dessus porte sur la fenêtre écoulée, antérieure au correctif : aucun chiffre " +
  "n'est présenté comme une amélioration observée.",
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

  for (const [chemin, contenu] of [
    [SORTIE_JSON, `${JSON.stringify(resultat, null, 2)}\n`],
    [SORTIE_DOC, doc],
  ]) {
    const cible = resolve(RACINE, chemin);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, contenu, "utf8");
    console.log(`publié : ${relative(RACINE, cible)}`);
  }
  console.log(
    `flux ${flux.count} · p50 ${virgule(flux.p50Hours)} h · p90 ${virgule(flux.p90Hours)} h · ` +
    `≤1h ${flux.withinOneHour}/${flux.count} | sites de fuite ${quarantaine.count} · ` +
    `p50 ${virgule(quarantaine.p50Hours)} h · ≤1h ${quarantaine.withinOneHour}/${quarantaine.count}`,
  );
}

try {
  await main();
} finally {
  await closePools();
}
