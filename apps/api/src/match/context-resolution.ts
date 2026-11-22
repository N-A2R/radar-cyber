/**
 * Context signals for the organization resolver.
 *
 * The gazetteer decides from an alias index, but three decisions are unsafe
 * without reading the surrounding words:
 *
 *  - a one-word brand ("Lectra") is only a name when the text says it is a
 *    company ("the company Lectra"), not in a bare mention;
 *  - a territorial role ("Department of Gironde") is a victim only when the
 *    institution is the subject, not when it follows "company of";
 *  - a near miss ("CHU of Bordeau") is a typo only when a near alias exists
 *    and the text still talks about an organization or an incident.
 *
 * Everything here is bounded: token lookups and static tables, no scan of the
 * alias index, no external service, no network.
 */

/** Static string-keyed lookup: normalized tokens are the only keys. */
function words(list: readonly string[]): Record<string, true> {
	const table: Record<string, true> = {};
	for (const word of list) table[word] = true;
	return table;
}

/** Words that say the following single token is an organization's name. */
const BRAND_CUES = words([
	"societe", "groupe", "entreprise", "cooperative", "enseigne", "editeur",
	"fabricant", "operateur", "sarl", "sas", "sa", "sci", "scp", "eurl",
]);

/** Words that make a mention promotional, meteorological or administrative. */
const BENIGN_CUES = words([
	"sponsorise", "sponsor", "promotion", "promotions", "soldes", "resultats",
	"communique", "ouvre", "coupure", "orage", "salon", "inaugure",
]);

/** Words that keep a mention inside the cyber/incident scope. */
const INCIDENT_CUES = words([
	"cyber", "cyberattaque", "cyberattack", "rancongiciel", "rancon", "ransomware",
	"fuite", "fuites", "leak", "intrusion", "incident", "attaque", "attacks",
	"hameconnage", "phishing", "compromis", "compromission", "exfiltration",
	"exfiltree", "exfiltre", "violation", "vulnerabilite", "vulnerability",
	"revendication", "panne", "interruption", "indisponibilite", "donnees",
	"data", "serveur", "serveurs", "systeme", "systems", "acces", "sauvegarde",
	"sauvegardes", "messagerie", "portail", "plainte", "alerte", "signalement",
	"signale", "confirme", "enquete", "diagnostic", "audit", "securite",
	"frauduleux", "credentials", "anomalie", "breche", "faille", "informatique",
]);

/** Role words whose bare name is a place, not an institution. */
export const TERRITORIAL_ROLES = words([
	"departement", "departemental", "region", "regional", "agglomeration",
	"agglo", "communaute", "metropole", "district",
]);

const SUBJECT_DETERMINERS = words([
	"le", "la", "les", "l", "un", "une", "ce", "cet", "cette", "ces",
]);

const RELATION_WORDS = words([
	"du", "de", "des", "d", "au", "aux", "en", "dans", "chez", "sur", "par",
	"pour", "avec",
]);

/** True when a single-token alias is introduced as a company or institution. */
export function hasBrandCue(tokens: readonly string[]): boolean {
	return tokens.some((token) => BRAND_CUES[token] === true);
}

/**
 * True when the text mentions a promotion, an outage of a different kind or a
 * routine communication, and says nothing cyber. Such a mention must not
 * become an organization attribution.
 */
export function isBenignOnly(tokens: readonly string[]): boolean {
	return tokens.some((token) => BENIGN_CUES[token] === true)
		&& !tokens.some((token) => INCIDENT_CUES[token] === true);
}

/** Position of `alias` in `tokens`, or -1 when the alias is not contiguous. */
export function positionOfAlias(tokens: readonly string[], alias: readonly string[]): number {
	if (alias.length === 0 || alias.length > tokens.length) return -1;
	for (let start = 0; start + alias.length <= tokens.length; start++) {
		let same = true;
		for (let i = 0; i < alias.length; i++) {
			if (tokens[start + i] !== alias[i]) {
				same = false;
				break;
			}
		}
		if (same) return start;
	}
	return -1;
}

/**
 * True when a territorial role alias is the grammatical subject. "The
 * Department of Gironde was hit" names the victim; "a company of the
 * Department of Gironde" only locates it.
 */
export function isSubjectMention(tokens: readonly string[], alias: readonly string[]): boolean {
	const start = positionOfAlias(tokens, alias);
	if (start < 0) return false;
	if (start === 0) return true;
	const before = tokens[start - 1] as string;
	if (RELATION_WORDS[before] === true) return false;
	return SUBJECT_DETERMINERS[before] === true;
}

/**
 * Bounded near-miss tokens for typo recovery: trim either edge, or replace an
 * edge by one letter. Covers the observed variants (Bordeau/Bordeaux,
 * Poitier/Poitiers, Lectraa/Lectra, discountt/cdiscount) without generating
 * substitutions for every character of every token.
 */
export function nearTokens(token: string): readonly string[] {
	if (token.length < 4 || token.length > 24) return [];
	const variants = new Set<string>([token.slice(1), token.slice(0, -1)]);
	const bases = [token, token.slice(1), token.slice(0, -1)];
	for (const base of bases) {
		if (base.length === 0) continue;
		for (let code = 97; code <= 122; code++) {
			const letter = String.fromCharCode(code);
			variants.add(letter + base);
			variants.add(base + letter);
		}
	}
	variants.delete(token);
	return [...variants];
}
