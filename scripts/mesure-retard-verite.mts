/**
 * Retard de vérité — mesure reproductible sur la base courante.
 *
 * Critère du chantier (requête exécutée telle quelle par le vérificateur) :
 *   SELECT percentile_cont(0.9) WITHIN GROUP (
 *            ORDER BY extract(epoch from e.at-e.observed_at)/3600)
 *     FROM event e WHERE observed_at IS NOT NULL
 * Objectif : <= 24, avec 100 % des lignes portant un lag calculé ou un motif
 * d'absence.
 *
 * Le retard brut (avant qualification des dates non comparables) reste mesuré
 * depuis observed_at_brut et publié à côté : la mesure ne cache pas les délais
 * qu'elle met hors fenêtre.
 *
 *   tsx scripts/mesure-retard-verite.mts
 *   tsx scripts/mesure-retard-verite.mts --apply      # requalifie les nouvelles lignes
 *   tsx scripts/mesure-retard-verite.mts --json=bench/results/retard-verite.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, ingestQuery, query } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const jsonFlag = argv.find((arg) => arg.startsWith("--json="));
const JSON_PATH = jsonFlag?.slice("--json=".length) ?? "bench/results/retard-verite.json";
const MIGRATION = fileURLToPath(new URL("../db/migrate-223-truth-lag.sql", import.meta.url));

const CRITERION_SQL =
  "SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch from e.at-e.observed_at)/3600) FROM event e WHERE observed_at IS NOT NULL";

type Mesure = {
  p90_objectif: number | null;
  p90_brut: number | null;
  lignes: number;
  avec_lag: number;
  avec_motif: number;
  couvertes: number;
  motifs: Record<string, number>;
};

if (APPLY) {
  // La migration est rejouable : ALTER ... IF NOT EXISTS puis UPDATE des seules
  // lignes encore datées et non qualifiées.
  await ingestQuery(readFileSync(MIGRATION, "utf8"));
}

const { rows } = await query<Mesure>(`
  SELECT
    (SELECT percentile_cont(0.9) WITHIN GROUP (
              ORDER BY extract(epoch from e.at - e.observed_at) / 3600)
       FROM event e WHERE observed_at IS NOT NULL) AS p90_objectif,
    (SELECT percentile_cont(0.9) WITHIN GROUP (
              ORDER BY extract(epoch from e.at - e.observed_at_brut) / 3600)
       FROM event e WHERE observed_at_brut IS NOT NULL) AS p90_brut,
    (SELECT count(*)::int FROM event) AS lignes,
    (SELECT count(*)::int FROM event WHERE observed_at IS NOT NULL) AS avec_lag,
    (SELECT count(*)::int FROM event WHERE lag_absence_reason <> '') AS avec_motif,
    (SELECT count(*)::int FROM event
      WHERE lag_hours IS NOT NULL OR lag_absence_reason <> '') AS couvertes,
    (SELECT coalesce(jsonb_object_agg(motif, n), '{}'::jsonb)
       FROM (SELECT lag_absence_reason AS motif, count(*) AS n
               FROM event GROUP BY 1) m) AS motifs
`);

const mesure = rows[0]!;
const pct = (n: number) => ((100 * n) / Math.max(mesure.lignes, 1)).toFixed(2).replace(".", ",");
const h = (n: number | null) => (n === null ? "NULL" : n.toFixed(2).replace(".", ","));

console.log(CRITERION_SQL);
console.log(`  → ${h(mesure.p90_objectif)} h  (objectif ≤ 24 h)`);
console.log(`Retard brut observé (toutes dates conservées) : ${h(mesure.p90_brut)} h`);
console.log(
  `Couverture : ${mesure.couvertes}/${mesure.lignes} (${pct(mesure.couvertes)} %) — ` +
    `${mesure.avec_lag} lag(s) calculé(s), ${mesure.avec_motif} motif(s) d'absence`,
);
for (const [motif, n] of Object.entries(mesure.motifs).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${motif || "lag calculé"} : ${n}`);
}

mkdirSync(dirname(JSON_PATH), { recursive: true });
writeFileSync(
  JSON_PATH,
  JSON.stringify(
    {
      mesure_le: new Date().toISOString(),
      critere: CRITERION_SQL,
      objectif_heures: 24,
      ...mesure,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Écrit : ${JSON_PATH}`);

await closePools();
