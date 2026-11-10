// Score de confiance d'un indicateur (0-100).

export interface ScoreInput {
  type: string;
  first_seen?: string | Date | null;
  sources?: string[]; // distinct source ids/names
  sourceConfidence?: number | string; // 0-1 ou lettre (A1/A2/B2/C3)
}

const TYPE_WEIGHT: Record<string, number> = {
  hash: 10,
  domain: 20,
  url: 20,
  ip: 25,
  cve: 40,
};

/** La confiance lettree vaut un poids dans le score (A1 meilleur que C3). */
const CONFIDENCE_WEIGHT: Record<string, number> = { A1: 1, A2: 0.75, B2: 0.5, C3: 0.25 };

function confidenceValue(value: number | string | undefined): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return CONFIDENCE_WEIGHT[value.toUpperCase()] ?? null;
  return null;
}

export function scoreIndicator(input: ScoreInput): number {
  let score = 0;
  // ancienneté
  if (input.first_seen) {
    const d = input.first_seen instanceof Date ? input.first_seen : new Date(input.first_seen);
    const ageDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 30) score += 20;
    else if (ageDays > 7) score += 10;
    else score += 5;
  }
  // sources distinctes
  const n = input.sources?.length ?? 1;
  if (n >= 5) score += 30;
  else if (n >= 3) score += 20;
  else if (n >= 2) score += 10;
  else score += 0;
  // type
  score += TYPE_WEIGHT[(input.type || "").toLowerCase()] ?? 15;
  // confiance source
  const confidence = confidenceValue(input.sourceConfidence);
  if (confidence != null) score += Math.round(confidence * 15);
  return Math.max(0, Math.min(100, score));
}
