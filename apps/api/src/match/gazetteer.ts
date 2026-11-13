/**
 * Gazetteer : le moteur de rattachement de l'ingestion.
 *
 * Remplace deux implémentations qui faisaient la même chose en moins bien :
 *  - `relevance.matchOrgForTextFromList`, qui comptait les jetons communs avec
 *    le `name` de **toutes** les organisations et exigeait un candidat unique
 *    dans la table entière. Sur 34 330 organisations, il ne rattachait plus
 *    qu'un incident sur quinze — chaque phrase ressemble au nom de quelqu'un ;
 *  - le parcours des alias de `match/core.ts`, qui trouvait 12/15 mais se
 *    trompait 4 fois, parce qu'un mot de lieu (« Bordeaux », « Gironde »)
 *    suffisait à trancher.
 *
 * Ce que ce module change, en trois règles :
 *
 *  1. **Index inversé par premier jeton.** On ne parcourt plus 34 330 noms par
 *     texte : on ne regarde que les alias qui commencent par un mot réellement
 *     présent. Le coût devient proportionnel au texte, pas à la table.
 *
 *  2. **Un nom de lieu ne tranche pas.** « Bordeaux » est un alias de la
 *     commune, d'une école et de plusieurs entreprises : il ne décide rien.
 *     Seul un alias portant un **rôle** (« ville de Tarnos », « mairie de
 *     Marennes ») ou un nom **distinctif** (deux jetons et un mot propre)
 *     désigne une organisation.
 *
 *  3. **L'ambiguïté se départage sur des indices, jamais au hasard** — un
 *     département cité, un type précis, une longueur d'alias plus grande — et
 *     quand rien ne départage, on rend `null` en gardant les candidats pour la
 *     revue. On préfère manquer un rattachement que d'en inventer un.
 */
import {
	commenceParUnRole,
	MOTS_GENERIQUES,
	MOTS_GENERIQUES_ENTREPRISE,
	MOTS_ROLE,
	nomDeLieu,
} from "./generique.js";

export type GazetteerOrg = {
	id: number;
	name: string;
	kind: string;
	dept: string | null;
	/** Commune du siège : départage deux établissements homonymes. */
	city: string | null;
};

export type GazetteerRow = {
	org_id: number;
	name: string;
	kind: string;
	dept: string | null;
	city: string | null;
	alias: string;
};

export type Gazetteer = {
	/** clé d'alias normalisée (jetons séparés par une espace) → organisations */
	byAliasKey: Map<string, GazetteerOrg[]>;
	/** premier jeton → clés d'alias commençant par lui (index inversé) */
	aliasKeysByFirstToken: Map<string, string[]>;
	/** clés qui portent un rôle institutionnel : seules à pouvoir trancher une collectivité */
	roleKeys: Set<string>;
	/** jetons de rôle, pour la porte d'admission */
	roleTokens: Set<string>;
	maxTokens: number;
	/** jetons de tous les noms d'organisation → ids (porte d'admission) */
	orgsByToken: Map<string, Set<number>>;
	/** organisations par id, pour rendre un résultat lisible */
	orgsById: Map<number, GazetteerOrg>;
};

export type MatchReason =
	| "alias-role"
	| "alias-distinctif"
	| "departement"
	| "commune"
	| "ambigu"
	| "ambiant"
	| "aucun";

export type GazetteerMatch = {
	org: GazetteerOrg | null;
	reason: MatchReason;
	alias: string | null;
	confidence: number;
	/** Candidats à égalité de force, quand le texte ne tranche pas. */
	tied: GazetteerOrg[];
};

/** En deçà, un alias n'est pas une preuve. Aligné sur `core.MIN_ALIAS_LENGTH`. */
const MIN_KEY_LENGTH = 4;

/** Normalisation alignée sur `match/core.ts` : mêmes jetons des deux côtés. */
export function normaliser(texte: string): string[] {
	const propre = texte
		.replace(/œ/g, "oe")
		.replace(/Œ/g, "OE")
		.replace(/æ/g, "ae")
		.replace(/Æ/g, "AE")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
	return propre === "" ? [] : propre.split(" ");
}

const GENERIQUES = new Set<string>([...MOTS_GENERIQUES, ...MOTS_GENERIQUES_ENTREPRISE]);
const jeuMotsGeneriques = new Set<string>([...MOTS_GENERIQUES, ...MOTS_GENERIQUES_ENTREPRISE]);

/**
 * Longueur maximale d'un alias indexé. Au-delà de six jetons, un alias est en
 * pratique unique dans la table : l'indexer ne sert à rien et coûte des
 * recherches par position. Les noms plus longs restent cherchables en base.
 */
const MAX_ALIAS_TOKENS = 6;

/**
 * Construit le gazetteer depuis les lignes `org` + `org_alias` actives.
 *
 * Les alias génériques (« école primaire », « pharmacie du centre ») sont
 * volontairement **exclus de l'index de décision** : ils servent de signal à la
 * porte d'admission, jamais de preuve de rattachement.
 */
export function buildGazetteer(rows: readonly GazetteerRow[]): Gazetteer {
	const byAliasKey = new Map<string, GazetteerOrg[]>();
	const aliasKeysByFirstToken = new Map<string, string[]>();
	const roleKeys = new Set<string>();
	const roleTokens = new Set<string>();
	const orgsByToken = new Map<string, Set<number>>();
	const orgsById = new Map<number, GazetteerOrg>();
	let maxTokens = 1;

	for (const row of rows) {
		const org: GazetteerOrg = {
			id: row.org_id,
			name: row.name,
			kind: row.kind,
			dept: row.dept,
			city: row.city,
		};
		orgsById.set(org.id, org);

		// --- porte d'admission : tous les jetons des noms, sans exception -----
		for (const jeton of new Set(normaliser(row.name))) {
			if (jeton.length < 3) continue;
			const set = orgsByToken.get(jeton) ?? new Set<number>();
			set.add(row.org_id);
			orgsByToken.set(jeton, set);
		}

		// --- décision : alias indexés ----------------------------------------
		const jetons = normaliser(row.alias);
		if (jetons.length === 0) continue;
		const cle = jetons.join(" ");
		if (cle.length < MIN_KEY_LENGTH) continue;
		if (jetons.length > MAX_ALIAS_TOKENS) continue;

		const role = commenceParUnRole(jetons);
		const lieu = nomDeLieu(jetons);
		// Un alias d'un seul jeton sans rôle est un nom de lieu, pas une
		// organisation : il n'entre pas dans l'index de décision.
		if (!role && lieu.split(" ").length < 2) continue;

		// Un alias composé uniquement de mots génériques ne vaut pas mieux.
		const porteurs = jetons.filter((j) => !GENERIQUES.has(j) && j.length > 2);
		if (porteurs.length === 0) continue;

		if (role) {
			roleKeys.add(cle);
			// Les jetons du rôle lui-même (« ville », « mairie ») servent à la
			// porte : un texte qui les emploie parle d'une organisation.
			for (const jeton of jetons) {
				if (jeuMotsGeneriques.has(jeton) && MOTS_ROLE.includes(jeton)) roleTokens.add(jeton);
			}
		}

		const bucket = byAliasKey.get(cle);
		if (bucket) {
			if (!bucket.some((o) => o.id === org.id)) bucket.push(org);
		} else {
			byAliasKey.set(cle, [org]);
			const premier = jetons[0] as string;
			const cles = aliasKeysByFirstToken.get(premier) ?? [];
			cles.push(cle);
			aliasKeysByFirstToken.set(premier, cles);
		}
		if (jetons.length > maxTokens) maxTokens = jetons.length;
	}

	return { byAliasKey, aliasKeysByFirstToken, roleKeys, roleTokens, maxTokens, orgsByToken, orgsById };
}

/** Tous les alias qui apparaissent dans `jetons`, en gardant le plus long par position. */
type Frappe = { cle: string; orgs: GazetteerOrg[]; taille: number };

function aliasFrappes(gaz: Gazetteer, jetons: readonly string[]): Frappe[] {
	const frappes: Frappe[] = [];
	for (let debut = 0; debut < jetons.length; debut++) {
		const cles = gaz.aliasKeysByFirstToken.get(jetons[debut] as string);
		if (!cles) continue;
		// À une position donnée, on ne garde que l'alias le plus long : s'il en
		// existait un plus court au même endroit, il serait moins spécifique.
		const tailles: number[] = [];
		for (let taille = Math.min(gaz.maxTokens, jetons.length - debut); taille >= 1; taille--) {
			tailles.push(taille);
		}
		for (const taille of tailles) {
			const cle = jetons.slice(debut, debut + taille).join(" ");
			const orgs = gaz.byAliasKey.get(cle);
			if (!orgs) continue;
			frappes.push({ cle, orgs, taille });
			break;
		}
	}
	return frappes;
}

/** Départements de Nouvelle-Aquitaine, pour départager deux homonymes. */
const DEPARTEMENTS: Readonly<Record<string, string>> = {
	charente: "16",
	"charente-maritime": "17",
	correze: "19",
	creuse: "23",
	dordogne: "24",
	gironde: "33",
	landes: "40",
	"lot-et-garonne": "47",
	"pyrenees-atlantiques": "64",
	vienne: "86",
	"haute-vienne": "87",
	"deux-sevres": "79",
};

function departementsCites(jetons: readonly string[]): Set<string> {
	const cites = new Set<string>();
	const texte = jetons.join(" ");
	for (const [nom, code] of Object.entries(DEPARTEMENTS)) {
		if (texte.includes(nom)) cites.add(code);
	}
	return cites;
}

/**
 * Cherche l'organisation nommée dans `texte`.
 *
 * Ne consulte que les alias commençant par un mot du texte : le coût dépend de
 * la phrase, jamais de la taille du référentiel.
 */
export function resoudre(gaz: Gazetteer, texte: string): GazetteerMatch {
	const jetons = normaliser(texte);
	if (jetons.length === 0) {
		return { org: null, reason: "aucun", alias: null, confidence: 0, tied: [] };
	}

	const frappes = aliasFrappes(gaz, jetons);
	if (frappes.length === 0) {
		return { org: null, reason: "aucun", alias: null, confidence: 0, tied: [] };
	}

	// Un alias portant un rôle (« ville de Tarnos ») l'emporte sur un nom propre
	// seul : c'est le texte lui-même qui dit qu'il s'agit de la collectivité.
	const avecRole = frappes.filter((f) => gaz.roleKeys.has(f.cle));
	const retenues = avecRole.length > 0 ? avecRole : frappes;

	// Une même organisation peut être atteinte par plusieurs alias ; on ne garde
	// que la meilleure frappe par organisation (l'alias le plus long).
	const parOrg = new Map<number, Frappe>();
	for (const frappe of retenues) {
		for (const org of frappe.orgs) {
			const deja = parOrg.get(org.id);
			if (!deja || frappe.taille > deja.taille) parOrg.set(org.id, frappe);
		}
	}

	// Une seule organisation : c'est elle.
	if (parOrg.size === 1 && retenues.length > 0) {
		const orgId = [...parOrg.keys()][0] as number;
		const org = gaz.orgsById.get(orgId) ?? null;
		const frappe = parOrg.get(orgId) as Frappe;
		const role = gaz.roleKeys.has(frappe.cle);
		return {
			org,
			reason: role ? "alias-role" : "alias-distinctif",
			alias: frappe.cle,
			// Un alias distinctif de deux jetons est déjà une preuve : les noms de
			// lieu nus sont écartés de l'index, donc il s'agit d'un nom propre.
			confidence: role ? 0.95 : frappe.taille >= 2 ? 0.9 : 0.75,
			tied: [],
		};
	}

	// Plusieurs organisations : on départage sur des indices explicites.
	const cites = departementsCites(jetons);
	const candidats = [...parOrg.entries()].map(([id, frappe]) => ({
		org: gaz.orgsById.get(id) as GazetteerOrg,
		frappe,
	}));

	// Deux indices de départage, dans cet ordre : le département cité, puis la
	// commune citée. « EHPAD Résidence du Parc » existe dans quatre communes ;
	// le texte qui dit « à Champdeniers » tranche sans ambiguïté.
	const parDepartement = candidats.filter((c) => c.org.dept !== null && cites.has(c.org.dept));
	let departage = parDepartement.length === 1 ? parDepartement : [];
	let motif: MatchReason = "departement";

	if (departage.length === 0) {
		const texteJeton = new Set(jetons);
		const parCommune = candidats.filter((c) => {
			if (!c.org.city) return false;
			const mairie = normaliser(c.org.city);
			return mairie.length > 0 && mairie.every((j) => texteJeton.has(j));
		});
		if (parCommune.length === 1) {
			departage = parCommune;
			motif = "commune";
		}
	}

	const pool = departage.length > 0 ? departage : candidats;
	// Un alias plus long est plus spécifique : « commune de tarnos » bat « tarnos ».
	const plusLong = Math.max(...pool.map((c) => c.frappe.taille));
	const meilleurs = pool.filter((c) => c.frappe.taille === plusLong);

	if (meilleurs.length === 1) {
		const seul = meilleurs[0] as (typeof meilleurs)[number];
		return {
			org: seul.org,
			reason: departage.length > 0 ? motif : "alias-distinctif",
			alias: seul.frappe.cle,
			confidence: departage.length > 0 ? 0.85 : 0.8,
			tied: [],
		};
	}

	return {
		org: null,
		reason: "ambigu",
		alias: (meilleurs[0] as (typeof meilleurs)[number]).frappe.cle,
		confidence: 0,
		tied: meilleurs.map((c) => c.org),
	};
}

/**
 * Le texte désigne-t-il une organisation **nommée**, au sens où cela justifie
 * d'ingérer un article qui ne parle pas de cyber ?
 *
 * Un toponyme seul (« Aujourd'hui à Bordeaux ») ne suffit pas : c'est ce qui
 * faisait entrer en base les articles de la vie locale dès que le référentiel a
 * contenu des écoles et des pharmacies. Il faut un rôle explicite ou un nom
 * distinctif.
 */
export function designateUneOrganisation(gaz: Gazetteer, texte: string): GazetteerMatch {
	const resultat = resoudre(gaz, texte);
	if (resultat.org === null) {
		if (resultat.reason !== "ambigu") return resultat;
		// Une ambiguïté sur un nom distinctif reste un signal d'organisation :
		// deux entreprises homonymes, c'est toujours deux entreprises.
		return resultat;
	}
	// Un nom de lieu nu n'est pas une organisation nommée : on vérifie que
	// l'alias retenu n'est pas un simple toponyme.
	const alias = resultat.alias ?? "";
	const aliasJetons = alias.split(" ");
	const role = commenceParUnRole(aliasJetons);
	const porteurs = aliasJetons.filter((j) => !GENERIQUES.has(j) && j.length > 2);
	if (!role && porteurs.length === 0) {
		return { ...resultat, org: null, reason: "ambiant" };
	}
	return resultat;
}
