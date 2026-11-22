/**
 * Regional contagion model for Nouvelle-Aquitaine.
 *
 * The model is deliberately descriptive, not a forecast: it explains a list of
 * exposures observed in the 30 days after 20 fallen organisations, and grades
 * the grey-source attribution of every item it puts on that list.
 *
 * Privacy rule: a fall carries a raw `victim` string only while it is graded.
 * `publicFall` strips it before anything leaves this module; no victim-related
 * free text is ever published through the API or the measurement report.
 */
export const NA_DEPARTMENTS = ["16", "17", "18", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"] as const;
export const WINDOW_DAYS = 30;
export const SEED_COUNT = 20;
/** Acceptance bar fixed before publishing the measurement. */
export const PRECISION_TARGET = 0.8;

const DAY_MS = 86_400_000;
const DECAY_DAYS = 180;

export type AttributionGrade = "exact" | "partial" | "unrelated";

export type FallRecord = {
  orgId: number;
  name: string;
  department: string;
  sector: string;
  sectorGroup: string;
  city: string;
  naf: string;
  parentOrgId: number | null;
  domain: string;
  /** ISO day (YYYY-MM-DD) of the first dated grey-source claim. */
  date: string;
  /** Raw claim label, used for grading only. Never published. */
  victim: string;
  source: string;
};

export type PublicFall = Omit<FallRecord, "victim"> & { attribution: AttributionGrade };

export type Exposure = PublicFall & {
  /** Contagion strength in [0, 1], from similarity to the verified seeds. */
  score: number;
  reasons: string[];
};

export type ContagionReport = {
  asOf: string;
  windowDays: number;
  seedCount: number;
  seeds: PublicFall[];
  exposures: Exposure[];
  rejected: number;
  precision: {
    value: number;
    exact: number;
    partial: number;
    unrelated: number;
    evaluated: number;
    target: number;
    reachedTarget: boolean;
  };
  /** How many exposures share a sector group with at least one verified seed. */
  sharedGroup: { exposures: number; matched: number };
};

export function parseDay(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError("invalid ISO day: " + day);
  const ms = Date.parse(day + "T00:00:00Z");
  if (Number.isNaN(ms)) throw new RangeError("invalid ISO day: " + day);
  return ms;
}

export function addDays(day: string, days: number): string {
  return new Date(parseDay(day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function isNaDepartment(department: string): boolean {
  return (NA_DEPARTMENTS as readonly string[]).includes(department);
}

/** Accent- and punctuation-insensitive key used only for attribution grading. */
function normalise(value: string): string {
  const folded = value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "");
  return folded.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/**
 * exact: same normalised label; partial: comparable token overlap or one label
 * inside the other; unrelated: the grey-source claim does not name this org.
 */
export function gradeAttribution(victim: string, orgName: string): AttributionGrade {
  const a = normalise(victim);
  const b = normalise(orgName);
  if (!a || !b) return "unrelated";
  if (a === b) return "exact";
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;
  const jaccard = shared / new Set([...ta, ...tb]).size;
  if (jaccard >= 0.5 || a.includes(b) || b.includes(a)) return "partial";
  return "unrelated";
}

/** Extract the victim label of a grey-source ransomware headline. */
export function victimFromTitle(title: string): string {
  return title.split(/\s+[—–-]\s+/)[0]?.trim() ?? "";
}

/** (exact + partial/2) / all graded items; no division by zero on empty input. */
export function attributionPrecision(grades: readonly AttributionGrade[]): number {
  if (grades.length === 0) return 0;
  const exact = grades.filter((g) => g === "exact").length;
  const partial = grades.filter((g) => g === "partial").length;
  return (exact + partial / 2) / grades.length;
}

function publicFall(record: FallRecord): PublicFall {
  const { victim: _victim, ...rest } = record;
  return { ...rest, attribution: gradeAttribution(record.victim, record.name) };
}

/** One row per organisation, dated at its first claim. */
export function deduplicateFalls(records: readonly FallRecord[]): FallRecord[] {
  const first = new Map<number, FallRecord>();
  for (const record of records) {
    const held = first.get(record.orgId);
    if (!held || record.date < held.date) first.set(record.orgId, record);
  }
  return [...first.values()].sort((a, b) => a.date.localeCompare(b.date) || a.orgId - b.orgId);
}

type SeedLike = Pick<FallRecord, "orgId" | "department" | "sector" | "sectorGroup" | "city" | "naf" | "parentOrgId" | "domain" | "date">;

/**
 * Similarity between one candidate and the verified seeds. Parent and shared
 * domain are the strongest links; broad sector groups are the weakest. Older
 * seeds decay so that a campaign of last week outweighs one from last year.
 */
export function contagionScore(candidate: SeedLike, seeds: readonly SeedLike[], asOf: string): { score: number; reasons: string[] } {
  const asOfMs = parseDay(asOf);
  const reasons = new Set<string>();
  let raw = 0;
  for (const seed of seeds) {
    const ageDays = Math.max(0, (asOfMs - parseDay(seed.date)) / DAY_MS);
    const weight = Math.exp(-ageDays / DECAY_DAYS);
    const links: Array<[boolean, number, string]> = [
      [seed.parentOrgId !== null && seed.parentOrgId === candidate.parentOrgId, 2, "shared-parent"],
      [seed.domain !== "" && seed.domain === candidate.domain, 2, "shared-domain"],
      [seed.sector !== "" && seed.sector === candidate.sector, 1.5, "shared-sector"],
      [seed.naf !== "" && seed.naf === candidate.naf, 1, "shared-naf"],
      [seed.sectorGroup !== "" && seed.sectorGroup === candidate.sectorGroup, 1, "shared-sector-group"],
      [seed.city !== "" && seed.city === candidate.city, 0.5, "shared-city"],
      [seed.department === candidate.department, 0.5, "shared-department"],
    ];
    for (const [matched, value, reason] of links) {
      if (matched) {
        raw += value * weight;
        reasons.add(reason);
      }
    }
  }
  return { score: Math.round(Math.min(1, raw / 6) * 1000) / 1000, reasons: [...reasons].sort() };
}

export function buildContagionReport(records: readonly FallRecord[], asOf: string): ContagionReport {
  const asOfMs = parseDay(asOf);
  const falls = deduplicateFalls(records.filter((r) => isNaDepartment(r.department)));
  const past = falls.filter((r) => parseDay(r.date) < asOfMs);
  const seeds = past.slice(-SEED_COUNT);
  const pastIds = new Set(past.map((r) => r.orgId));
  const endMs = asOfMs + WINDOW_DAYS * DAY_MS;
  const found = falls.filter((r) => {
    const ms = parseDay(r.date);
    return ms > asOfMs && ms <= endMs && !pastIds.has(r.orgId);
  });

  const verifiedSeeds = seeds.filter((r) => gradeAttribution(r.victim, r.name) !== "unrelated");
  const graded = [...seeds, ...found].map((r) => gradeAttribution(r.victim, r.name));
  const groupKeys = new Set(verifiedSeeds.map((s) => s.sectorGroup).filter((g) => g !== ""));
  const matchedGroup = found.filter((r) => r.sectorGroup !== "" && groupKeys.has(r.sectorGroup)).length;
  const exact = graded.filter((g) => g === "exact").length;
  const partial = graded.filter((g) => g === "partial").length;
  const unrelated = graded.filter((g) => g === "unrelated").length;
  const value = attributionPrecision(graded);

  const exposures = found.map((r) => {
    const { victim: _victim, ...rest } = r;
    const { score, reasons } = contagionScore(r, verifiedSeeds, asOf);
    return { ...rest, attribution: gradeAttribution(r.victim, r.name), score, reasons };
  }).sort((a, b) => b.score - a.score || a.date.localeCompare(b.date) || a.orgId - b.orgId);

  return {
    asOf,
    windowDays: WINDOW_DAYS,
    seedCount: seeds.length,
    seeds: seeds.map(publicFall),
    exposures,
    rejected: unrelated,
    precision: {
      value,
      exact,
      partial,
      unrelated,
      evaluated: graded.length,
      target: PRECISION_TARGET,
      reachedTarget: graded.length > 0 && value >= PRECISION_TARGET,
    },
    sharedGroup: { exposures: found.length, matched: matchedGroup },
  };
}
