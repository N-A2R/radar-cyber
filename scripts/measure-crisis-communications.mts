/**
 * Reproducible measurement of first-party crisis communications after an incident.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-crisis-communications.mts \
 *     --json=bench/results/communications-crise-2026-11-22.json \
 *     --out=docs/rapports/communications-crise-2026-11-22.md
 *
 * Read-only on the database. The exported JSON contains hashed organisations,
 * never a title, a summary or a victim's personal data.
 */
import { writeFileSync } from "node:fs";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { query, closePools } = await import("../apps/api/src/db.js");
const { loadIncidentCorpus } = await import("../apps/api/src/crisis-communications/load.js");
const { detectCrisisCommunications } = await import("../apps/api/src/crisis-communications/detect.js");
const { assessObjective } = await import("../apps/api/src/crisis-communications/objective.js");

const argv = process.argv.slice(2);
const jsonPath = argv.find((arg) => arg.startsWith("--json="))?.slice(7)
  ?? "bench/results/communications-crise-2026-11-22.json";
const reportPath = argv.find((arg) => arg.startsWith("--out="))?.slice(6)
  ?? "docs/rapports/communications-crise-2026-11-22.md";

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

const FRENCH_CHECK_LABELS: Record<string, string> = {
  "first-party crisis pages detected": "pages de crise de premier rang détectées",
  "incident-to-publication delays measured": "délais incident → communication mesurés",
  "press pages wrongly accepted": "pages de presse acceptées à tort",
  "out-of-region pages wrongly accepted": "pages hors région acceptées à tort",
};

async function main(): Promise<void> {
  const [records, scale] = await Promise.all([
    loadIncidentCorpus(),
    query<{ organisations: string; sources: string; events: string }>(
      `SELECT (SELECT count(*) FROM org)::text AS organisations,
              (SELECT count(*) FROM source)::text AS sources,
              (SELECT count(*) FROM event)::text AS events`,
    ),
  ]);
  const baseline = scale.rows[0] ?? { organisations: "0", sources: "0", events: "0" };
  const report = detectCrisisCommunications(records);
  const delays = report.detections
    .map((detection) => detection.delayDays)
    .filter((delay): delay is number => delay !== null);
  const verdict = assessObjective({
    detections: report.detections.length,
    datedDetections: report.datedDetections,
    pressPagesAccepted: report.pressPagesAccepted,
    outsideNaAccepted: report.outsideNaAccepted,
  });
  const payload = {
    generatedAt: new Date().toISOString(),
    method: {
      scope: "Nouvelle-Aquitaine (12 departments)",
      definition: "First-party crisis page or official statement published on or after the dated incident",
      acceptedSources: ["official", "grey first-party"],
      rejectedSources: ["press", "leak blogs", "unknown publishers"],
      privacy: "organisation is a truncated SHA-256 hash; no title, summary or victim personal data exported",
      cost: "public and free sources only; offline deterministic corpus; no paid service",
      corpus: "bench/corpus/incidents-*.jsonl",
    },
    baseline: {
      organisations: Number(baseline.organisations),
      sources: Number(baseline.sources),
      events: Number(baseline.events),
    },
    corpus: {
      recordsScanned: report.recordsScanned,
      pressPages: report.pressPages,
      pressPagesAccepted: report.pressPagesAccepted,
      outsideNa: report.outsideNa,
      outsideNaAccepted: report.outsideNaAccepted,
      negativeDelays: report.negativeDelays,
    },
    result: {
      detections: report.detections.length,
      datedDelays: report.datedDetections,
      undatedDetections: report.undatedDetections,
      medianDelayDays: median(delays),
      minDelayDays: delays.length === 0 ? null : Math.min(...delays),
      maxDelayDays: delays.length === 0 ? null : Math.max(...delays),
    },
    objective: verdict,
    communications: report.detections,
  };
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const lines = [
    "# Communications de crise en Nouvelle-Aquitaine — mesure reproductible",
    "",
    `Mesure exécutée le ${payload.generatedAt}.`,
    "",
    `**${payload.result.detections} pages de crise ou communiqués publiés après incident détectés, dont ${payload.result.datedDelays} avec un délai calculable (${payload.result.medianDelayDays ?? "n.d."} jours médians).**`,
    "",
    `État réel de la base au moment de la mesure : ${payload.baseline.organisations.toLocaleString("fr-FR")} organisations, ${payload.baseline.sources} sources, ${payload.baseline.events.toLocaleString("fr-FR")} événements.`,
    "",
    "## Définition mesurée",
    "",
    "Une communication de crise est une page de premier rang (institution publique ou source grise de premier rang : syndicat, ordre professionnel, association) publiée par l'organisation concernée, dont le titre ou l'URL porte un signal d'incident, de cybersécurité, d'alerte ou d'indisponibilité, et dont la date de publication est explicite et postérieure à la date de l'incident. Les articles de presse et les blogs de fuite sont des témoignages tiers : ils ne comptent pas comme communications de la victime.",
    "",
    "Le délai est le nombre de jours UTC écoulés entre la date de l'incident et la date de publication de la communication. Il n'est calculé que lorsque les deux dates sont présentes et cohérentes ; une date d'incident inconnue donne un délai `null`, jamais une estimation.",
    "",
    "## Résultat",
    "",
    "| Compteur | Valeur |",
    "| --- | ---: |",
    `| Incidents datés du corpus analysé | ${payload.corpus.recordsScanned} |`,
    `| Pages presse ou blogs exclues | ${payload.corpus.pressPages} |`,
    `| Pages hors Nouvelle-Aquitaine exclues | ${payload.corpus.outsideNa} |`,
    `| Communications détectées | ${payload.result.detections} |`,
    `| Délais incident → communication calculés | ${payload.result.datedDelays} |`,
    `| Délai médian (jours) | ${payload.result.medianDelayDays ?? "n.d."} |`,
    `| Délai minimal / maximal (jours) | ${payload.result.minDelayDays ?? "n.d."} / ${payload.result.maxDelayDays ?? "n.d."} |`,
    "",
    "## Périmètre et contraintes",
    "",
    "- Nouvelle-Aquitaine uniquement : les 12 départements de la région sont acceptés, les autres sont rejetés avant détection.",
    "- Sources grises de premier rang autorisées ; aucun service payant, aucun appel réseau pendant la mesure.",
    "- Aucune donnée personnelle de victime : le JSON publié ne contient ni titre, résumé, nom de victime, ni URL complète ; l'organisation est réduite à un hash SHA-256 tronqué.",
    "- Le corpus est versionné dans `bench/corpus/incidents-*.jsonl` et la mesure est déterministe : deux exécutions donnent le même décompte.",
    "",
    "## Objectif vérifié",
    "",
    ...payload.objective.checks.map((check) => `- ${FRENCH_CHECK_LABELS[check.label] ?? check.label} : ${check.observed} (attendu ${check.expected}) — ${check.passed ? "OK" : "ÉCHEC"}`),
    "",
    "## Reproduction",
    "",
    "```sh",
    "DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/measure-crisis-communications.mts",
    "DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/verify-crisis-communications-objective.mts",
    "```",
    "",
  ];
  writeFileSync(reportPath, lines.join("\n"), "utf8");

  console.log(`Detected ${payload.result.detections} crisis communications, ${payload.result.datedDelays} measured delays (median ${payload.result.medianDelayDays ?? "n/a"} days)`);
  console.log(`Dataset: ${payload.baseline.organisations} organisations, ${payload.baseline.sources} sources, ${payload.baseline.events} events`);
  console.log(`Objective: ${verdict.met ? "met" : "NOT met"}`);
  console.log(`Report written to ${reportPath}`);
}

try {
  await main();
} finally {
  await closePools();
}
