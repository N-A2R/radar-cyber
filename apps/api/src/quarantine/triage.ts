/**
 * Priorisation de la file de revue — pur, sans base de données.
 *
 * Le problème n'est pas de stocker 16 235 faits, c'est de savoir lequel ouvrir
 * en premier. Ce module transforme un fait brut en score, en seau et en
 * suggestion, **avec la raison de chaque point** : un analyste doit pouvoir
 * contester le classement, donc voir ce qui l'a produit.
 *
 * Deux moteurs de rattachement existent dans le dépôt : celui de la quarantaine
 * (`quarantine/promote.ts`, domaine + phrases) et celui du référentiel
 * (`match/core.ts`, alias + flou). On les fait tous deux parler. Quand ils
 * divergent, le fait est marqué en désaccord et passe en revue : c'est
 * exactement le cas qu'un humain doit trancher.
 *
 * Signal inattendu trouvé dans le corpus : certains groupes publient des titres
 * structurés — `domaine\chiffre d'affaires\pays\volume\état`. Le pays déclaré
 * y est lisible. Un pays hors France fait chuter le score ; « France » le
 * remonte. C'est une **déclaration d'attaquant**, pas une vérité établie, et
 * la raison le dit explicitement.
 */

export type ClaimInput = {
	orgHint: string | null;
	groupe: string | null;
	claimedAt: string | Date | null;
	/** Date d'entrée dans notre file : c'est elle qui dit si le fait est frais. */
	receivedAt?: string | Date | null;
	tlp?: string | null;
	hasDescription?: boolean;
	source?: string | null;
};

export type MatchOpinion = { orgId: number; confidence: number } | null;

export type TriageBucket = "chaud" | "tiede" | "froid";
export type TriageSuggestion = "promote" | "review" | "reject";

export type TriageResult = {
	score: number;
	bucket: TriageBucket;
	suggested: TriageSuggestion;
	/** Une ligne par règle appliquée, avec son poids : la trace du classement. */
	reasons: Array<{ label: string; weight: number }>;
	/** Pays déclaré dans un titre structuré, jamais vérifié. */
	declaredCountry: string | null;
	domainOnly: boolean;
	disagreement: boolean;
	/** Indice français sans organisation correspondante : trou du référentiel. */
	referentialGap: boolean;
};

const DOMAIN_ONLY = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;
const COUNTRY_SEGMENT = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '.-]{1,28}$/;
const HOME_COUNTRIES = new Set(["france", "fr", "french republic"]);
/** Indices d'une organisation française, hors pays explicitement déclaré. */
const FRENCH_HINT = /\b(sas|sasu|sarl|eurl|sci|groupe|commune|mairie|ville|h[ôo]pital|clinique|lyc[ée]e|coll[èe]ge|universit[ée]|conseil d[ée]partemental)\b|\.fr\b/i;

/**
 * Titre structuré « domaine\CA\pays\volume\état ». On ne prend le pays que
 * s'il ressemble à un nom de pays : lettres seules, pas de chiffre, pas de
 * symbole monétaire, et pas un état de divulgation.
 */
export function declaredCountryOf(title: string): string | null {
	if (!title.includes("\\")) return null;
	const segments = title.split("\\").map((part) => part.trim()).filter((part) => part !== "");
	for (const segment of segments.slice(1)) {
		if (/\d|[$%€£]/.test(segment)) continue;
		if (/disclosed|leaked|published|updated|sold/i.test(segment)) continue;
		if (!COUNTRY_SEGMENT.test(segment)) continue;
		return segment;
	}
	return null;
}

function ageInDays(value: string | Date | null, now: Date): number | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

export function triageClaim(
	input: ClaimInput,
	primary: MatchOpinion,
	secondary: MatchOpinion,
	now: Date = new Date(),
): TriageResult {
	const reasons: Array<{ label: string; weight: number }> = [];
	const add = (label: string, weight: number) => reasons.push({ label, weight });
	const hint = (input.orgHint ?? "").trim();
	const country = declaredCountryOf(hint);
	const domainOnly = DOMAIN_ONLY.test(hint.split("\\")[0].trim());

	if (hint === "") {
		add("aucun indice d'organisation", -30);
	}

	if (primary && primary.confidence >= 0.85) {
		add(`rattachement fort (${primary.confidence.toFixed(2)})`, 45);
	} else if (primary) {
		add(`rattachement plausible (${primary.confidence.toFixed(2)})`, 24);
	} else {
		add("aucune organisation du référentiel ne correspond", 0);
	}

	const disagreement = Boolean(
		(primary && secondary && primary.orgId !== secondary.orgId)
		|| (primary && primary.confidence >= 0.85 && !secondary)
		|| (!primary && secondary && secondary.confidence >= 0.85),
	);
	if (disagreement) {
		add("les deux moteurs de rattachement divergent", -15);
	} else if (primary && secondary && primary.orgId === secondary.orgId) {
		add("les deux moteurs concordent", 12);
	}

	if (country) {
		if (HOME_COUNTRIES.has(country.toLowerCase())) {
			add(`pays déclaré : ${country} (déclaration d'attaquant)`, 25);
		} else {
			add(`pays déclaré hors France : ${country} (déclaration d'attaquant)`, -35);
		}
	}

	if (domainOnly) {
		add("indice réduit à un nom de domaine", -5);
	}

	if (input.hasDescription) {
		add("description exploitable", 8);
	} else {
		add("pas de description exploitable", -8);
	}

	// La fraîcheur qui compte pour l'analyste est l'entrée dans la file, pas
	// la date de publication des attaquants : un stock rejoué arrive entier le
	// même jour, et le pénaliser en bloc viderait la file de tout intérêt.
	const arrival = ageInDays(input.receivedAt ?? input.claimedAt, now);
	if (arrival === null) {
		add("date d'arrivée inconnue", -5);
	} else if (arrival <= 7) {
		add(`arrivé dans la file il y a ${arrival} j`, 12);
	} else if (arrival <= 30) {
		add(`arrivé dans la file il y a ${arrival} j`, 6);
	} else if (arrival <= 180) {
		add(`en attente depuis ${arrival} j`, 0);
	} else {
		add(`en attente depuis ${arrival} j`, -10);
	}

	const claimedAge = ageInDays(input.claimedAt, now);
	if (claimedAge !== null && claimedAge > 365) {
		add(`revendication publiée il y a ${claimedAge} j (stock ancien)`, -6);
	}

	// Trou du référentiel : l'indice sent la France mais aucune organisation
	// ne correspond. Ce n'est pas du bruit à jeter, c'est une entité à ajouter.
	const looksFrench = (country ? HOME_COUNTRIES.has(country.toLowerCase()) : false) || FRENCH_HINT.test(hint);
	const referentialGap = !primary && looksFrench && hint !== "";
	if (referentialGap) {
		add("organisation française probable absente du référentiel — à ajouter", 25);
	}

	const raw = reasons.reduce((total, reason) => total + reason.weight, 0);
	const score = Math.max(0, Math.min(100, raw));
	// Seuils calibrés sur le corpus réel : une revendication déclarée France
	// sans organisation au référentiel plafonne vers 33 — elle doit rester
	// visible (« tiède »), pas disparaître dans un froid indifférencié.
	const bucket: TriageBucket = score >= 60 ? "chaud" : score >= 20 ? "tiede" : "froid";

	let suggested: TriageSuggestion;
	if (hint === "" || (country && !HOME_COUNTRIES.has(country.toLowerCase()))) {
		suggested = "reject";
	} else if (disagreement) {
		suggested = "review";
	} else if (score >= 60) {
		suggested = "promote";
	} else {
		suggested = "review";
	}

	return { score, bucket, suggested, reasons, declaredCountry: country, domainOnly, disagreement, referentialGap };
}

/** Ordre de la file : score décroissant, puis revendication la plus récente. */
export function compareQueueEntries(
	a: { score: number; claimedAt: string | null; id: number },
	b: { score: number; claimedAt: string | null; id: number },
): number {
	if (b.score !== a.score) return b.score - a.score;
	const left = a.claimedAt ? Date.parse(a.claimedAt) : 0;
	const right = b.claimedAt ? Date.parse(b.claimedAt) : 0;
	if (right !== left) return right - left;
	return b.id - a.id;
}
