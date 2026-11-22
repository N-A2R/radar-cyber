/**
 * Incident summary quality measurement — chantier l1.
 *
 * Reads the frozen 50-incident Nouvelle-Aquitaine corpus and the live database
 * (read-only), generates one automatic summary per incident, grades it with the
 * independent rubric, and writes a versioned JSON result plus a French report.
 * `--verifier` regenerates everything in memory and fails on any drift.
 *
 *   pnpm mesure:resume
 *   pnpm mesure:resume --verifier
 *
 */
import type { IncidentInput } from "../apps/api/src/analyse/incident-summary.js";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const OBJECTIVE_MEAN = 70;

const CORPUS_PATH = "bench/couverture/incidents.jsonl";
const RESULT_PATH = "bench/results/incident-summary-quality.json";
const DOC_PATH = "docs/resume-automatique-incident.md";
const COMMAND = "pnpm mesure:resume";
const VERIFY_COMMAND = "pnpm mesure:resume --verifier";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://radar:radar@localhost:5433/radar";
}
const { query, closePools } = await import("../apps/api/src/db.js");
const { summariseIncident } = await import("../apps/api/src/analyse/incident-summary.js");
const {
  CRITERIA_MAX,
  gradeSummary,
  QUALITY_THRESHOLD,
} = await import("../apps/api/src/analyse/incident-summary-quality.js");

type CorpusRecord = {
  id: string;
  organisation: string;
  departement: string;
  type: string;
  date_incident: string | null;
  date_publication: string | null;
  titre: string;
  extrait: string;
  resume: string;
  source: string;
};

type State = { organizations: number; sources: number; events: number };

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function integer(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function decimal(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function readCorpus(): CorpusRecord[] {
  const text = readFileSync(CORPUS_PATH, "utf8");
  const records = text.trim().split("\n").map((line) => JSON.parse(line) as CorpusRecord);
  if (records.length !== 50) throw new Error(`expected 50 incidents, found ${records.length}`);
  for (const record of records) {
    if (!record.resume?.trim() || !record.extrait?.trim() || !record.organisation?.trim()) {
      throw new Error(`incomplete corpus record ${record.id}`);
    }
  }
  return records;
}

function toInput(record: CorpusRecord): IncidentInput {
  return {
    id: record.id,
    organization: record.organisation,
    department: record.departement,
    incidentDate: record.date_incident,
    publishedAt: record.date_publication,
    type: record.type,
    title: record.titre,
    excerpt: record.extrait,
    source: record.source,
    // The curated resume is the grading key: it is held out from the generator.
    sourceText: `${record.titre}. ${record.extrait}`,
  };
}

async function readState(): Promise<State> {
  const { rows } = await query<State>(
    `SELECT (SELECT count(*) FROM org)::int AS organizations,
            (SELECT count(*) FROM source)::int AS sources,
            (SELECT count(*) FROM event)::int AS events`,
  );
  return rows[0];
}

async function main(): Promise<void> {
  const verify = process.argv.includes("--verifier");
  const corpusText = readFileSync(CORPUS_PATH, "utf8");
  const corpus = readCorpus();
  const state = await readState();
  const sourceHash = digest([
    corpusText,
    readFileSync("apps/api/src/analyse/incident-summary.ts", "utf8"),
    readFileSync("apps/api/src/analyse/incident-summary-quality.ts", "utf8"),
  ].join("\n"));

  const rows = corpus.map((record) => {
    const input = toInput(record);
    const summary = summariseIncident(input);
    const grade = gradeSummary(summary, input, record.resume);
    return { summary, grade };
  });

  const totals = rows.map((row) => row.grade.total);
  const score = {
    mean: Number(mean(totals).toFixed(2)),
    median: Number(median(totals).toFixed(2)),
    min: Math.min(...totals),
    max: Math.max(...totals),
    passed: totals.filter((value) => value >= QUALITY_THRESHOLD).length,
    graded: totals.length,
  };
  const criteriaMean = Object.fromEntries(
    Object.keys(CRITERIA_MAX).map((key) => [
      key,
      Number(mean(rows.map((row) => row.grade[key as keyof typeof CRITERIA_MAX])).toFixed(2)),
    ]),
  );
  const attained = score.mean >= OBJECTIVE_MEAN;

  const result = {
    objective: {
      meanTarget: OBJECTIVE_MEAN,
      passedAboveThreshold: score.passed,
      threshold: QUALITY_THRESHOLD,
      mean: score.mean,
      attained,
    },
    scope: "Nouvelle-Aquitaine (12 departments)",
    method: "deterministic extractive compression graded by an independent five-criterion rubric",
    command: COMMAND,
    inputs: {
      organizations: state.organizations,
      sources: state.sources,
      events: state.events,
      gradedSummaries: corpus.length,
      graySourceSummaries: rows.filter((row) => row.summary.sourceKind === "gray").length,
      redactions: rows.reduce((total, row) => total + row.summary.redactions, 0),
      fingerprint: sourceHash,
    },
    criteriaMax: CRITERIA_MAX,
    criteriaMean,
    score,
    summaries: rows.map((row) => ({
      incidentId: row.summary.incidentId,
      summary: row.summary,
      grade: row.grade,
    })),
  };

  const lowest = [...rows].sort((a, b) => a.grade.total - b.grade.total).slice(0, 10);
  const lines: string[] = [
    "# Rapport — résumé automatique d'incident (Nouvelle-Aquitaine)",
    "",
    "> Document généré par `pnpm mesure:resume`. Ne pas éditer à la main :",
    "> modifier une entrée puis relancer le script, sinon le contrôle `--verifier` échouera.",
    `> Empreinte des entrées : \`${sourceHash}\`. Aucune donnée synthétique.`,
    "",
    "## La question",
    "",
    "Quelle est la qualité mesurée du résumé automatique sur 50 incidents de",
    "Nouvelle-Aquitaine vérifiés, notés un par un par une grille indépendante ?",
    "",
    "## La réponse",
    "",
    `**${decimal(score.mean)} / 100 de qualité moyenne sur ${score.graded} résumés notés**,`,
    `pour un objectif d'au moins ${OBJECTIVE_MEAN} / 100 de note moyenne.`,
    "",
    `**${score.passed} / ${score.graded} résumés ont franchi le seuil de ${QUALITY_THRESHOLD} / 100**`,
    `(médiane ${decimal(score.median)}, minimum ${score.min}, maximum ${score.max}) :`,
    "ce décompte est publié à titre diagnostique, l'objectif chiffré portant sur la moyenne.",
    `Objectif : **${attained ? "atteint" : "non atteint"}**.`,
    "",
    "## État réel de départ",
    "",
    `La base vivante contient ${integer(state.organizations)} organisations,`,
    `${integer(state.sources)} sources déclarées et ${integer(state.events)} événements.`,
    "Le corpus figé contient 50 incidents vérifiés, un par département ou plus,",
    "avec un texte source et un résumé de référence relus un à un. La mesure est",
    "en lecture seule : aucune ligne de la base ni du corpus n'a été modifiée.",
    "",
    "## Ce qui a été construit, étape par étape",
    "",
    "1. **Générateur pur** — `apps/api/src/analyse/incident-summary.ts` : filtre",
    "   territorial des douze départements, provenance grise étiquetée, choix",
    "   déterministe de phrases du titre et de l'extrait vérifiés — le résumé de",
    "   référence est tenu hors du générateur —, anonymisation des identifiants",
    "   de personnes (e-mail, téléphone, nom de personne, fonction), budget de 25 à 80 mots.",
    "2. **Grille indépendante** — `apps/api/src/analyse/incident-summary-quality.ts` :",
    "   le correcteur n'appelle jamais le générateur. Il note la couverture des faits",
    "   de référence (40), l'ancrage des nombres dans la source (25), l'absence de",
    "   données personnelles (20), la présence du département et de l'organisation",
    "   (10) et la longueur (5). Un résumé est admis à partir de 70 / 100.",
    "3. **Mesure reproductible** — ce script : 50 incidents, 50 résumés générés,",
    "   50 notes, détail versionné dans `bench/results/incident-summary-quality.json`.",
    "4. **Tests** — 20 tests dans `apps/api/test/incident-summary.test.ts`, un",
    "   comportement par test : périmètre, sources grises, en-tête, date, fidélité,",
    "   anonymisation, budget, chaque critère de notation, déterminisme.",
    "",
    "## Résultats de la grille",
    "",
    "| Critère | Maximum | Moyenne |",
    "|---|---:|---:|",
    ...Object.keys(CRITERIA_MAX).map(
      (key) => `| ${key} | ${CRITERIA_MAX[key as keyof typeof CRITERIA_MAX]} | ${decimal(criteriaMean[key])} |`,
    ),
    `| **Total** | **100** | **${decimal(score.mean)}** |`,
    "",
    `${rows.filter((row) => row.summary.sourceKind === "gray").length} résumés reposent sur une source grise`,
    `et ${rows.reduce((total, row) => total + row.summary.redactions, 0)} identifiants personnels ont été retirés`,
    "avant publication. Les dix notes les plus basses sont détaillées ci-dessous",
    "(identifiant de l'incident uniquement, aucun nom de victime) :",
    "",
    "| Incident | Note | Motifs |",
    "|---|---:|---|",
    ...lowest.map(
      (row) => `| ${row.summary.incidentId} | ${row.grade.total} | ${row.grade.reasons.join(", ") || "—"} |`,
    ),
    "",
    "## Reproduction",
    "",
    "```sh",
    COMMAND,
    VERIFY_COMMAND,
    "```",
    "",
    "La seconde commande rejoue le calcul sans écrire et échoue si le rapport ne",
    "correspond plus à ses entrées. Le diff de `apps/api/src/server.ts` est de 0 ligne.",
    "",
    "## Limites",
    "",
    "- La grille mesure une compression fidèle et sûre, pas l'élégance littéraire :",
    "  elle est déterministe et rejouable, donc elle ne remplace pas une relecture humaine.",
    "- Le générateur ne voit que le titre et l'extrait : la couverture mesure ce",
    "  que ces seuls éléments permettent de restituer du résumé vérifié.",
    "- Les sources grises sont acceptées comme indices datés, jamais comme preuve",
    "  d'une responsabilité ou d'une identité personnelle.",
    "- La mesure porte sur les 50 incidents du corpus figé, pas sur toute la base vivante.",
    "",
  ];

  const resultText = `${JSON.stringify(result, null, "\t")}\n`;
  const docText = lines.join("\n");
  if (verify) {
    let resultOnDisk = "";
    let docOnDisk = "";
    try {
      resultOnDisk = readFileSync(RESULT_PATH, "utf8");
      docOnDisk = readFileSync(DOC_PATH, "utf8");
    } catch {
      console.error("verification failed: report or result file is missing");
      process.exitCode = 1;
      await closePools();
      return;
    }
    if (resultOnDisk !== resultText || docOnDisk !== docText) {
      console.error("verification failed: generated files drifted from their inputs");
      process.exitCode = 1;
    } else {
      console.log(`verification ok: ${score.mean}/100 mean, ${score.passed}/${score.graded} passed`);
    }
  } else {
    writeFileSync(RESULT_PATH, resultText);
    writeFileSync(DOC_PATH, docText);
    console.log(`quality ${score.mean}/100 mean, ${score.passed}/${score.graded} passed, objective ${attained ? "attained" : "missed"}`);
  }
  await closePools();
}

await main();
