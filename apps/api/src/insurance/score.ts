/**
 * Cyber insurance profile score (0-100) for one organization.
 *
 * Pure and deterministic: the same inputs always give the same score, with a
 * published breakdown. Nothing here reads free text, victim data, or a paid
 * service. Higher means a stronger, better documented insurance profile.
 */
export const INSURANCE_SCORE_VERSION = "1.0.0";

export const SCORE_WEIGHTS = {
  recordIntegrity: 20,
  workforceTransparency: 10,
  incidentFreeHistory: 35,
  ambientPressure: 15,
  sectorPeerPosition: 10,
  evidenceBreadth: 10,
} as const;

export type ScoreComponentKey = keyof typeof SCORE_WEIGHTS;

export type InsuranceInput = {
  sirenPresent: boolean;
  nafPresent: boolean;
  coordinatesPresent: boolean;
  registryIdentifierPresent: boolean;
  workforce: number | null;
  incidentCount: number;
  maxIncidentSeverity: number;
  ambientCount: number;
  distinctSources: number;
  sectorClaimRate: number;
  overallClaimRate: number;
};

export type ScoreComponent = {
  key: ScoreComponentKey;
  points: number;
  weight: number;
  reason: string;
};

export type InsuranceScore = {
  version: string;
  score: number;
  band: "A" | "B" | "C" | "D";
  components: ScoreComponent[];
  inputs: InsuranceInput;
};

const round1 = (value: number): number => Math.round(value * 10) / 10;
const safeCount = (value: number): number => Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, value));

/** The score is shared by every organization: one formula, one version. */
export function computeInsuranceScore(raw: InsuranceInput): InsuranceScore {
  const input: InsuranceInput = {
    sirenPresent: raw.sirenPresent === true,
    nafPresent: raw.nafPresent === true,
    coordinatesPresent: raw.coordinatesPresent === true,
    registryIdentifierPresent: raw.registryIdentifierPresent === true,
    workforce: Number.isFinite(raw.workforce ?? NaN) && (raw.workforce ?? 0) > 0 ? raw.workforce : null,
    incidentCount: safeCount(raw.incidentCount),
    maxIncidentSeverity: safeCount(raw.maxIncidentSeverity),
    ambientCount: safeCount(raw.ambientCount),
    distinctSources: safeCount(raw.distinctSources),
    sectorClaimRate: Number.isFinite(raw.sectorClaimRate) && raw.sectorClaimRate >= 0 ? raw.sectorClaimRate : 0,
    overallClaimRate: Number.isFinite(raw.overallClaimRate) && raw.overallClaimRate >= 0 ? raw.overallClaimRate : 0,
  };

  const registryFields = [input.sirenPresent, input.nafPresent, input.coordinatesPresent, input.registryIdentifierPresent]
    .filter(Boolean).length;
  const workforcePoints = input.workforce === null
    ? 0
    : round1(clamp(2.5 * Math.log10(1 + input.workforce), SCORE_WEIGHTS.workforceTransparency));
  const incidentPenalty = clamp(
    20 * input.incidentCount + 3 * Math.max(0, input.maxIncidentSeverity - 2),
    SCORE_WEIGHTS.incidentFreeHistory,
  );
  const ambientPenalty = clamp(5 * input.ambientCount, SCORE_WEIGHTS.ambientPressure);
  const peerRatio = input.overallClaimRate > 0
    ? Math.min(1, input.sectorClaimRate / (2 * input.overallClaimRate))
    : 0;
  const peerPoints = round1(10 * (1 - peerRatio));
  const evidencePoints = Math.min(SCORE_WEIGHTS.evidenceBreadth, 3 * input.distinctSources);

  const components: ScoreComponent[] = [
    {
      key: "recordIntegrity",
      points: registryFields * 5,
      weight: SCORE_WEIGHTS.recordIntegrity,
      reason: `${registryFields} of 4 registry fields present (5 points each)`,
    },
    {
      key: "workforceTransparency",
      points: workforcePoints,
      weight: SCORE_WEIGHTS.workforceTransparency,
      reason: input.workforce === null
        ? "no published workforce figure"
        : `workforce ${input.workforce}: 2.5 * log10(1 + workforce), capped at 10`,
    },
    {
      key: "incidentFreeHistory",
      points: SCORE_WEIGHTS.incidentFreeHistory - incidentPenalty,
      weight: SCORE_WEIGHTS.incidentFreeHistory,
      reason: `${input.incidentCount} claim or confirmed incident(s), peak severity ${input.maxIncidentSeverity}; 35 - min(35, 20 * incidents + 3 * (severity - 2))`,
    },
    {
      key: "ambientPressure",
      points: SCORE_WEIGHTS.ambientPressure - ambientPenalty,
      weight: SCORE_WEIGHTS.ambientPressure,
      reason: `${input.ambientCount} ambient signal(s) in the 24-month window; 15 - min(15, 5 * signals)`,
    },
    {
      key: "sectorPeerPosition",
      points: peerPoints,
      weight: SCORE_WEIGHTS.sectorPeerPosition,
      reason: `sector claim rate ${input.sectorClaimRate.toExponential(3)} vs regional ${input.overallClaimRate.toExponential(3)}; 10 * (1 - min(1, sector / (2 * regional)))`,
    },
    {
      key: "evidenceBreadth",
      points: evidencePoints,
      weight: SCORE_WEIGHTS.evidenceBreadth,
      reason: `${input.distinctSources} distinct source(s) in the window; min(10, 3 * sources)`,
    },
  ];

  const score = round1(clamp(
    components.reduce((total, component) => total + component.points, 0),
    100,
  ));
  const band: InsuranceScore["band"] = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";
  return { version: INSURANCE_SCORE_VERSION, score, band, components, inputs: input };
}

/** Static, publishable description of the formula behind every score. */
export function insuranceMethodology(): {
  version: string;
  scale: string;
  bands: Record<string, string>;
  components: { key: ScoreComponentKey; weight: number; rule: string }[];
  exclusions: string[];
} {
  return {
    version: INSURANCE_SCORE_VERSION,
    scale: "0-100, higher means a stronger and better documented insurance profile",
    bands: { A: "80-100", B: "60-79.9", C: "40-59.9", D: "0-39.9" },
    components: [
      { key: "recordIntegrity", weight: 20, rule: "5 points per present field: SIREN, NAF, coordinates, registry identifier" },
      { key: "workforceTransparency", weight: 10, rule: "min(10, 2.5 * log10(1 + workforce)), 0 when unpublished" },
      { key: "incidentFreeHistory", weight: 35, rule: "35 - min(35, 20 * incidents + 3 * max(0, severity - 2))" },
      { key: "ambientPressure", weight: 15, rule: "15 - min(15, 5 * ambient signals)" },
      { key: "sectorPeerPosition", weight: 10, rule: "10 * (1 - min(1, sector claim rate / (2 * regional claim rate)))" },
      { key: "evidenceBreadth", weight: 10, rule: "min(10, 3 * distinct source identifiers)" },
    ],
    exclusions: [
      "organizations outside the twelve Nouvelle-Aquitaine departments",
      "event titles, summaries, evidence payloads, source URLs and victim data",
      "paid services and paid sources",
      "relevance or trust filters on sources: grey sources are admitted",
    ],
  };
}
