/**
 * Jeu synthétique déterministe : 5 flux qui dérivent, 10 flux inchangés.
 *
 * Les 15 flux partagent trois lexiques de termes génériques et six zones
 * fabriquées (`ZONE-A` … `ZONE-F`). Le générateur est sans dépendance réseau,
 * sans donnée personnelle et sans source réelle ; il est utilisé par le test
 * et par le vérificateur du critère, qui insère les observations dans une base
 * de test éphémère. Aucun terme n'est une astuce propre au jeu : les mêmes
 * poids et le même bruit sont appliqués aux 15 flux, seuls les jours de
 * changement et les distributions cibles diffèrent.
 */
import {
  addDays,
  SEMANTIC_DRIFT_MODEL,
  type DriftKind,
  type Histogram,
  type SemanticFeed,
  type SemanticObservation,
} from "./derive-semantique.js";

export const FIXTURE_SOURCE = "fixture-derive-semantique-15";
export const FIXTURE_START = "2026-01-01";
export const FIXTURE_DAYS = 120;
export const DRIFT_IDS = ["DRIFT-01", "DRIFT-02", "DRIFT-03", "DRIFT-04", "DRIFT-05"] as const;
export const STABLE_IDS = [
  "STABLE-01", "STABLE-02", "STABLE-03", "STABLE-04", "STABLE-05",
  "STABLE-06", "STABLE-07", "STABLE-08", "STABLE-09", "STABLE-10",
] as const;

export type DriftAnnotation = {
  sourceId: string;
  kind: DriftKind;
  onsetDay: string;
  reportedDay: string;
  rationale: string;
};

export type SemanticFixture = {
  model: string;
  source: string;
  feeds: SemanticFeed[];
  annotations: DriftAnnotation[];
};

type Weighted = readonly (readonly [string, number])[];

const LEXIQUES: readonly Weighted[] = [
  [
    ["campagne", 20], ["phishing", 15], ["hameçonnage", 12], ["identifiants", 10],
    ["SMS", 9], ["QRcode", 8], ["facture", 7], ["livraison", 6], ["banque", 6],
    ["lien", 5], ["capture", 4], ["formulaire", 4],
  ],
  [
    ["ransomware", 20], ["chiffrement", 15], ["rançon", 12], ["exfiltration", 10],
    ["fuite", 9], ["négociation", 8], ["sauvegarde", 7], ["serveur", 6], ["victime", 6],
    ["brute", 5], ["incident", 4], ["restauration", 4],
  ],
  [
    ["CVE", 20], ["correctif", 15], ["exploitation", 12], ["zero-day", 10],
    ["patch", 9], ["scanner", 8], ["périmètre", 7], ["pare-feu", 6], ["VPN", 6],
    ["IoC", 5], ["signature", 4], ["CISA", 4],
  ],
];

const ZONES = ["ZONE-A", "ZONE-B", "ZONE-C", "ZONE-D", "ZONE-E", "ZONE-F"] as const;
const PROFILES: readonly Weighted[] = [
  [["ZONE-A", 38], ["ZONE-B", 25], ["ZONE-C", 15], ["ZONE-D", 10], ["ZONE-E", 7], ["ZONE-F", 5]],
  [["ZONE-C", 42], ["ZONE-D", 29], ["ZONE-F", 14], ["ZONE-B", 7], ["ZONE-A", 5], ["ZONE-E", 3]],
];
const UNIFORM_ZONES: Weighted = ZONES.map((zone) => [zone, 1]);

const DRIFT_PLAN = [
  { day: 56, reportAfter: 26, theme: 1, kind: "vocabulaire" as const },
  { day: 59, reportAfter: 24, theme: 2, kind: "vocabulaire" as const },
  { day: 62, reportAfter: 30, theme: 0, kind: "vocabulaire" as const },
  { day: 65, reportAfter: 25, theme: 0, kind: "couverture" as const },
  { day: 68, reportAfter: 28, theme: 2, kind: "couverture" as const },
];

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** PRNG mulberry32 : même jeu rejoué sur toute machine, sans Math.random(). */
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick(entries: Weighted, random: () => number): string {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let draw = random() * total;
  for (const [name, weight] of entries) {
    draw -= weight;
    if (draw < 0) return name;
  }
  return entries[entries.length - 1]![0];
}

/** Mélange lent et borné, identique pour les flux stables et dérivants. */
function modulate(entries: Weighted, day: number, phase: number): Weighted {
  return entries.map(([name, weight], index) => [
    name,
    weight * (1 + 0.06 * Math.sin(day / 13 + index * 0.7 + phase)),
  ]);
}

function mix(primary: Weighted, share: number, background: Weighted): Weighted {
  const primaryTotal = primary.reduce((sum, [, w]) => sum + w, 0);
  const backgroundTotal = background.reduce((sum, [, w]) => sum + w, 0);
  return [
    ...primary.map(([name, w]) => [name, (share * w) / primaryTotal] as const),
    ...background.map(([name, w]) => [name, ((1 - share) * w) / backgroundTotal] as const),
  ];
}

function observe(sourceId: string, dayIndex: number, theme: number, profile: number, phase: number): SemanticObservation {
  const random = rng(hash(`${FIXTURE_SOURCE}/${sourceId}/${dayIndex}`));
  const day = addDays(FIXTURE_START, dayIndex);
  const terms: Histogram = {};
  const coverage: Histogram = {};
  const allTerms = LEXIQUES.flat();
  const termWeights = modulate(mix(LEXIQUES[theme]!, 0.88, allTerms), dayIndex, phase);
  const zoneWeights = modulate(mix(PROFILES[profile]!, 0.88, UNIFORM_ZONES), dayIndex, phase);
  const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
  const volume = Math.max(8, 27 + Math.floor(random() * 10) - (weekend ? 5 : 0));

  for (let item = 0; item < volume; item++) {
    for (let token = 0; token < 3; token++) {
      const term = pick(termWeights, random);
      terms[term] = (terms[term] ?? 0) + 1;
    }
    const zone = pick(zoneWeights, random);
    coverage[zone] = (coverage[zone] ?? 0) + 1;
  }
  return { day, terms, coverage };
}

function buildFeed(
  sourceId: string,
  index: number,
  plan: (typeof DRIFT_PLAN)[number] | null,
): { feed: SemanticFeed; annotation: DriftAnnotation | null } {
  const baseTheme = index % LEXIQUES.length;
  const baseProfile = index % PROFILES.length;
  const phase = index * 0.31;
  const observations: SemanticObservation[] = [];
  for (let dayIndex = 0; dayIndex < FIXTURE_DAYS; dayIndex++) {
    const drifted = plan !== null && dayIndex >= plan.day;
    const theme = drifted && plan!.kind === "vocabulaire" ? plan!.theme : baseTheme;
    // Un changement de vocabulaire ne touche pas la couverture et inversement :
    // chaque alerte peut être attribuée à une seule cause mesurable.
    const profile = drifted && plan!.kind === "couverture" ? 1 - baseProfile : baseProfile;
    observations.push(observe(sourceId, dayIndex, theme, profile, phase));
  }

  if (!plan) return { feed: { sourceId, observations, expected: "unchanged" }, annotation: null };
  return {
    feed: { sourceId, observations, expected: "drift" },
    annotation: {
      sourceId,
      kind: plan.kind,
      onsetDay: addDays(FIXTURE_START, plan.day),
      reportedDay: addDays(FIXTURE_START, plan.day + plan.reportAfter),
      rationale: `Signalement analyste simulé sur ${sourceId}, ${plan.reportAfter} jours après le changement de ${plan.kind}.`,
    },
  };
}

/** Jeu complet : 5 dérives annotées, 10 flux inchangés sans annotation. */
export function buildSemanticDriftFixture(): SemanticFixture {
  const feeds: SemanticFeed[] = [];
  const annotations: DriftAnnotation[] = [];
  DRIFT_IDS.forEach((sourceId, index) => {
    const built = buildFeed(sourceId, index, DRIFT_PLAN[index]!);
    feeds.push(built.feed);
    if (built.annotation) annotations.push(built.annotation);
  });
  STABLE_IDS.forEach((sourceId, index) => {
    feeds.push(buildFeed(sourceId, index + DRIFT_IDS.length, null).feed);
  });
  return { model: SEMANTIC_DRIFT_MODEL, source: FIXTURE_SOURCE, feeds, annotations };
}
