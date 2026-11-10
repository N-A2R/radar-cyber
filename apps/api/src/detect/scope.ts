/**
 * Porte régionale — classement d'un événement par un modèle de décision.
 *
 * Le filtre déterministe (rattachement à une organisation) tranche la majorité
 * des cas. Le reste est une zone grise : un article peut concerner une
 * organisation régionale sans que son nom apparaisse, ou décrire une attaque
 * mondiale qui n'a rien à voir avec le territoire.
 *
 * `mercury-decide` répond à des questions typées et rend une distribution de
 * probabilités, pas du texte libre. On s'en sert comme second étage : il ne
 * décide pas seul, il produit un verdict accompagné d'une confiance, et
 * l'appelant applique le seuil. En dessous, on n'alerte pas — on préfère rater
 * un signal que noyer la file.
 *
 * Toute défaillance (réseau, quota, réponse inattendue) renvoie `null` :
 * l'appelant reprend alors la règle déterministe. Ce module ne lève jamais.
 */

export type EventScope = "REGIONAL" | "NATIONAL" | "MONDE";

export type ScopeDecision = {
  scope: EventScope;
  /** Confiance auto-déclarée par le modèle, entre 0 et 1. */
  confidence: number;
  /** Distribution complète, conservée pour l'audit. */
  probabilities: Record<string, number>;
  /** Modèle effectivement interrogé. */
  model: string;
};

const ENDPOINT = "https://api.inceptionlabs.ai/v1/decisions";
const MODEL = "mercury-decide";
/** En dessous de ce seuil, la décision n'est pas retenue. */
export const SCOPE_CONFIDENCE_THRESHOLD = 0.9;
const TIMEOUT_MS = 4000;

const CRITERIA: Record<string, string> = {
  REGIONAL: "Une organisation, une collectivité ou un établissement de Nouvelle-Aquitaine est directement concerné",
  NATIONAL: "L'événement concerne la France, sans lien identifiable avec la Nouvelle-Aquitaine",
  MONDE: "L'événement se déroule hors de France, ou n'a aucun lien avec le territoire",
};

/** La porte n'est active que si une clé est configurée. Sans clé, le moteur
 *  conserve son comportement d'origine : la fonctionnalité n'est pas déployée. */
export function isScopeGateEnabled(): boolean {
  return apiKey() !== null;
}

function apiKey(): string | null {
  const key = process.env.INCEPTION_API_KEY?.trim();
  return key && key.length > 8 ? key : null;
}

function isScope(value: unknown): value is EventScope {
  return value === "REGIONAL" || value === "NATIONAL" || value === "MONDE";
}

/** Extrait le verdict d'une réponse `mercury-decide` sans jamais faire confiance à sa forme. */
function readAnswer(payload: unknown): ScopeDecision | null {
  if (!payload || typeof payload !== "object") return null;
  const answers = (payload as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object") return null;
  const scopeAnswer = (answers as Record<string, unknown>).scope;
  if (!scopeAnswer || typeof scopeAnswer !== "object") return null;

  const candidate = scopeAnswer as { choice?: unknown; confidence?: unknown; probabilities?: unknown };
  if (!isScope(candidate.choice)) return null;

  const confidence = typeof candidate.confidence === "number" ? candidate.confidence : 0;
  const probabilities: Record<string, number> = {};
  if (candidate.probabilities && typeof candidate.probabilities === "object") {
    for (const [name, value] of Object.entries(candidate.probabilities as Record<string, unknown>)) {
      if (typeof value === "number") probabilities[name] = value;
    }
  }
  return { scope: candidate.choice, confidence, probabilities, model: MODEL };
}

/**
 * Classe un événement par portée géographique.
 *
 * @param text Titre et résumé concaténés, tronqués par l'appelant.
 * @returns la décision, ou `null` si le service est indisponible ou la réponse inexploitable.
 */
export async function classifyScope(text: string): Promise<ScopeDecision | null> {
  const key = apiKey();
  const message = text.trim().slice(0, 1500);
  if (!key || message.length < 20) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        state: { message },
        questions: {
          scope: {
            type: "choice",
            instructions:
              "Portée géographique de cet événement pour un observatoire du cyber en Nouvelle-Aquitaine.",
            criteria: CRITERIA,
          },
        },
      }),
    });
    if (!res.ok) return null;
    return readAnswer(await res.json());
  } catch {
    // Réseau coupé, quota, délai dépassé : la règle déterministe reprend la main.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Vrai si la décision est exploitable telle quelle. */
export function isConfident(decision: ScopeDecision | null): decision is ScopeDecision {
  return decision !== null && decision.confidence >= SCOPE_CONFIDENCE_THRESHOLD;
}
