/**
 * One test per observable behavior of the incident cost model.
 *
 * No network, no database, no clock: every case is a fixed input/output pair.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  aggregateIncidents,
  bootstrapMean,
  buildCostModel,
  classifyCostContext,
  extractCostObservations,
  findEuroAmounts,
  fitLognormal,
  isOrganizationVictim,
  normalizeDepartment,
  type CostObservation,
  type IncidentRecord,
} from "../src/cost/incident-cost.js";

function record(overrides: Partial<IncidentRecord> = {}): IncidentRecord {
  return {
    id: "test-1",
    department: "Corrèze",
    organisation: "Mairie de Sarran",
    title: "Cyberattaque à la mairie de Sarran",
    excerpt: "Le préjudice est de 44 000 euros, dont 33 000 euros bloqués par la Banque de France.",
    ...overrides,
  };
}

function contextOf(text: string, amount: string): [string, number, number] {
  const start = text.indexOf(amount);
  assert.ok(start >= 0, "amount must be present in the fixture");
  return [text, start, start + amount.length];
}

function observation(incidentId: string, amountEur: number, department = "24"): CostObservation {
  return { incidentId, department, incidentDate: "2025-10-03", amountEur, category: "loss" };
}

test("accepts only the twelve Nouvelle-Aquitaine departments", () => {
  assert.equal(normalizeDepartment("Charente"), "16");
  assert.equal(normalizeDepartment("Pyrénées-Atlantiques"), "64");
  assert.equal(normalizeDepartment("Lot-et-Garonne"), "47");
  assert.equal(normalizeDepartment("Haute-Vienne"), "87");
  assert.equal(normalizeDepartment("64"), "64");
  assert.equal(normalizeDepartment("Paris"), null);
  assert.equal(normalizeDepartment("65"), null);
});

test("excludes natural-person victims from the cost sample", () => {
  assert.equal(isOrganizationVictim("Christophe et Nathalie Paulet (Saint-Angeau, Charente)"), false);
  assert.equal(isOrganizationVictim("Hôtes Gîtes de France de la Creuse"), false);
  assert.equal(isOrganizationVictim("Entreprise de maçonnerie (témoin anonymisé)"), false);
  assert.equal(isOrganizationVictim("Mairie de Sarran"), true);
  assert.equal(isOrganizationVictim("APAJH 23 — Association pour adultes et jeunes handicapés"), true);
});

test("parses French thousands and decimal separators", () => {
  assert.equal(findEuroAmounts("24 000 euros")[0]?.amountEur, 24_000);
  assert.equal(findEuroAmounts("173.000 euros")[0]?.amountEur, 173_000);
  assert.equal(findEuroAmounts("173 000 €")[0]?.amountEur, 173_000);
  assert.equal(findEuroAmounts("3,20 €")[0]?.amountEur, 3.2);
});

test("parses million and milliard units", () => {
  assert.equal(findEuroAmounts("40 millions d’euros")[0]?.amountEur, 40_000_000);
  assert.equal(findEuroAmounts("5 M€")[0]?.amountEur, 5_000_000);
  assert.equal(findEuroAmounts("2 milliards d'euros")[0]?.amountEur, 2_000_000_000);
});

test("rejects amounts that are not denominated in euros", () => {
  assert.deepEqual(findEuroAmounts("rançon de 0,25 bitcoin et 12 dollars"), []);
});

test("keeps realized losses but excludes advertised amounts", () => {
  assert.equal(classifyCostContext(...contextOf("Le préjudice est de 44 000 euros", "44 000 euros")), "damage");
  assert.equal(classifyCostContext(...contextOf("la mairie perd 44 000 euros de son budget", "44 000 euros")), "loss");
  assert.equal(classifyCostContext(...contextOf("Un mail promet 10 000 euros d'aides", "10 000 euros")), null);
  assert.equal(classifyCostContext(...contextOf("abonnement à 34 euros par mois", "34 euros")), null);
});

test("excludes refused ransom demands and keeps paid ransoms", () => {
  assert.equal(classifyCostContext(...contextOf("une rançon de 8 000 euros est réclamée et refusée", "8 000 euros")), null);
  assert.equal(classifyCostContext(...contextOf("une rançon de 8 000 euros a été payée", "8 000 euros")), "ransom");
});

test("extracts one published loss amount and drops lures", () => {
  const input = record({
    excerpt: "Le préjudice est de 44 000 euros. Un email promet 10 000 euros d'aides et 33 000 euros sont bloqués.",
  });
  const observations = extractCostObservations(input);
  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.amountEur, 44_000);
  assert.equal(observations[0]?.category, "damage");
});

test("drops incidents outside Nouvelle-Aquitaine", () => {
  assert.deepEqual(extractCostObservations(record({ department: "Paris" })), []);
});

test("collapses repeated reports of the same published loss", () => {
  const observations = [observation("a", 75_000, "47"), observation("b", 75_000, "47")];
  assert.equal(aggregateIncidents(observations).length, 1);
});

test("keeps the largest published loss per incident", () => {
  const observations = [observation("a", 11_000, "19"), observation("a", 44_000, "19")];
  const aggregated = aggregateIncidents(observations);
  assert.equal(aggregated.length, 1);
  assert.equal(aggregated[0]?.amountEur, 44_000);
});

test("fits lognormal parameters from observed losses", () => {
  const flat = fitLognormal([100, 100, 100]);
  assert.ok(Math.abs(flat.median - 100) < 1e-6);
  assert.ok(Math.abs(flat.mean - 100) < 1e-6);
  assert.equal(flat.sigma, 0);
  const spread = fitLognormal([100, 400]);
  assert.ok(spread.median > 100 && spread.median < 400);
  assert.ok(spread.mean > spread.median);
});

test("bootstraps a deterministic 95% interval", () => {
  const first = bootstrapMean([100, 200, 300], 500, 42);
  const second = bootstrapMean([100, 200, 300], 500, 42);
  assert.deepEqual(first, second);
  assert.ok(first[0] < 200 && first[1] > 200);
  assert.deepEqual(bootstrapMean([7, 7, 7], 100, 42), [7, 7]);
});

test("publishes only non-personal aggregate data", () => {
  const report = buildCostModel([
    record(),
    record({
      id: "test-2",
      organisation: "Christophe et Nathalie Paulet",
      excerpt: "Un couple se fait pirater 13 600 euros sur ses comptes bancaires.",
    }),
  ]);
  assert.equal(report.incidentsWithPublishedCost, 1);
  assert.equal(report.observations[0]?.amountEur, 44_000);
  assert.equal(JSON.stringify(report).includes("Paulet"), false);
  assert.equal(JSON.stringify(report).includes("Banque de France"), false);
});

test("models the real Nouvelle-Aquitaine incident corpus", () => {
  const dir = fileURLToPath(new URL("../../../bench/corpus/", import.meta.url));
  const files = readdirSync(dir).filter((name) => /^incidents-.*\.jsonl$/.test(name));
  const records: IncidentRecord[] = [];
  for (const file of files) {
    for (const line of readFileSync(`${dir}${file}`, "utf8").split("\n")) {
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
  assert.ok(report.incidentsInNouvelleAquitaine > 0);
  assert.ok(report.incidentsWithPublishedCost >= 5);
  assert.ok(report.model.meanCi95[0] <= report.model.meanCi95[1]);
  assert.equal(report.scope, "nouvelle-aquitaine");
});
