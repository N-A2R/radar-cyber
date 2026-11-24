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
 * Toute défaillance (réseau, quota, clé absente, JSON invalide) rend
 * `indisponible` ; une réponse valable mais entre les seuils rend `indecis`.
 * Ce module ne lève jamais.
 */
import { askDecision } from "../detect/decision.js";


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

/** Verdict explicite : ni `null` ambigu, ni `false` qui masque une panne. */
export type VerdictOrganisation = "oui" | "non" | "indecis" | "indisponible";

/** Fournisseur injectable pour les tests déterministes (aucun réseau). */
export type FournisseurDecision = (state: unknown, questions: unknown) => Promise<unknown | null>;

type ChoixDetaille = { verdict: VerdictOrganisation; orgId: number | null };

async function interroger(
	fournisseur: FournisseurDecision,
	state: unknown,
	questions: unknown,
): Promise<unknown | null> {
	try {
		return await fournisseur(state, questions);
	} catch {
		return null;
	}
}

/**
 * Vérifie qu'un texte désigne bien une organisation donnée.
 *
 * Sert aux revendications de rançongiciel, où le rapprochement par nom est
 * trop permissif. Le nom est placé dans l'état, pas dans la question : mesuré,
 * ce modèle ignore le texte d'une question et ne lit que l'état.
 */
export async function confirmOrganizationVerdict(
	text: string,
	orgName: string,
	fournisseur: FournisseurDecision = askDecision,
): Promise<VerdictOrganisation> {
	const message = text.trim().slice(0, 1200);
	if (message.length < 20 || orgName.trim() === "") return "indisponible";

	const payload = await interroger(
		fournisseur,
		{ message: `Texte : ${message}\n\nOrganisation candidate : ${orgName}` },
		{ mention: { type: "noul", text: "Le texte désigne-t-il cette organisation ?" } },
	);
	if (payload === null) return "indisponible";
	const probability = readNoul(payload, "mention");
	if (probability === null || probability < 0 || probability > 1) return "indisponible";
	if (probability >= CONFIRM_THRESHOLD) return "oui";
	if (probability <= 1 - CONFIRM_THRESHOLD) return "non";
	return "indecis";
}

async function choisirOrganisationDetaille(
	text: string,
	candidates: readonly OrgCandidate[],
	fournisseur: FournisseurDecision,
): Promise<ChoixDetaille> {
	if (candidates.length < 2) return { verdict: "indisponible", orgId: null };
	const message = text.trim().slice(0, 1500);
	if (message.length < 20) return { verdict: "indisponible", orgId: null };

	const criteria: Record<string, string> = {};
	for (const candidate of candidates) criteria[`org_${candidate.id}`] = candidate.name;

	const payload = await interroger(
		fournisseur,
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
	if (!answer) return { verdict: "indisponible", orgId: null };
	const confidence = Number(answer.confidence);
	if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
		return { verdict: "indisponible", orgId: null };
	}
	if (confidence < ARBITRATION_CONFIDENCE_THRESHOLD) return { verdict: "indecis", orgId: null };
	const choice = String(answer.choice ?? "");
	if (choice === "aucune") return { verdict: "non", orgId: null };
	if (!choice.startsWith("org_")) return { verdict: "indisponible", orgId: null };
	const id = Number(choice.slice(4));
	if (!Number.isInteger(id) || !candidates.some((candidate) => candidate.id === id)) {
		return { verdict: "indisponible", orgId: null };
	}
	return { verdict: "oui", orgId: id };
}

/** Demande au modèle quelle organisation le texte désigne, avec verdict explicite. */
export async function chooseOrganizationVerdict(
	text: string,
	candidates: readonly OrgCandidate[],
	fournisseur: FournisseurDecision = askDecision,
): Promise<VerdictOrganisation> {
	return (await choisirOrganisationDetaille(text, candidates, fournisseur)).verdict;
}

/** Enveloppe historique pour les appelants qui attendent un booléen. */
export async function confirmOrganization(
	text: string,
	orgName: string,
	fournisseur: FournisseurDecision = askDecision,
): Promise<boolean | null> {
	const verdict = await confirmOrganizationVerdict(text, orgName, fournisseur);
	return verdict === "oui" ? true : verdict === "non" ? false : null;
}

/** Enveloppe historique pour les appelants qui attendent un identifiant. */
export async function chooseOrganization(
	text: string,
	candidates: readonly OrgCandidate[],
	fournisseur: FournisseurDecision = askDecision,
): Promise<number | null> {
	const resultat = await choisirOrganisationDetaille(text, candidates, fournisseur);
	return resultat.verdict === "oui" ? resultat.orgId : null;
}
