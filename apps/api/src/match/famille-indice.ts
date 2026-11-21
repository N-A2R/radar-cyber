/**
 * Familles d'`org_hint` de la file de quarantaine, et rattachement des deux
 * familles qui peuvent fonder une décision : domaine et sigle.
 *
 * Le moteur de revue ne change pas : ce module découpe la file en quatre
 * familles à partir des normalisations déjà utilisées par le moteur
 * (`domaine.ts`, `sigles.ts`, `generique.ts`), puis construit les index de
 * rattachement et décide. Il est pur : aucune base, aucun état, aucune
 * écriture — les lignes du registre sont fournies par l'appelant.
 *
 *   - `domaine` : racine DNS comparée à `org.domain`, aux alias `domain` et
 *     au site ; deux organisations sur la même racine restent ambiguës ;
 *   - `sigle` : index sigle → organisations, départagé par le département
 *     ou le domaine source ; sans discriminant, le sigle reste ambigu ;
 *   - `nom` : le reste (noms, phrases, casse mixte), non rattaché ici ;
 *   - `vide` : indice absent ou blanc.
 */
import { domaineRacine } from "./domaine.js";
import { MOTS_GENERIQUES, MOTS_GENERIQUES_ENTREPRISE } from "./generique.js";
import {
	buildIndexSigles,
	decideSigle,
	desambiguiserSigles,
	estMotCourant,
	estSigle,
	normaliseSigle,
	type ContexteSigle,
	type IndexSigles,
	type LigneAliasSigle,
} from "./sigles.js";

export type FamilleIndice = "domaine" | "sigle" | "nom" | "vide";

/** Forme brute d'un sigle : 2 à 6 lettres majuscules, points et espaces tolérés. */
const SIGLE_RE = /^[A-Z]{2,6}$/;

/**
 * Suffixes acceptés : ceux réellement observés dans le lot (com, org, ca, fr,
 * edu, br, us, mx, pe, au, ph, it, vn, uk, sa, pa, nl, ng, net, mz, mk, ma,
 * ke, jp, ir, in, ie, id, hk, es, ec, de, ar, ae) et les génériques courants.
 * `domaineRacine()` accepte toute étiquette alphabétique d'au moins 2 lettres
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
	// La racine (eTLD+1) retire www., les sous-domaines, le port et le chemin :
	// `www.library.uta.edu` et `uta.edu` désignent le même domaine racine.
	const domain = domaineRacine(hint);
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

// ── Rattachement par famille ───────────────────────────────────────────

/** Organisation telle que les index de famille en ont besoin. */
export type OrgFamille = {
	id: number;
	name: string;
	domain?: string | null;
	website?: string | null;
	dept?: string | null;
	/** Alias `org_alias.source='domain'` portés par l'organisation. */
	domainAliases?: readonly string[];
};

export type SourceDomaine = "domain" | "alias" | "website";

/** Organisation porteuse d'une racine DNS. */
export type CandidatDomaine = {
	orgId: number;
	orgName: string;
	dept: string | null;
	source: SourceDomaine;
};

/** Racine eTLD+1 → organisations qui la portent. */
export type IndexDomaines = ReadonlyMap<string, readonly CandidatDomaine[]>;

/** Index des deux familles qui peuvent fonder un rattachement. */
export type IndexFamilles = {
	domaines: IndexDomaines;
	sigles: IndexSigles;
};

export type MotifFamille =
	| "domaine-racine"
	| "domaine-ambigu"
	| "domaine-inconnu"
	| "domaine-invalide"
	| "sigle-confirme"
	| "sigle-ambigu"
	| "sigle-inconnu"
	| "hors-famille";

/** Décision de rattachement : le motif explique aussi les refus. */
export type RattachementFamille = {
	accepte: boolean;
	famille: FamilleIndice;
	motif: MotifFamille;
	orgId: number | null;
	orgName: string | null;
	confidence: number;
	via: "domain" | "sigle" | null;
};

function refus(famille: FamilleIndice, motif: MotifFamille): RattachementFamille {
	return { accepte: false, famille, motif, orgId: null, orgName: null, confidence: 0, via: null };
}

/**
 * Indexe les racines des domaines, alias-domaines et sites des organisations.
 * `domaineRacine()` retire schéma, port, chemin, `www.` et sous-domaines des
 * deux côtés : `https://www.exemple.fr:8443/a` et `exemple.fr` ont la même
 * clé. Une organisation n'entre qu'une fois par racine, la source la plus
 * forte (`domain`, puis alias, puis `website`) étant conservée.
 */
export function buildIndexDomaines(orgs: readonly OrgFamille[]): IndexDomaines {
	const index = new Map<string, CandidatDomaine[]>();
	for (const org of orgs) {
		const valeurs: Array<readonly [string | null | undefined, SourceDomaine]> = [
			[org.domain, "domain"],
		];
		for (const alias of org.domainAliases ?? []) valeurs.push([alias, "alias"]);
		valeurs.push([org.website, "website"]);

		const racines = new Set<string>();
		for (const [valeur, source] of valeurs) {
			const racine = domaineRacine(valeur);
			if (!racine || racines.has(racine)) continue;
			racines.add(racine);
			let entrees = index.get(racine);
			if (!entrees) {
				entrees = [];
				index.set(racine, entrees);
			}
			if (entrees.some((e) => e.orgId === org.id)) continue;
			entrees.push({ orgId: org.id, orgName: org.name, dept: org.dept ?? null, source });
		}
	}
	return index;
}

/**
 * Rattache un indice-domaine par égalité de racine. Une racine partagée par
 * plusieurs organisations reste ambiguë, sauf si le département de la source
 * les départage ; on ne devine jamais à partir du TLD ou d'un sous-domaine.
 */
export function rattacherParDomaine(
	hint: string,
	index: IndexDomaines,
	contexte?: ContexteSigle,
): RattachementFamille {
	const famille = classifierIndice(hint);
	if (famille !== "domaine") return refus(famille, "hors-famille");
	const racine = domaineRacine(hint);
	if (!racine) return refus("domaine", "domaine-invalide");
	let candidats = index.get(racine) ?? [];
	if (candidats.length === 0) return refus("domaine", "domaine-inconnu");
	if (candidats.length > 1 && contexte?.dept) {
		const parDept = candidats.filter((c) => c.dept !== null && c.dept === contexte.dept);
		if (parDept.length > 0) candidats = parDept;
	}
	if (candidats.length > 1) return refus("domaine", "domaine-ambigu");
	const seul = candidats[0]!;
	return {
		accepte: true,
		famille: "domaine",
		motif: "domaine-racine",
		orgId: seul.orgId,
		orgName: seul.orgName,
		confidence: 0.95,
		via: "domain",
	};
}

/**
 * Contexte discriminant d'un indice : le domaine qu'il porte (ramené à sa
 * racine) et, quand la promotion en a un, le département de l'organisation
 * proposée. Sans organisation proposée, le domaine seul peut départager.
 */
export function contexteDepuisIndice(hint: string, dept?: string | null): ContexteSigle | undefined {
	const domain = domaineRacine(hint);
	if (!domain && !dept) return undefined;
	return { ...(dept ? { dept } : {}), ...(domain ? { domain } : {}) };
}

/** Décision d'un sigle : un seul candidat après discrimination, sinon refus. */
export function rattacherParSigle(
	hint: string,
	index: IndexSigles,
	contexte?: ContexteSigle,
): RattachementFamille {
	const famille = classifierIndice(hint);
	if (famille !== "sigle") return refus(famille, "hors-famille");
	const candidats = desambiguiserSigles(index.get(normaliseSigle(hint)) ?? [], contexte);
	const decision = decideSigle(hint, candidats);
	if (!decision.accepte) {
		const motif = decision.motif === "ambigu" ? "sigle-ambigu" : "sigle-inconnu";
		return refus("sigle", motif);
	}
	return {
		accepte: true,
		famille: "sigle",
		motif: "sigle-confirme",
		orgId: decision.orgId ?? null,
		orgName: decision.orgName ?? null,
		confidence: 0.7,
		via: "sigle",
	};
}

/** Construit les deux index à partir des lignes du registre. */
export function buildIndexFamilles(
	orgs: readonly OrgFamille[],
	aliasSigles: readonly LigneAliasSigle[],
): IndexFamilles {
	return { domaines: buildIndexDomaines(orgs), sigles: buildIndexSigles(aliasSigles) };
}

/** Point d'entrée unique : domaine d'abord, sigle ensuite, sinon revue. */
export function rattacherIndice(
	hint: string,
	index: IndexFamilles,
	contexte?: ContexteSigle,
): RattachementFamille {
	const famille = classifierIndice(hint);
	if (famille === "domaine") return rattacherParDomaine(hint, index.domaines, contexte);
	if (famille === "sigle") {
		return rattacherParSigle(hint, index.sigles, contexte ?? contexteDepuisIndice(hint));
	}
	return refus(famille, "hors-famille");
}
