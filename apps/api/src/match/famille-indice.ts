/**
 * Familles d'`org_hint` de la file de quarantaine.
 *
 * Le moteur de revue ne change pas : ce module seulement **découpe** la file
 * en quatre familles exploitables, à partir des normalisations déjà utilisées
 * par le moteur (`domaine.ts`, `sigles.ts`, `generique.ts`). Il est pur : aucune
 * base, aucun état, aucune écriture.
 *
 *   - `domaine` : un domaine est reconnaissable après normalisation ;
 *   - `sigle` : un seul jeton court en majuscules, pas un mot courant ;
 *   - `nom` : le reste (noms, phrases, casse mixte) ;
 *   - `vide` : indice absent ou blanc.
 */
import { domainFromHint } from "./domaine.js";
import { MOTS_GENERIQUES, MOTS_GENERIQUES_ENTREPRISE } from "./generique.js";
import { estMotCourant, estSigle, normaliseSigle } from "./sigles.js";

export type FamilleIndice = "domaine" | "sigle" | "nom" | "vide";

/** Forme brute d'un sigle : 2 à 6 lettres majuscules, points et espaces tolérés. */
const SIGLE_RE = /^[A-Z]{2,6}$/;

/**
 * Suffixes acceptés : ceux réellement observés dans le lot (com, org, ca, fr,
 * edu, br, us, mx, pe, au, ph, it, vn, uk, sa, pa, nl, ng, net, mz, mk, ma,
 * ke, jp, ir, in, ie, id, hk, es, ec, de, ar, ae) et les génériques courants.
 * `domainFromHint()` accepte toute étiquette alphabétique d'au moins 2 lettres
 * : sans ce filtre, un nom d'hôte interne serait classé « domaine ».
 */
const TLD_RECONNUS: ReadonlySet<string> = new Set([
	// Observés dans le lot
	"ae", "ar", "au", "br", "ca", "com", "de", "ec", "edu", "es", "fr",
	"hk", "id", "ie", "in", "ir", "it", "jp", "ke", "ma", "mk", "mx", "mz",
	"net", "ng", "nl", "org", "pa", "pe", "ph", "sa", "uk", "us", "vn",
	// Génériques courants
	"ai", "app", "biz", "blog", "cloud", "co", "dev", "digital", "eu",
	"gouv", "gov", "info", "int", "io", "me", "mil", "name", "neo", "ninja",
	"online", "pro", "shop", "site", "store", "tech", "top", "tv", "xyz",
	// Quelques ccTLD/gTLD fréquents en complément
	"at", "be", "ch", "cl", "cn", "cz", "dk", "fi", "gr", "hu", "il",
	"kr", "lu", "no", "nz", "pl", "pt", "ro", "ru", "se", "sg", "sk",
	"th", "tr", "tw", "ua", "za",
]);

/**
 * Garde-fou explicite : la liste blanche suffit déjà, mais on garde un set
 * noir pour rendre le refus lisible et éviter qu'un ajout distrait réintroduise
 * un de ces suffixes.
 *
 * `.dom` et `.internal` ne sont PAS des TLD : aucun n'est délégué dans la
 * racine DNS publique. Ce sont des suffixes de nommage local/privé (hôtes de
 * réseau interne, `.internal` étant réservé à cet usage) — `societe.dom` ou
 * `bastion.internal` désignent une machine, pas un domaine d'organisation.
 * Idem pour `.loc`, `.local`, `.test` et `.invalid`, réservés ou purement
 * fictifs.
 */
const TLD_INTERDITS: ReadonlySet<string> = new Set([
	"dom", "loc", "local", "test", "invalid", "internal",
]);

/** Vrai si le domaine normalisé se termine par un TLD public autorisé. */
function estTldAutorise(domain: string): boolean {
	const tld = domain.split(".").pop() ?? "";
	return TLD_RECONNUS.has(tld) && !TLD_INTERDITS.has(tld);
}

/**
 * Classe un indice. L'ordre est celui de la fiabilité : un domaine l'emporte
 * sur un sigle, et un mot génératif (`SNC`, `EHPAD`…) n'est pas un sigle.
 */
export function classifierIndice(hint: string): FamilleIndice {
	if (!hint || hint.trim() === "") return "vide";
	const domain = domainFromHint(hint);
	// Un suffixe non public n'est pas un domaine d'organisation : on tombe
	// directement en « nom », sans laisser la porte ouverte au cas « sigle ».
	if (domain) return estTldAutorise(domain) ? "domaine" : "nom";

	const compact = hint.trim().replace(/[.\s]+/g, "");
	if (SIGLE_RE.test(compact)) {
		const normalise = normaliseSigle(compact);
		const mot = normalise.toLowerCase();
		if (
			estSigle(normalise) &&
			!estMotCourant(normalise) &&
			!MOTS_GENERIQUES.has(mot) &&
			!MOTS_GENERIQUES_ENTREPRISE.has(mot)
		) {
			return "sigle";
		}
	}
	return "nom";
}
