/**
 * Note de confiance d'une alerte, sur 100 (roadmap phase 2).
 *
 * Une alerte doit dire *pourquoi* on la croit : la note unique reste affichée,
 * mais elle est la somme pondérée de quatre composantes internes, toutes
 * consultables. Aucune composante ne vient du réseau ni d'un modèle : elles
 * sont calculées depuis ce qui est déjà en base, donc reproductibles.
 *
 * | Composante | Poids | Source |
 * |---|---|---|
 * | `source_reliability` | 0,30 | `event.confidence` (A1 > A2 > B2 > C3) |
 * | `assertion_strength` | 0,30 | `event.assertion_type` |
 * | `attachment_quality` | 0,20 | rattachement à une organisation géolocalisée |
 * | `corroboration` | 0,20 | nombre de sources distinctes sur 30 jours |
 *
 * Sous `REVIEW_THRESHOLD`, l'alerte porte le statut « à vérifier » : elle
 * s'affiche, mais ne se présente pas comme un fait établi.
 */

export type ConfidenceComponents = {
  source_reliability: number;
  assertion_strength: number;
  attachment_quality: number;
  corroboration: number;
};

export type AlertConfidence = {
  /** Note unique sur 100, arrondie. */
  score: number;
  /** Composantes normalisées de 0 à 1. */
  components: ConfidenceComponents;
  status: "verifie" | "a_verifier";
};

/** Poids des composantes ; la somme vaut 1. */
const WEIGHTS: ConfidenceComponents = {
  source_reliability: 0.3,
  assertion_strength: 0.3,
  attachment_quality: 0.2,
  corroboration: 0.2,
};

/**
 * En dessous, l'alerte est marquée « à vérifier ».
 *
 * Mesuré sur les alertes réelles : une revendication de rançongiciel portée par
 * une seule source C3, sans corroboration, atteignait 54–62 avec un seuil à 50
 * — donc « vérifié », ce qui est faux. Le seuil est fixé à 65 : il faut soit
 * une corroboration, soit une source de meilleure qualité, soit un incident
 * confirmé pour dépasser le seuil.
 */
export const REVIEW_THRESHOLD = 65;

/** Fiabilité lettrée déjà portée par l'événement. */
const SOURCE_RANK: Record<string, number> = { A1: 1, A2: 0.8, B2: 0.5, C3: 0.25 };

/**
 * Nature de l'affirmation : un incident confirmé vaut plus qu'un signal
 * d'ambiance, une revendication tierce vaut plus qu'un simple indice technique.
 */
const ASSERTION_RANK: Record<string, number> = {
  confirmed_incident: 1,
  third_party_claim: 0.7,
  technical_indicator: 0.6,
  ambient_signal: 0.35,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export type ConfidenceInput = {
  sourceConfidence?: string | null;
  assertionType?: string | null;
  orgId?: number | null;
  orgDept?: string | null;
  /** Nombre de sources distinctes ayant parlé de l'organisation sur 30 jours. */
  distinctSources?: number;
};

/** Calcule la note et ses quatre composantes. Fonction pure. */
export function scoreAlert(input: ConfidenceInput): AlertConfidence {
  const source = SOURCE_RANK[String(input.sourceConfidence ?? "").toUpperCase()] ?? 0.35;
  const assertion = ASSERTION_RANK[String(input.assertionType ?? "")] ?? 0.35;
  // Une organisation géolocalisée vaut le maximum ; sans département elle
  // reste plausible ; l'absence de rattachement ne prouve rien.
  const attachment = input.orgId == null ? 0.15 : input.orgDept ? 1 : 0.7;
  // Une seule source ne corrobore rien, trois sources oui.
  const distinct = input.distinctSources ?? 0;
  const corroboration = distinct >= 3 ? 1 : distinct === 2 ? 0.65 : distinct === 1 ? 0.3 : 0;

  const components: ConfidenceComponents = {
    source_reliability: clamp01(source),
    assertion_strength: clamp01(assertion),
    attachment_quality: clamp01(attachment),
    corroboration: clamp01(corroboration),
  };

  let total = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof ConfidenceComponents)[]) {
    total += components[key] * WEIGHTS[key];
  }
  const score = Math.round(total * 100);

  return {
    score,
    components,
    status: score >= REVIEW_THRESHOLD ? "verifie" : "a_verifier",
  };
}
