/**
 * Contagion mesurée — Nouvelle-Aquitaine uniquement.
 *
 * Reproductible, lecture seule, sans réseau et sans service payant :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-contagion.mts
 *
 * Écrit docs/rapport-contagion.md et affiche un résumé JSON. Aucun texte de
 * victime n'est publié : les libellés bruts des revendications servent uniquement
 * à noter l'attribution, puis sont écartés avant l'écriture du rapport.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
  NA_DEPARTMENTS,
  WINDOW_DAYS,
  addDays,
  attributionPrecision,
  buildContagionReport,
  gradeAttribution,
  victimFromTitle,
  type AttributionGrade,
} from "../apps/api/src/analyse/contagion.js";
import { defaultAsOf, loadFallRecords } from "../apps/api/src/analyse/contagion-db.js";

const jsonArg = process.argv.find((a) => a.startsWith("--json="))?.slice("--json=".length);

async function main(): Promise<void> {
  const records = await loadFallRecords();
  const asOf = defaultAsOf(records);
  const report = buildContagionReport(records, asOf);
  const end = addDays(asOf, WINDOW_DAYS);

  // Source écartée : les revendications ransomware rattachées à un événement.
  // Mesurées sur toute la base pour documenter pourquoi elles n'alimentent pas
  // la liste : leur taux de rattachement est effondré.
  const { rows: events } = await query<{ title: string; name: string }>(
    `SELECT e.title, o.name
       FROM event e JOIN org o ON o.id = e.org_id
      WHERE e.family = 'ransomware'
        AND o.dept = ANY($1::text[])`,
    [[...NA_DEPARTMENTS]],
  );
  const eventGrades: AttributionGrade[] = events.map((e) => gradeAttribution(victimFromTitle(e.title), e.name));
  const eventPrecision = attributionPrecision(eventGrades);

  const { rows: counts } = await query<{ orgs: string; claims: string }>(
    `SELECT (SELECT count(*)::text FROM org) AS orgs,
            (SELECT count(*)::text FROM leak_claim WHERE org_id IS NOT NULL) AS claims`,
  );

  const p = report.precision;
  const percent = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} %`;
  const verdict = p.reachedTarget ? "atteinte" : "non atteinte";
  const lines: string[] = [
    "# Rapport — modèle de contagion régionale",
    "",
    "Mesure du 22 novembre 2026. Nouvelle-Aquitaine uniquement (13 départements).",
    "Commande de reproduction :",
    "",
    "```bash",
    "DATABASE_URL=postgres://radar:radar@localhost:5433/radar \\",
    "  apps/api/node_modules/.bin/tsx scripts/mesure-contagion.mts",
    "```",
    "",
    "## Question et réponse",
    "",
    `Pour les **${report.seedCount} organisations tombées** avant le ${asOf}, la liste des organisations`,
    `exposées dans les ${WINDOW_DAYS} jours suivants (jusqu'au ${end}) contient`,
    `**${report.exposures.length} organisations**. La précision de cette liste est de`,
    `**${p.value.toFixed(3).replace(".", ",")}** : ${p.exact} attributions exactes,`,
    `${p.partial} partielles et ${p.unrelated} sans rapport, sur ${p.evaluated} éléments évalués.`,
    `Cible fixée à ${p.target.toFixed(2).replace(".", ",")} : **${verdict}**.`,
    "",
    `État réel utilisé : ${counts[0]?.orgs ?? "?"} organisations, ${counts[0]?.claims ?? "?"} revendications`,
    `rattachées à une organisation (toutes régions confondues pour le second chiffre).`,
    "",
    "## Définitions figées",
    "",
    "- **Chute** : revendication grise datée (`leak_claim`), rattachée à une organisation",
    "  dont le département est l'un des 13 départements de Nouvelle-Aquitaine.",
    "- **Graines** : les 20 dernières chutes strictement avant la date de coupure.",
    "",
    "- **Exposition** : première chute dans la fenêtre `]asOf, asOf + 30 j]`, hors graines",
    "  et hors organisations déjà tombées avant la coupure.",
    "- **Précision** : `(exact + partiel / 2) / total`. Une attribution est *exacte* quand",
    "  le libellé de la revendication et le nom de l'organisation coïncident après",
    "  normalisation ; *partielle* en cas de recouvrement de mots ; *sans rapport* sinon.",
    "  Un libellé sans rapport reste dans le dénominateur : c'est un faux positif de la liste.",
    "- **Score de contagion** : similarité avec les graines validées (parent, domaine,",
    "  secteur, code NAF, groupe sectoriel, ville, département), atténuée par l'âge de la graine.",
    "",
    "## Organisations exposées dans les 30 jours",
    "",
    "| Organisation | Département | Secteur | Date | Score | Motifs | Attribution |",
    "|---|---:|---|---|---:|---|---|",
    ...report.exposures.map((e) =>
      `| ${e.name.replaceAll("|", "\\|")} | ${e.department} | ${e.sector || "—"} | ${e.date} | ${e.score.toFixed(3).replace(".", ",")} | ${e.reasons.join(", ") || "—"} | ${e.attribution} |`,
    ),
    "",
    `Couverture du modèle : ${report.sharedGroup.matched}/${report.sharedGroup.exposures}`,
    "expositions partagent un groupe sectoriel avec au moins une graine validée.",
    "",
    "## Organisation des graines (20 dernières chutes)",
    "",
    "| # | Organisation | Département | Date | Attribution |",
    "|---:|---|---:|---|---|",
    ...report.seeds.map((s, i) =>
      `| ${i + 1} | ${s.name.replaceAll("|", "\\|")} | ${s.department} | ${s.date} | ${s.attribution} |`,
    ),
    "",
    "## Sources grises écartées et limites",
    "",
    `Les revendications ransomware rattachées à un événement, dans toute la base`,
    `(${events.length} rattachements en Nouvelle-Aquitaine), ont une précision d'attribution de`,
    `${eventPrecision.toFixed(3).replace(".", ",")} (${percent(eventPrecision)}).`,
    "Elles ne sont donc pas intégrées à la liste : ce sont majoritairement des",
    "rattachements erronés à des organisations du référentiel. Aucun texte de",
    "revendication, aucune donnée personnelle de victime et aucune URL de preuve",
    "n'est publié ici : seuls les champs organisationnels non personnels le sont.",
    "",
    "Le score classe les expositions observées ; il ne prétend pas prédire quelles",
    "organisations seront frappées. Avec 20 graines et quelques expositions par",
    "fenêtre, la mesure reste indicative et doit être rejouée sur une base à jour.",
    "",
  ];
  writeFileSync("docs/rapport-contagion.md", lines.join("\n"));

  const summary = {
    asOf,
    end,
    seedCount: report.seedCount,
    exposures: report.exposures.length,
    precision: p.value,
    exact: p.exact,
    partial: p.partial,
    unrelated: p.unrelated,
    target: p.target,
    reachedTarget: p.reachedTarget,
    rejectedEventPrecision: eventPrecision,
    eventCandidates: events.length,
    sharedGroup: report.sharedGroup,
  };
  if (jsonArg) {
    mkdirSync(jsonArg.slice(0, jsonArg.lastIndexOf("/")), { recursive: true });
    writeFileSync(jsonArg, JSON.stringify(summary, null, 2) + "\n");
  }
  console.log(JSON.stringify(summary));
  await closePools();
}

main().catch(async (error) => {
  console.error(error);
  await closePools();
  process.exitCode = 1;
});
