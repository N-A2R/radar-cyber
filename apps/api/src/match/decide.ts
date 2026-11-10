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

/** Extrait une probabilité `noul` sans faire confiance à la forme. */
function readNoul(payload: unknown, question: string): number | null {
	if (typeof payload !== "object" || payload === null || !("answers" in payload)) return null;
	const answers = payload.answers;
	if (typeof answers !== "object" || answers === null || !(question in answers)) return null;
	const answer = (answers as Record<string, unknown>)[question];
	if (typeof answer !== "object" || answer === null || !("noul" in answer)) return null;
	const value = Number((answer as { noul: unknown }).noul);
	return Number.isFinite(value) ? value : null;
}

/** Au-dessus, le modèle affirme ; en dessous de 1 − ce seuil, il nie. */
const CONFIRM_THRESHOLD = 0.9;

/**
 * Vérifie qu'un texte désigne bien une organisation donnée.
 *
 * Sert aux revendications de rançongiciel, où le rapprochement par nom est
 * trop permissif : « El Portal Imaging Center » avait été rattaché à
 * « IBM Services Center France ». Le modèle lit le texte et le nom, et répond
 * par une probabilité. Entre les deux seuils, il hésite : on rend `null` et
 * l'appelant décide.
 *
 * Le nom est placé dans l'état, pas dans la question : mesuré, ce modèle
 * ignore le texte d'une question et ne lit que l'état.
 */
export async function confirmOrganization(text: string, orgName: string): Promise<boolean | null> {
	const key = decisionApiKey();
	const message = text.trim().slice(0, 1200);
	if (!key || message.length < 20 || orgName.trim() === "") return null;

	const payload = await askDecision(
		{ message: `Texte : ${message}\n\nOrganisation candidate : ${orgName}` },
		{ mention: { type: "noul", text: "Le texte désigne-t-il cette organisation ?" } },
	);
	if (payload === null) return null;
	const probability = readNoul(payload, "mention");
	if (probability === null) return null;
	if (probability >= CONFIRM_THRESHOLD) return true;
	if (probability <= 1 - CONFIRM_THRESHOLD) return false;
	return null;
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
