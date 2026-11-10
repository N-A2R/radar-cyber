/**
 * Arbitrage de rattachement par modèle de décision (`mercury-decide`).
 *
 * Le matcher déterministe refuse de deviner : quand deux organisations
 * correspondent avec la même force, il rend `null` — et l'événement reste non
 * rattaché. C'est la bonne règle, mais elle laisse passer des cas que le texte
 * tranche sans ambiguïté pour un lecteur humain.
 *
 * Ce module ajoute un second étage, jamais un premier : il n'est appelé que
 * quand le matcher a déjà réduit le problème à une poignée de candidats. Il
 * pose une question typée (`choice`) et rend une distribution de probabilités.
 * Sous `ARBITRATION_CONFIDENCE_THRESHOLD`, on garde `null` : on préfère rater
 * un rattachement que d'en inventer un.
 *
 * Toute défaillance (réseau, quota, clé absente, réponse inattendue) renvoie
 * `null` : l'appelant reprend la règle déterministe. Ce module ne lève jamais.
 */
import { askDecision, decisionApiKey } from "../detect/decision.js";


/** En dessous, l'arbitrage n'est pas retenu. */
export const ARBITRATION_CONFIDENCE_THRESHOLD = 0.9;

export type OrgCandidate = { id: number; name: string };

type DecisionAnswer = { choice: unknown; confidence: unknown };

function isDecisionAnswer(value: unknown): value is DecisionAnswer {
	if (typeof value !== "object" || value === null) return false;
	return "choice" in value && "confidence" in value;
}

/** Extrait le choix sans faire confiance à la forme de la réponse. */
function readChoice(payload: unknown): DecisionAnswer | null {
	if (typeof payload !== "object" || payload === null || !("answers" in payload)) return null;
	const answers = payload.answers;
	if (typeof answers !== "object" || answers === null || !("organization" in answers)) return null;
	const organization = answers.organization;
	return isDecisionAnswer(organization) ? organization : null;
}

/**
 * Demande au modèle quelle organisation le texte désigne.
 * Rend l'identifiant retenu, ou `null` si la décision n'est pas assez sûre.
 */
export async function chooseOrganization(
	text: string,
	candidates: readonly OrgCandidate[],
): Promise<number | null> {
	if (candidates.length < 2) return null;
	const key = decisionApiKey();
	const message = text.trim().slice(0, 1500);
	if (!key || message.length < 20) return null;

	const criteria: Record<string, string> = {};
	for (const candidate of candidates) criteria[`org_${candidate.id}`] = candidate.name;

	const payload = await askDecision(
		{ message },
		{
			organization: {
				type: "choice",
				instructions:
					"Quelle organisation ce texte désigne-t-il ? Choisir « aucune » si le texte ne nomme aucune de ces organisations.",
				criteria: { ...criteria, aucune: "Le texte ne désigne aucune de ces organisations" },
			},
		},
	);
	const answer = payload === null ? null : readChoice(payload);
	if (!answer) return null;
	const confidence = Number(answer.confidence);
	if (!Number.isFinite(confidence) || confidence < ARBITRATION_CONFIDENCE_THRESHOLD) return null;
	const choice = String(answer.choice ?? "");
	if (!choice.startsWith("org_")) return null;
	const id = Number(choice.slice(4));
	return Number.isInteger(id) && candidates.some((candidate) => candidate.id === id) ? id : null;
}
