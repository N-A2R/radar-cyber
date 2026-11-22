/**
 * Cost-per-incident model for cyber incidents in Nouvelle-Aquitaine.
 *
 * Pure and deterministic: no database, no network, no clock. The only inputs
 * are published monetary losses from public sources (local press, court
 * decisions, official statements). Outputs never carry victim names,
 * addresses, article URLs or raw source text.
 */

export type CostCategory = "loss" | "damage" | "fraud" | "cost" | "ransom";

export type IncidentRecord = {
  id: string;
  department: string;
  type?: string | null;
  date?: string | null;
  organisation?: string | null;
  title?: string | null;
  excerpt?: string | null;
  summary?: string | null;
};

export type CostObservation = {
  incidentId: string;
  department: string;
  incidentDate: string | null;
  amountEur: number;
  category: CostCategory;
};

export type CostModel = {
  method: "lognormal-mle-percentile-bootstrap";
  seed: number;
  resamples: number;
  sampleSize: number;
  mu: number;
  sigma: number;
  medianEur: number;
  meanEur: number;
  meanCi95: [number, number];
  predictionCi95: [number, number];
};

export type CostReport = {
  scope: "nouvelle-aquitaine";
  incidentsScanned: number;
  incidentsInNouvelleAquitaine: number;
  incidentsWithOrganizationVictim: number;
  incidentsWithPublishedCost: number;
  observations: CostObservation[];
  model: CostModel;
};

const NA_DEPARTMENT_CODES: Record<string, true> = {
  "16": true,
  "17": true,
  "19": true,
  "23": true,
  "24": true,
  "33": true,
  "40": true,
  "47": true,
  "64": true,
  "79": true,
  "86": true,
  "87": true,
};
const NA_DEPARTMENT_NAMES: Record<string, string> = {
  charente: "16",
  "charente-maritime": "17",
  correze: "19",
  creuse: "23",
  dordogne: "24",
  gironde: "33",
  landes: "40",
  "lot-et-garonne": "47",
  "pyrenees-atlantiques": "64",
  "deux-sevres": "79",
  vienne: "86",
  "haute-vienne": "87",
};

/** Lowercase, unaccented, straight-apostrophe comparison form. */
export function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'");
}

/** Accepts either a department code or a French department name. */
export function normalizeDepartment(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (/^\d{1,2}$/.test(raw)) {
    const code = raw.padStart(2, "0");
    return NA_DEPARTMENT_CODES[code] ? code : null;
  }
  return NA_DEPARTMENT_NAMES[fold(raw)] ?? null;
}

const PERSONAL_VICTIM = /\b(couple|proprietaire|particulier|temoin|hotes?|anonymise|anonymis)\b/;
const ORGANIZATION_MARKER = /\b(mairie|ville|college|lycee|ecole|association|hopital|sas|sarl|societe|entreprise|atelier|supermarche|intermarche|carrefour|arpajh|carpa|clinique|ehpad|commune|departement|region|universite|gites|commerce|magasin|cooperative|syndicat|banque|etablissement)\b/;

/**
 * Only organizational victims enter the cost sample. A named natural person
 * (or an anonymized witness) is excluded even when an amount is published.
 */
export function isOrganizationVictim(organisation: string | null | undefined): boolean {
  if (!organisation) return false;
  const text = fold(organisation);
  if (PERSONAL_VICTIM.test(text)) return false;
  return ORGANIZATION_MARKER.test(text);
}

export type EuroMatch = { raw: string; start: number; end: number; amountEur: number };

const AMOUNT_RE = /([0-9][0-9\s\u00a0\u202f.,]*)\s*(milliards?|millions?|million)?\s*(d[’']euros?|euros?|€|EUR|M€)/gi;

function parseNumber(raw: string): number | null {
  const text = raw.replace(/[\s\u00a0\u202f]/g, "");
  if (!/^[0-9.,]+$/.test(text)) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let value: number;
  if (lastDot >= 0 && lastComma >= 0) {
    value = Number(text.replace(/\./g, "").replace(",", "."));
  } else if (lastComma >= 0) {
    value = Number(text.length - lastComma - 1 === 3 ? text.replace(",", "") : text.replace(",", "."));
  } else if (lastDot >= 0) {
    value = Number(text.length - lastDot - 1 === 3 ? text.replace(".", "") : text);
  } else {
    value = Number(text);
  }
  return Number.isFinite(value) ? value : null;
}

/** Finds euro amounts; "173.000 euros" is 173000, "3,20 €" is 3.2. */
export function findEuroAmounts(text: string): EuroMatch[] {
  const matches: EuroMatch[] = [];
  for (const match of text.matchAll(AMOUNT_RE)) {
    const value = parseNumber(match[1] ?? "");
    if (value === null || value <= 0) continue;
    const unit = match[2] ?? "";
    const currency = match[3] ?? "";
    const multiplier = /^milliard/i.test(unit) ? 1e9 : /^million/i.test(unit) ? 1e6 : currency === "M€" ? 1e6 : 1;
    matches.push({
      raw: match[0],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      amountEur: value * multiplier,
    });
  }
  return matches;
}

const NEGATIVE_CONTEXT = /\b(promet\w*|promis|aides?|subventions?|abonnement|par mois|prix|salaire|emprunt|don|budget annuel|remport\w*|prud'hommes|restitu\w*|recuper\w*|bloqu\w*)\b/;
const REFUSED_RANSOM = /\b(rancon)\b[^.]{0,60}\b(reclam\w*|refus\w*|demand\w*|exig\w*)\b|\b(reclam\w*|refus\w*|demand\w*|exig\w*)\b[^.]{0,60}\b(rancon)\b/;
const POSITIVE_CONTEXT: ReadonlyArray<readonly [RegExp, CostCategory]> = [
  [/\b(pertes?|perd\w*)\b/, "loss"],
  [/\b(prejudice|dommages?|degats?)\b/, "damage"],
  [/\b(detourn\w*|extorqu\w*|escroqu\w*|vol\w*)\b/, "fraud"],
  [/\b(couts?|frais|provision|reparation)\b/, "cost"],
  [/\b(rancon)\b[^.]{0,60}\b(pay\w*|verse\w*)\b|\b(pay\w*|verse\w*)\b[^.]{0,60}\b(rancon)\b/, "ransom"],
];

/**
 * An amount counts only when the nearby text says it was actually lost,
 * paid or repaired. Lures, prices, subscriptions and refused ransom demands
 * are not incident costs.
 */
export function classifyCostContext(text: string, start: number, end: number): CostCategory | null {
  const beforeRaw = text.slice(Math.max(0, start - 45), start);
  const afterRaw = text.slice(end, Math.min(text.length, end + 35));
  const before = fold(beforeRaw.split(/[.,;!?]/).at(-1) ?? "");
  const after = fold(afterRaw.split(/[.,;!?]/)[0] ?? "");
  const context = `${before} ${after}`;
  if (NEGATIVE_CONTEXT.test(context) || REFUSED_RANSOM.test(context)) return null;
  for (const [pattern, category] of POSITIVE_CONTEXT) {
    if (pattern.test(context)) return category;
  }
  return null;
}

/** Extracts published loss amounts; no source text or victim identity is kept. */
export function extractCostObservations(record: IncidentRecord): CostObservation[] {
  const department = normalizeDepartment(record.department);
  if (!department) return [];
  const text = [record.title, record.excerpt, record.summary].filter(Boolean).join(" ");
  const observations: CostObservation[] = [];
  for (const match of findEuroAmounts(text)) {
    const category = classifyCostContext(text, match.start, match.end);
    if (!category) continue;
    observations.push({
      incidentId: record.id,
      department,
      incidentDate: record.date ?? null,
      amountEur: match.amountEur,
      category,
    });
  }
  return observations;
}

/** One conservative observation per loss and per incident; never double-count. */
export function aggregateIncidents(observations: readonly CostObservation[]): CostObservation[] {
  const byLoss = new Map<string, CostObservation>();
  for (const observation of observations) {
    const key = `${observation.department}|${Math.round(observation.amountEur)}|${observation.incidentDate ?? ""}`;
    const previous = byLoss.get(key);
    if (!previous || observation.amountEur > previous.amountEur) byLoss.set(key, observation);
  }
  const byIncident = new Map<string, CostObservation>();
  for (const observation of byLoss.values()) {
    const previous = byIncident.get(observation.incidentId);
    if (!previous || observation.amountEur > previous.amountEur) byIncident.set(observation.incidentId, observation);
  }
  return [...byIncident.values()].sort((a, b) => a.incidentId.localeCompare(b.incidentId));
}

export type LognormalFit = { mu: number; sigma: number; median: number; mean: number };

/** Maximum-likelihood lognormal fit on log-transformed incident losses. */
export function fitLognormal(values: readonly number[]): LognormalFit {
  if (values.length === 0) return { mu: 0, sigma: 0, median: 0, mean: 0 };
  const logs = values.map((value) => Math.log(value));
  const mu = logs.reduce((sum, value) => sum + value, 0) / logs.length;
  const variance = logs.length < 2
    ? 0
    : logs.reduce((sum, value) => sum + (value - mu) ** 2, 0) / (logs.length - 1);
  const sigma = Math.sqrt(variance);
  return { mu, sigma, median: Math.exp(mu), mean: Math.exp(mu + (sigma * sigma) / 2) };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic percentile bootstrap of the mean cost per incident. */
export function bootstrapMean(values: readonly number[], resamples = 2000, seed = 20261122): [number, number] {
  if (values.length === 0) return [0, 0];
  const random = mulberry32(seed);
  const means: number[] = [];
  for (let i = 0; i < resamples; i++) {
    let sum = 0;
    for (let j = 0; j < values.length; j++) {
      sum += values[Math.floor(random() * values.length)]!;
    }
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  const quantile = (p: number): number => {
    const position = p * (means.length - 1);
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return means[low]! + (means[high]! - means[low]!) * (position - low);
  };
  return [quantile(0.025), quantile(0.975)];
}

/** End-to-end model: NA scope, organizational victims, published losses only. */
export function buildCostModel(
  records: readonly IncidentRecord[],
  seed = 20261122,
  resamples = 2000,
): CostReport {
  const naRecords = records.filter((record) => normalizeDepartment(record.department) !== null);
  const organizationRecords = naRecords.filter((record) => isOrganizationVictim(record.organisation));
  const observations = aggregateIncidents(organizationRecords.flatMap(extractCostObservations));
  const values = observations.map((observation) => observation.amountEur);
  const fit = fitLognormal(values);
  return {
    scope: "nouvelle-aquitaine",
    incidentsScanned: records.length,
    incidentsInNouvelleAquitaine: naRecords.length,
    incidentsWithOrganizationVictim: organizationRecords.length,
    incidentsWithPublishedCost: observations.length,
    observations,
    model: {
      method: "lognormal-mle-percentile-bootstrap",
      seed,
      resamples,
      sampleSize: values.length,
      mu: fit.mu,
      sigma: fit.sigma,
      medianEur: fit.median,
      meanEur: fit.mean,
      meanCi95: bootstrapMean(values, resamples, seed),
      predictionCi95: [
        Math.exp(fit.mu - 1.96 * fit.sigma),
        Math.exp(fit.mu + 1.96 * fit.sigma),
      ],
    },
  };
}
