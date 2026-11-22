/**
 *
 *
 * Inputs are already versioned, publicly sourced corpora. Nothing is invented:
 * each incident keeps its original id, entity, reference date and proof URL.
 * Two entries naming private individuals are excluded and replaced by two
 * distinct organisation incidents from the coverage corpus, so that no victim
 * personal data ever enters the measurement.
 *
 *   apps/api/node_modules/.bin/tsx scripts/build-anticipation-corpus-100.mts
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BENCHMARK = `${ROOT}bench/results/benchmark-premier-regard.json`;
const REFERENCE = `${ROOT}bench/fixtures/corpus-reference-na.json`;
const COVERAGE = `${ROOT}bench/couverture/incidents.jsonl`;
const DEPARTMENT_DIR = `${ROOT}bench/corpus/`;
const OUTPUT = `${ROOT}bench/anticipation/corpus-100.json`;

const NA_DEPARTMENTS = new Set(["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"]);
// Named individuals and an anonymised personal nickname: out of scope.
const DEPARTMENT_CODES: Record<string, string> = {
  Charente: "16", "Charente-Maritime": "17", Correze: "19", "Corrèze": "19", Creuse: "23",
  Dordogne: "24", Gironde: "33", Landes: "40", "Lot-et-Garonne": "47",
  "Pyrénées-Atlantiques": "64", "Pyrenees-Atlantiques": "64", "Deux-Sèvres": "79",
  Vienne: "86", "Haute-Vienne": "87",
};
const EXCLUDED = new Set(["na-charente-002", "na-creuse-001"]);
const REPLACEMENTS = ["na-couv-001", "na-couv-003"];

type Row = Record<string, any>;

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path: string): Row[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Row);
}

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((word) => word.length >= 4));
}

function similarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.max(left.size, right.size);
}

function aliases(entity: string, mention?: string | null): string[] {
  const candidates = [mention ?? "", entity.split(/[(—,]/)[0] ?? "", entity];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    const value = normalize(candidate);
    if (value.length >= 3 && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out.slice(0, 4);
}

const benchmark = readJson(BENCHMARK).incidents as Row[];
const reference = new Map<string, Row>(
  (readJson(REFERENCE).incidents as Row[]).map((row) => [String(row.id), row]),
);
const coverage = readJsonl(COVERAGE);
const departments = readdirSync(DEPARTMENT_DIR)
  .filter((name) => /^incidents-.*\.jsonl$/.test(name))
  .flatMap((name) => readJsonl(`${DEPARTMENT_DIR}${name}`));
const lookup = [...coverage, ...departments];

function findSource(row: Row): Row | undefined {
  let best: Row | undefined;
  let score = 0;
  for (const candidate of lookup) {
    const value = similarity(row.entite, String(candidate.organisation ?? candidate.entite ?? ""));
    if (value > score) {
      score = value;
      best = candidate;
    }
  }
  return score >= 0.5 ? best : undefined;
}

function fromBenchmark(row: Row): Row {
  const ref = reference.get(String(row.id));
  const matched = findSource(row);
  const dept = String(row.codeDepartement ?? "");
  if (!NA_DEPARTMENTS.has(dept)) throw new Error(`incident outside Nouvelle-Aquitaine: ${row.id} (${dept})`);

  let dateIncident: string | null = null;
  let datePublique: string | null = null;
  let dateReference = "";
  let dateReferenceType = "";
  let proofUrl: string | null = null;
  let sourceFile = "bench/results/benchmark-premier-regard.json";
  let mention: string | null = null;

  if (ref) {
    dateIncident = typeof ref.dateIncident === "string" ? ref.dateIncident : null;
    datePublique = typeof ref.datePublique === "string" ? ref.datePublique : null;
    proofUrl = typeof ref.preuve?.url === "string" ? ref.preuve.url : null;
    sourceFile = "bench/fixtures/corpus-reference-na.json";
    mention = typeof ref.mention === "string" ? ref.mention : null;
  } else if (matched) {
    dateIncident = typeof matched.date_incident === "string" ? matched.date_incident : null;
    datePublique = typeof matched.date_publication === "string" ? matched.date_publication : null;
    proofUrl = typeof matched.url === "string" ? matched.url : null;
    sourceFile = String(matched.id ?? "").startsWith("na-couv-")
      ? "bench/couverture/incidents.jsonl"
      : "bench/corpus/incidents-departement.jsonl";
    mention = typeof matched.mention === "string" ? matched.mention : null;
  } else {
    datePublique = typeof row.datePremierMedia === "string" ? row.datePremierMedia : null;
  }

  if (dateIncident) {
    dateReference = dateIncident;
    dateReferenceType = "dateIncident";
  } else if (datePublique) {
    dateReference = datePublique;
    dateReferenceType = "datePublique";
  } else {
    dateReference = String(row.dates?.radar ?? "");
    dateReferenceType = "dateRadar";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReference)) {
    throw new Error(`missing reference date for ${row.id}`);
  }

  return {
    id: row.id,
    entite: row.entite,
    departement: dept,
    ...(dateIncident ? { dateIncident } : {}),
    ...(!dateIncident && datePublique ? { datePublique } : {}),
    dateReference,
    dateReferenceType,
    aliases: aliases(String(row.entite), mention),
    proofUrl,
    sourceFile,
  };
}

function fromCoverage(id: string): Row {
  const row = coverage.find((item) => item.id === id);
  if (!row) throw new Error(`replacement incident not found: ${id}`);
  const dateIncident = typeof row.date_incident === "string" ? row.date_incident : null;
  const datePublique = typeof row.date_publication === "string" ? row.date_publication : null;
  const dateReference = dateIncident ?? datePublique ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReference)) throw new Error(`missing date for ${id}`);
  return {
    id: row.id,
    entite: row.organisation,
    departement: DEPARTMENT_CODES[String(row.departement)] ?? String(row.departement),
    ...(dateIncident ? { dateIncident } : {}),
    ...(!dateIncident && datePublique ? { datePublique } : {}),
    dateReference,
    dateReferenceType: dateIncident ? "dateIncident" : "datePublique",
    aliases: aliases(String(row.organisation), typeof row.mention === "string" ? row.mention : null),
    proofUrl: typeof row.url === "string" ? row.url : null,
    sourceFile: "bench/couverture/incidents.jsonl",
  };
}

const kept: Row[] = [];
let replacementIndex = 0;
for (const row of benchmark) {
  if (EXCLUDED.has(String(row.id))) {
    const id = REPLACEMENTS[replacementIndex++];
    if (!id) throw new Error("not enough replacements");
    kept.push(fromCoverage(id));
  } else {
    kept.push(fromBenchmark(row));
  }
}
if (replacementIndex !== REPLACEMENTS.length) throw new Error("unused replacement incident");
if (kept.length !== 100) throw new Error(`expected 100 incidents, got ${kept.length}`);
const ids = new Set(kept.map((row) => row.id));
if (ids.size !== 100) throw new Error("duplicate incident id");
if (kept.some((row) => !NA_DEPARTMENTS.has(String(row.departement)))) throw new Error("non-NA incident");

const payload = {
  meta: {
    count: kept.length,
    builtBy: "scripts/build-anticipation-corpus-100.mts",
    inputs: [BENCHMARK.slice(ROOT.length), REFERENCE.slice(ROOT.length), COVERAGE.slice(ROOT.length), "bench/corpus/incidents-*.jsonl"],
    exclusions: [...EXCLUDED],
    rule: "One row per incident; reference date is the incident date, else the first public date, else the radar discovery date.",
  },
  incidents: kept,
};
writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`100 incidents written to ${OUTPUT.slice(ROOT.length)}`);
