#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of the cost per incident in Nouvelle-Aquitaine.
 *
 * Inputs: the verified regional incident corpus (bench/corpus/incidents-*.jsonl)
 * and the real regional database, read only. No paid service, no network call,
 * no victim personal data: only aggregate euro amounts leave this command.
 *
 *   pnpm measure:incident-cost
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-incident-cost.mts
 *
 * Writes bench/results/incident-cost.json and prints the figure to stdout.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { buildCostModel, type IncidentRecord } from "../apps/api/src/cost/incident-cost.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
const displayedUrl = new URL(url);
displayedUrl.password = "***";

const corpusDir = new URL("../bench/corpus/", import.meta.url);
const files = readdirSync(corpusDir).filter((name) => /^incidents-.*\.jsonl$/.test(name)).sort();
const records: IncidentRecord[] = [];
for (const file of files) {
  for (const line of readFileSync(new URL(file, corpusDir), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const raw = JSON.parse(line) as Record<string, string | boolean | null>;
    records.push({
      id: String(raw.id),
      department: String(raw.departement ?? raw.department ?? ""),
      organisation: raw.organisation ? String(raw.organisation) : null,
      date: raw.date_incident ? String(raw.date_incident) : null,
      title: raw.titre ?? raw.title ? String(raw.titre ?? raw.title) : null,
      excerpt: raw.extrait ? String(raw.extrait) : null,
      summary: raw.resume ?? raw.summary ? String(raw.resume ?? raw.summary) : null,
    });
  }
}

const report = buildCostModel(records);

const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
await client.connect();
let baseline: { organizations: number; sources: number; events: number };
try {
  await client.query("SET statement_timeout = '15000ms'");
  const { rows } = await client.query<{ organizations: string; sources: string; events: string }>(`
    SELECT (SELECT count(*)::text FROM org) AS organizations,
           (SELECT count(*)::text FROM source) AS sources,
           (SELECT count(*)::text FROM event) AS events`);
  baseline = {
    organizations: Number(rows[0]!.organizations),
    sources: Number(rows[0]!.sources),
    events: Number(rows[0]!.events),
  };
} finally {
  await client.end();
}

const eur = (value: number): number => Math.round(value * 100) / 100;
const model = report.model;
const result = {
  measuredAt: new Date().toISOString(),
  database: displayedUrl.toString(),
  command: "pnpm measure:incident-cost",
  scope: report.scope,
  privacy: "aggregate euro amounts only; no victim names, addresses or source URLs",
  basis: "published losses from public sources; gray sources allowed; no paid service",
  baseline,
  corpus: { files, incidentRecords: records.length },
  incidents: {
    inNouvelleAquitaine: report.incidentsInNouvelleAquitaine,
    withOrganizationVictim: report.incidentsWithOrganizationVictim,
    withPublishedCost: report.incidentsWithPublishedCost,
  },
  model: {
    method: model.method,
    seed: model.seed,
    resamples: model.resamples,
    sampleSize: model.sampleSize,
    mu: Math.round(model.mu * 1e6) / 1e6,
    sigma: Math.round(model.sigma * 1e6) / 1e6,
    medianEur: eur(model.medianEur),
    meanEur: eur(model.meanEur),
    meanCi95: [eur(model.meanCi95[0]), eur(model.meanCi95[1])],
    predictionCi95: [eur(model.predictionCi95[0]), eur(model.predictionCi95[1])],
  },
  observations: report.observations,
};

writeFileSync(join(process.cwd(), "bench/results/incident-cost.json"), JSON.stringify(result, null, 2) + "\n");

const money = (value: number): string => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
console.log(`baseline: ${baseline.organizations} organizations / ${baseline.sources} sources / ${baseline.events} events`);
console.log(`incidents with published cost: ${report.incidentsWithPublishedCost}`);
console.log(`cost per incident: EUR ${money(model.meanEur)} (95% CI ${money(model.meanCi95[0])}-${money(model.meanCi95[1])})`);
console.log(`lognormal median: EUR ${money(model.medianEur)}; single-incident 95% interval ${money(model.predictionCi95[0])}-${money(model.predictionCi95[1])}`);
