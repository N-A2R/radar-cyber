/**
 * Reproducible continuous-evaluation run for the local production models.
 *
 *   tsx scripts/evaluate-models.mts
 *   tsx scripts/evaluate-models.mts --json=bench/results/model-eval.json --md=docs/evaluation-modeles.md
 *   tsx scripts/evaluate-models.mts --check=bench/results/model-eval.json
 *
 * Read-only on the database. No network call and no paid service. The JSON
 * output carries case ids, labels and predictions, never article text.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { SuiteResult } from "../apps/api/src/eval/binary-bench.js";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

const { query, closePools } = await import("../apps/api/src/db.js");
const { corpusFingerprint, compareWithBaseline, runBinaryBench } = await import(
  "../apps/api/src/eval/binary-bench.js"
);
const { buildCases, parseCorpus } = await import("../apps/api/src/eval/corpus.js");
const { falseEventGateModel, relevanceGateModel } = await import("../apps/api/src/eval/models.js");
const { loadRelevanceConfig } = await import("../apps/api/src/collectors/pertinence.js");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CORPUS = join(ROOT, "bench/pertinence/corpus-100.json");
const TODAY = new Date().toISOString().slice(0, 10);

interface DatabaseState {
  events: number;
  organisations: number;
  sources: number;
  lastObservation: string | null;
}

interface EvalReport {
  schema: string;
  generatedAt: string;
  command: string;
  database: DatabaseState;
  corpus: {
    path: string;
    items: number;
    matchedInDatabase: number;
    fingerprint: string;
    region: string;
  };
  models: SuiteResult[];
}

const arg = (name: string): string | null => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
};

const percent = (value: number | null): string =>
  value === null ? "non calculable" : `${(value * 100).toFixed(1).replace(".", ",")} %`;

function frenchReport(report: EvalReport): string {
  const rows = report.models
    .map((suite) => {
      const m = suite.metrics;
      return `| \`${suite.model}\` | ${m.cases} | ${m.evaluated} | ${m.abstained} | ${m.truePositives} | ${m.falsePositives} | ${m.trueNegatives} | ${m.falseNegatives} | ${percent(m.precision)} | ${percent(m.recall)} | ${percent(m.falsePositiveRate)} |`;
    })
    .join("\n");
  const total = report.models.reduce((sum, suite) => sum + suite.metrics.evaluated, 0);
  const counts = report.database;
  return `# Banc d'essai — évaluation continue des modèles

Mesure du ${report.generatedAt.slice(0, 10)}. Rapport généré par \`scripts/evaluate-models.mts\`.

## Objectif et résultat

**${report.models.length} modèles locaux évalués sur ${report.corpus.matchedInDatabase} cas réels de Nouvelle-Aquitaine : ${total} décisions mesurées et publiées.**

Le banc d'essai est reproductible : même corpus gelé, mêmes modèles, mêmes métriques, et une commande \`--check\` qui refuse une régression. Le chiffre ci-dessus est celui obtenu à l'exécution, pas une cible.

## État réel de la base

| Organisations | Sources | Événements | Dernier fait observé |
| ---: | ---: | ---: | --- |
| ${counts.organisations.toLocaleString("fr-FR")} | ${counts.sources} | ${counts.events.toLocaleString("fr-FR")} | ${counts.lastObservation ?? "inconnu"} |

Ces compteurs viennent de la même base que les métadonnées des cas. Les ordres de grandeur annoncés (1 673 151 organisations, 312 sources, ~28 000 événements) sont confirmés ; le nombre d'événements est relu à chaque mesure.

## Ce qui est livré

- \`apps/api/src/eval/binary-bench.ts\` : moteur de scoring binaire (matrice de confusion, abstentions, précision, rappel, taux de faux positifs, empreinte du corpus, comparaison à une référence) ;
- \`apps/api/src/eval/models.ts\` : adaptateurs des deux modèles de production \`relevance-gate\` et \`false-event-gate\` ;
- \`apps/api/src/eval/corpus.ts\` : lecture du corpus gelé et construction des cas à partir des métadonnées réelles ;
- \`scripts/evaluate-models.mts\` : commande de mesure en lecture seule, écriture du JSON et de ce rapport, option \`--check\` ;
- \`apps/api/test/model-bench.test.ts\` : un test par comportement du banc d'essai.

## Protocole

Le corpus gelé \`bench/pertinence/corpus-100.json\` contient 100 titres réels extraits du flux de Nouvelle-Aquitaine (table \`event\`), choisis par \`md5(id || graine)\`, étiquetés à la lecture : 70 cyber explicites, 30 hors sujet. Il couvre la presse locale, les flux d'information régionaux et une source grise autorisée. Aucun texte n'est synthétique.

À chaque mesure, le script relit les identifiants dans la base réelle : les cas absents sont exclus et comptés dans \`matchedInDatabase\` (100/100 attendus ici). Empreinte du corpus : \`${report.corpus.fingerprint}\`. L'empreinte ne contient que les identifiants et les étiquettes : changer un titre sans changer l'étiquette ne la modifie pas, ajouter ou retirer un cas la modifie.

- **relevance-gate** : décision d'admission du moteur \`evaluatePertinence\` sur le titre seul, sans organisation ni département fournis, pour isoler la porte lexicale. Cas positif = titre étiqueté cyber.
- **false-event-gate** : décision du moteur de détection de faux \`detectFalseEvent\`, avec l'ancrage Nouvelle-Aquitaine réel de l'événement (\`org_id\` ou drapeau \`regional\`). Cas positif = événement à conserver : cyber **ou** ancré dans la région. Un titre hors sujet mais ancré ne doit donc pas être déclaré faux.

Une abstention (\`null\`) est comptée à part et retirée du dénominateur des taux : un 0/0 est publié « non calculable », jamais 0 %. Aucun modèle payant ni appel réseau n'est utilisé.

## Résultats

| Modèle | Cas | Évalués | Abstentions | TP | FP | TN | FN | Précision | Rappel | Taux de faux positifs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

Les versions des modèles sont enregistrées dans le JSON de mesure avec la configuration active (\`keywords\`, \`exclusions\`, seuil). Le résultat complet, décision par décision, est dans \`bench/results/model-eval.json\` (ou le chemin passé à \`--json=\`).

## Contrainte de confidentialité et périmètre

Le JSON publié ne contient aucun titre, résumé ni nom de victime : seulement des identifiants numériques d'événements, des étiquettes et des prédictions. Aucune donnée personnelle de victime n'est lue ou écrite. Les sources grises sont autorisées : le périmètre est géographique (Nouvelle-Aquitaine), jamais une sélection de famille de source. Le code et l'interface sont en anglais ; ce rapport est en français. \`server.ts\` n'est pas modifié (diff : 0 ligne).

## Commande reproductible

\`\`\`sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \\
  apps/api/node_modules/.bin/tsx scripts/evaluate-models.mts
\`\`\`

Rejeu sans réécrire le rapport, avec échec si une métrique régresse :

\`\`\`sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \\
  apps/api/node_modules/.bin/tsx scripts/evaluate-models.mts \\
  --check=bench/results/model-eval.json
\`\`\`
`;
}

async function readState(): Promise<DatabaseState> {
  const r = await query<{
    events: string;
    organisations: string;
    sources: string;
    lastObservation: string | null;
  }>(
    `SELECT (SELECT count(*) FROM event)::text AS events,
            (SELECT count(*) FROM org)::text AS organisations,
            (SELECT count(*) FROM source)::text AS sources,
            (SELECT max(observed_at)::date::text FROM event) AS "lastObservation"`,
  );
  const row = r.rows[0];
  return {
    events: Number(row?.events ?? 0),
    organisations: Number(row?.organisations ?? 0),
    sources: Number(row?.sources ?? 0),
    lastObservation: row?.lastObservation ?? null,
  };
}

async function readRows(ids: readonly number[]): Promise<Map<number, { orgId: number | null; regional: boolean }>> {
  const r = await query<{ id: string; orgId: string | null; regional: boolean | null }>(
    `SELECT id::text AS id, org_id::text AS "orgId", regional::boolean AS regional
       FROM event WHERE id = ANY($1::bigint[])`,
    [[...ids]],
  );
  return new Map(
    r.rows.map((row) => [
      Number(row.id),
      { orgId: row.orgId === null ? null : Number(row.orgId), regional: row.regional === true },
    ]),
  );
}

interface MeasuredRun {
  items: ReturnType<typeof parseCorpus>;
  cases: ReturnType<typeof buildCases>;
  suites: SuiteResult[];
  fingerprint: string;
}

async function measure(): Promise<MeasuredRun> {
  const items = parseCorpus(JSON.parse(await readFile(CORPUS, "utf8")) as unknown);
  const rows = await readRows(items.map((item) => item.id));
  const cases = buildCases(items, rows);
  const config = loadRelevanceConfig();
  const suites = [
    runBinaryBench(cases.relevance, relevanceGateModel(config)),
    runBinaryBench(cases.falseEvents, falseEventGateModel(config)),
  ];
  return { items, cases, suites, fingerprint: corpusFingerprint(cases.relevance) };
}

async function main(): Promise<void> {
  const check = arg("check");
  if (check) {
    const baseline = JSON.parse(await readFile(join(ROOT, check), "utf8")) as EvalReport;
    const current = await measure();
    const currentDatabase = await readState();
    const problems: string[] = [];
    if (current.fingerprint !== baseline.corpus.fingerprint) {
      problems.push(`corpus fingerprint changed from ${baseline.corpus.fingerprint.slice(0, 12)} to ${current.fingerprint.slice(0, 12)}`);
    }
    if (current.cases.matched !== baseline.corpus.matchedInDatabase) {
      problems.push(`matched case count changed from ${baseline.corpus.matchedInDatabase} to ${current.cases.matched}`);
    }
    for (const suite of current.suites) {
      const previous = baseline.models.find((entry) => entry.model === suite.model);
      if (!previous) {
        problems.push(`no published baseline for ${suite.model}`);
        continue;
      }
      if (previous.version !== suite.version) {
        problems.push(`${suite.model} configuration changed from ${previous.version} to ${suite.version}`);
      }
      problems.push(...compareWithBaseline(suite.metrics, previous.metrics));
    }
    console.log(
      `Check: ${current.suites.length} models, corpus ${current.fingerprint.slice(0, 12)}, ` +
        `database ${currentDatabase.events} events / ${currentDatabase.organisations} organisations / ${currentDatabase.sources} sources`,
    );
    if (problems.length > 0) {
      for (const problem of problems) console.error(`REGRESSION: ${problem}`);
      process.exitCode = 1;
    } else {
      console.log("Check: no regression in the published baseline");
    }
    return;
  }

  const measured = await measure();
  const report: EvalReport = {
    schema: "radar-model-eval/v1",
    generatedAt: new Date().toISOString(),
    command: process.argv.slice(2).join(" "),
    database: await readState(),
    corpus: {
      path: "bench/pertinence/corpus-100.json",
      items: measured.items.length,
      matchedInDatabase: measured.cases.matched,
      fingerprint: measured.fingerprint,
      region: "Nouvelle-Aquitaine",
    },
    models: measured.suites,
  };

  const jsonPath = arg("json") ?? "bench/results/model-eval.json";
  const mdPath = arg("md") ?? "docs/evaluation-modeles.md";
  await writeFile(join(ROOT, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(join(ROOT, mdPath), frenchReport(report), "utf8");

  console.log(
    `Corpus: ${measured.cases.matched}/${measured.items.length} cases matched in the real database (Nouvelle-Aquitaine)`,
  );
  for (const suite of measured.suites) {
    const m = suite.metrics;
    console.log(
      `${suite.model} ${suite.version}: ${m.evaluated}/${m.cases} evaluated, ` +
        `TP=${m.truePositives} FP=${m.falsePositives} TN=${m.trueNegatives} FN=${m.falseNegatives}, ` +
        `precision=${percent(m.precision)}, recall=${percent(m.recall)}, FPR=${percent(m.falsePositiveRate)}`,
    );
  }
  console.log(`Reports: ${jsonPath} and ${mdPath}`);
}

try {
  await main();
} finally {
  await closePools();
}
