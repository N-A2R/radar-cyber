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
	commenceParRoleEtablissement,
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
	/** Secteur éditorial : dit si l'organisation est un territoire. */
	sector: string | null;
};

export type GazetteerRow = {
	org_id: number;
	name: string;
	kind: string;
	dept: string | null;
	city: string | null;
	sector: string | null;
	alias: string;
	/** Source de la ligne d'alias : les alias d'usage posés à la main ont un traitement préférentiel. */
	source?: string | null;
};

export type Gazetteer = {
	/** clé d'alias normalisée (jetons séparés par une espace) → organisations */
	byAliasKey: Map<string, GazetteerOrg[]>;
	/** premier jeton → clés d'alias commençant par lui (index inversé) */
	aliasKeysByFirstToken: Map<string, string[]>;
	/** clés qui portent un rôle institutionnel : seules à pouvoir trancher une collectivité */
	roleKeys: Set<string>;
	/**
	 * Clés qui désignent un lieu et non une organisation : nom de commune, de
	 * département, de région ou d'intercommunalité, sans rôle de tête.
	 * « Sauveterre-de-Béarn » et « Pays Basque » en font partie : un article qui
	 * les cite parle d'un endroit, pas d'une victime.
	 */
	lieuKeys: Set<string>;
	/** jetons de rôle, pour la porte d'admission */
	roleTokens: Set<string>;
	/** premiers jetons de noms de lieux : ne suffisent pas à désigner une organisation */
	lieuTokens: Set<string>;
	maxTokens: number;
	/** jetons de tous les noms d'organisation → ids (porte d'admission) */
	orgsByToken: Map<string, Set<number>>;
	/** organisations par id, pour rendre un résultat lisible */
	orgsById: Map<number, GazetteerOrg>;
	/**
	 * alias → organisations désignées par un alias d'usage posé à la main
	 * (`annuaire-entreprises`). À l'échelle du stock SIRENE, une enseigne
	 * (« hyper u ») frappe des dizaines d'unités légales ; l'alias d'usage est
	 * la seule lecture qui dit ce que le texte désigne — le réseau, pas une
	 * coopérative parmi quarante-huit.
	 */
	curatedOrgsByAliasKey: Map<string, Set<number>>;
};

export type MatchReason =
	| "alias-role"
	| "alias-distinctif"
	| "alias-usage"
	| "departement"
	| "commune"
	| "lieu-contredit"
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

/** Secteurs territoriaux : leur nom est un lieu, pas une organisation. */
const TERRITOIRES = new Set<string>(["commune", "epci", "departement", "region"]);

/**
 * Sources d'alias posés à la main par un analyste : ils disent un usage
 * (« Intermarché » désigne le réseau), pas un nom légal. À l'échelle du stock
 * SIRENE, ce sont eux qui désignent quand l'enseigne devient ambiguë.
 */
const SOURCES_ALIAS_USAGE = new Set<string>(["annuaire-entreprises"]);

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
	const lieuKeys = new Set<string>();
	const lieuTokens = new Set<string>();
	const roleTokens = new Set<string>();
	const orgsByToken = new Map<string, Set<number>>();
	const orgsById = new Map<number, GazetteerOrg>();
	const curatedOrgsByAliasKey = new Map<string, Set<number>>();
	let maxTokens = 1;

	for (const row of rows) {
		const org: GazetteerOrg = {
			id: row.org_id,
			name: row.name,
			kind: row.kind,
			dept: row.dept,
			city: row.city,
			sector: row.sector,
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

		// Seul un rôle d'établissement peut trancher. « Département de la Gironde »
		// reste un indice, jamais une preuve : c'est de la géographie.
		const role = commenceParRoleEtablissement(jetons);
		const lieu = nomDeLieu(jetons);
		// Un alias d'un seul jeton sans rôle est un nom de lieu, pas une
		// organisation : il n'entre pas dans l'index de décision.
		if (!role && lieu.split(" ").length < 2) continue;

		// Garde anti-toponyme : un alias qui est exactement le nom d'un
		// département désigne le département, jamais l'organisation qui le
		// porte dans son nom légal. Sans cette garde, l'alias distinctif
		// « pyrenees atlantiques » d'une association colombophile rattachait
		// tout texte citant le département (constaté sur la mesure du 15
		// novembre 2026, incident ERNAT).
		if (!role && CLES_DEPARTEMENTS.has(cle)) continue;

		// Un alias composé uniquement de mots génériques ne vaut pas mieux.
		const porteurs = jetons.filter((j) => !GENERIQUES.has(j) && j.length > 2);
		if (porteurs.length === 0) continue;

		// Confiance par source : les alias auto-dérivés du stock (`sirene-nom`)
		// ne désignent qu'avec au moins deux mots propres. Une organisation
		// baptisée « A CE JOUR » rattachait sinon tout texte contenant la
		// phrase — constaté sur la mesure du 15 novembre 2026 (incident ERNAT).
		// Les alias posés ou établis (usage, enseigne, usuelle) gardent la
		// règle ordinaire : un seul mot propre suffit.
		if (row.source === "sirene-nom" && !role && porteurs.length < 2) continue;

		// Un territoire n'est pas une organisation. Le secteur vient des données :
		// commune, EPCI, département, région. Sans rôle de tête (« ville de »,
		// « mairie de »), son nom est celui d'un lieu — il reste consultable,
		// mais il ne tranche aucun rattachement.
		const territoire = TERRITOIRES.has(row.sector ?? "");
		// Le rôle se lit sur le nom **légal** de l'organisation, pas sur l'alias.
		// « Département de la Gironde » est un territoire dont le nom porte un
		// rôle ; une entreprise dont l'alias est « Société X » n'en est pas un.
		const roleLieu = role && TERRITOIRES.has(row.sector ?? "");
		if (territoire && !roleLieu) {
			lieuKeys.add(cle);
			lieuTokens.add(jetons[0] as string);
			continue;
		}

		if (roleLieu) {
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
		// L'alias d'usage se souvient des organisations qu'il désigne : c'est
		// lui qui tranche quand l'enseigne est devenue ambiguë au stock.
		if (SOURCES_ALIAS_USAGE.has(row.source ?? "")) {
			const set = curatedOrgsByAliasKey.get(cle) ?? new Set<number>();
			set.add(org.id);
			curatedOrgsByAliasKey.set(cle, set);
		}
		if (jetons.length > maxTokens) maxTokens = jetons.length;
	}

	return {
		byAliasKey,
		aliasKeysByFirstToken,
		roleKeys,
		lieuKeys,
		lieuTokens,
		roleTokens,
		maxTokens,
		orgsByToken,
		orgsById,
		curatedOrgsByAliasKey,
	};
}

/** Tous les alias qui apparaissent dans `jetons`, en gardant le plus long par position. */
type Frappe = { cle: string; orgs: GazetteerOrg[]; taille: number };

/**
 * Particules qui ne portent aucun sens et ne servent qu'à joindre.
 *
 * « SDIS LANDES » est au référentiel ; la presse écrit « SDIS des Landes ».
 * Sans cette liste, la fenêtre de jetons était « sdis des landes » et ne
 * frappait jamais l'alias « sdis landes » — un incident régional parfaitement
 * identifiable restait donc non rattaché.
 */
const PARTICULES: Record<string, true> = {
	de: true, des: true, du: true, la: true, le: true, les: true, l: true,
	d: true, et: true, en: true, sur: true, aux: true, au: true,
};

function aliasFrappes(gaz: Gazetteer, jetons: readonly string[]): Frappe[] {
	const frappes: Frappe[] = [];
	for (let debut = 0; debut < jetons.length; debut++) {
		if (!gaz.aliasKeysByFirstToken.get(jetons[debut] as string)) continue;
		// Deux familles de fenêtres, essayées de la plus longue à la plus courte :
		//  1. contiguës — comportement historique, indispensable car les alias du
		//     référentiel contiennent eux-mêmes des particules (« Ville de Tarnos ») ;
		//  2. sans particules — « SDIS des Landes » doit frapper « SDIS LANDES ».
		const candidats: { cle: string; taille: number }[] = [];
		const vues = new Set<string>();
		const ajouter = (jetonsFenetre: readonly string[]) => {
			if (jetonsFenetre.length === 0) return;
			const cle = jetonsFenetre.join(" ");
			if (vues.has(cle)) return;
			vues.add(cle);
			candidats.push({ cle, taille: jetonsFenetre.length });
		};
		const max = Math.min(gaz.maxTokens, jetons.length - debut);
		for (let taille = max; taille >= 1; taille--) {
			ajouter(jetons.slice(debut, debut + taille));
		}
		const sansParticules: string[] = [];
		for (let i = debut; i < jetons.length && sansParticules.length < gaz.maxTokens; i++) {
			const jeton = jetons[i] as string;
			if (PARTICULES[jeton] === true) continue;
			sansParticules.push(jeton);
			ajouter([...sansParticules]);
		}
		// La plus longue d'abord : un alias plus court au même endroit serait
		// moins spécifique.
		candidats.sort((a, b) => b.taille - a.taille);
		for (const c of candidats) {
			const orgs = gaz.byAliasKey.get(c.cle);
			if (!orgs) continue;
			frappes.push({ cle: c.cle, orgs, taille: c.taille });
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

/** Les clés d'alias qui sont des noms de département (normalisés, tirets → espaces). */
const CLES_DEPARTEMENTS: ReadonlySet<string> = new Set(
	Object.keys(DEPARTEMENTS).map((k) => k.replace(/-/g, " ")),
);

/**
 * Le texte place-t-il l'organisation hors de chez elle ?
 *
 * Le savoir géographique vient des données : un département ou une ville
 * étrangère citée juste après le nom de l'organisation, alors que ce n'est ni
 * son département ni sa commune. Formulation volontairement étroite — on ne
 * écarte que ce qui est explicitement situé ailleurs.
 */
const LIEUX_ETRANGERS = [
	"ohio", "senegal", "canada", "belgique", "suisse", "luxembourg", "espagne",
	"allemagne", "italie", "royaume uni", "etats unis", "usa", "chine", "japon",
	"maroc", "tunisie", "algerie", "quebec", "etats unis d amerique",
];

function contreditLeLieu(org: GazetteerOrg, jetons: readonly string[], alias: string): boolean {
	const texte = jetons.join(" ");
	// Position de l'alias qui a fait la correspondance : c'est là qu'est le nom.
	const motsAlias = normaliser(alias);
	if (motsAlias.length === 0) return false;
	let position = -1;
	for (let i = 0; i + motsAlias.length <= jetons.length; i++) {
		if (jetons.slice(i, i + motsAlias.length).join(" ") === motsAlias.join(" ")) {
			position = i;
			break;
		}
	}
	if (position < 0) return false;
	for (const lieu of LIEUX_ETRANGERS) {
		const dansTexte = texte.includes(lieu);
		if (!dansTexte) continue;
		// Le lieu doit suivre ou précéder immédiatement le nom, dans une fenêtre
		// courte. Une mention à l'autre bout du paragraphe ne dit rien.
		const iLieu = jetons.findIndex((j) => lieu.split(" ").includes(j));
		if (iLieu < 0) continue;
		const distance = Math.abs(iLieu - (position + motsAlias.length - 1));
		if (distance <= 3) return true;
	}
	return false;
}

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

	// Une seule organisation, mais le texte la situe ailleurs : « la ville de
	// Bordeaux (Ohio) », « l'université de Bordeaux au Sénégal ». Le nom coïncide,
	// le lieu contredit. On s'abstient — c'est le prix de « rien de faux ».
	if (parOrg.size === 1 && retenues.length > 0) {
		const orgId = [...parOrg.keys()][0] as number;
		const seule = gaz.orgsById.get(orgId) ?? null;
		const frappe = parOrg.get(orgId) as Frappe;
		if (seule && contreditLeLieu(seule, jetons, frappe.cle)) {
			return { org: null, reason: "lieu-contredit", alias: null, confidence: 0, tied: [] };
		}
	}

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

	// Trois indices de départage, dans cet ordre : le département cité, la
	// commune citée, puis l'alias d'usage. « EHPAD Résidence du Parc » existe
	// dans quatre communes ; le texte qui dit « à Champdeniers » tranche sans
	// ambiguïté. Et quand l'enseigne est devenue ambiguë au stock (« hyper u »
	// frappe 49 unités légales), l'alias d'usage posé à la main désigne le
	// réseau — c'est la lecture que le texte entend.
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

	if (departage.length === 0) {
		for (const frappe of retenues) {
			const cures = gaz.curatedOrgsByAliasKey.get(frappe.cle);
			if (!cures) continue;
			const citesDansTexte = [...parOrg.keys()].filter((id) => cures.has(id));
			if (citesDansTexte.length === 1) {
				departage = [
					{ org: gaz.orgsById.get(citesDansTexte[0] as number) as GazetteerOrg, frappe },
				];
				motif = "alias-usage";
				break;
			}
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
	const role = commenceParRoleEtablissement(aliasJetons);
	const porteurs = aliasJetons.filter((j) => !GENERIQUES.has(j) && j.length > 2);
	if (!role && porteurs.length === 0) {
		return { ...resultat, org: null, reason: "ambiant" };
	}
	return resultat;
}
