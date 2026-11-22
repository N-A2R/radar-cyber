/**
 * Reproducible measurement of official Nouvelle-Aquitaine statements per week.
 *
 *   pnpm mesure:communiques                                  # JSON on stdout
 *   pnpm mesure:communiques -- --weeks=4 --out=docs/rapport.md
 *
 * The counter is a SQL count of `event` rows whose family is
 * `official_statement`. Weeks are ISO weeks (Monday first); a week with no
 * statement is printed as 0 instead of being silently omitted.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { measureWeeks } from "../apps/api/src/communiques/store.js";
import { checkObjective } from "../apps/api/src/communiques/objectif.js";

const argv = process.argv.slice(2);
const weeks = Number(argv.find((a) => a.startsWith("--weeks="))?.split("=")[1] ?? 4);
const out = argv.find((a) => a.startsWith("--out="))?.split("=")[1] ?? null;
const json = argv.find((a) => a.startsWith("--json="))?.split("=")[1] ?? null;
if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) throw new Error("--weeks must be between 1 and 52");

const [measurement, baselineRows] = await Promise.all([
  measureWeeks(weeks),
  query<{ organisations: number; sources: number; events: number }>(
    `SELECT (SELECT count(*)::int FROM org) AS organisations,
            (SELECT count(*)::int FROM source) AS sources,
            (SELECT count(*)::int FROM event) AS events`,
  ),
]);
const baseline = baselineRows.rows[0] ?? { organisations: 0, sources: 0, events: 0 };
const payload = { ...measurement, baseline };
console.log(JSON.stringify(payload, null, 2));

if (json) writeFileSync(json, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

if (out) {
  const lines = [
    "# Communiqués officiels de Nouvelle-Aquitaine — mesure hebdomadaire",
    "",
    `Mesure exécutée le ${measurement.generatedAt}.`,
    "",
    `**${measurement.currentWeekCount} communiqué${measurement.currentWeekCount > 1 ? "s" : ""} officiel${measurement.currentWeekCount > 1 ? "s" : ""} collecté${measurement.currentWeekCount > 1 ? "s" : ""} pour la semaine ${measurement.currentWeek}** (semaine ISO commençant le ${measurement.weeks.find((w) => w.week === measurement.currentWeek)?.weekStart ?? "n.d."}).`,
    "",
    checkObjective(measurement).line,
    "",
    `Total collecté toutes semaines confondues : ${measurement.total}. Sources officielles actives déclarées : ${measurement.sources}.`,
    "",
    `État réel du corpus au moment de la mesure : ${baseline.organisations.toLocaleString("fr-FR")} organisations, ${baseline.sources.toLocaleString("fr-FR")} sources, ${baseline.events.toLocaleString("fr-FR")} événements.`,
    "",
    "## Définition mesurée",
    "",
    "Communication publique datée, publiée par une institution officielle de Nouvelle-Aquitaine sur son propre domaine, enregistrée comme événement `official_statement` et sans donnée personnelle de victime.",
    "",
    "Un communiqué est une ligne `event` de famille `official_statement` dont la date de publication est explicitement présente sur la page officielle. Le titre et l'URL sont seuls conservés : aucun résumé, aucune donnée personnelle de victime. Les semaines sans collecte sont affichées à zéro.",
    "",
    "## Résultats par semaine ISO",
    "",
    "| Semaine | Début | Communiqués | Par département |",
    "| --- | --- | ---: | --- |",
    ...measurement.weeks.map((w) => `| ${w.week} | ${w.weekStart} | ${w.count} | ${Object.entries(w.byDepartment).map(([d, n]) => `${d}: ${n}`).join(", ") || "—"} |`),
    "",
    "## Périmètre et contraintes",
    "",
    "- Nouvelle-Aquitaine uniquement (12 départements + périmètre régional).",
    "- Sources institutionnelles publiques et gratuites, ou leurs flux RSS publics ; aucun service payant.",
    "- Aucune donnée personnelle de victime : les titres comportant un identifiant ou une description de victime sont rejetés avant insertion.",
    "- Collecte idempotente par URL canonique : un second passage ne double pas le compteur.",
    "",
    "## Reproduction",
    "",
    `DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:communiques -- --weeks=4 --json=bench/results/communiques-officiels-${measurement.generatedAt.slice(0, 10)}.json --out=docs/rapports/communiques-officiels-${measurement.generatedAt.slice(0, 10)}.md`,
    "",
    "Vérification de la déclaration sur les artefacts publiés : `pnpm verifie:objectif-communiques`.",
    "",
  ];
  writeFileSync(out, lines.join("\n"), "utf8");
  console.error(`rapport écrit : ${out}`);
}

await closePools();
