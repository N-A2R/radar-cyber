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
	MOTS_GENERIQUES,
	MOTS_GENERIQUES_ENTREPRISE,
	MOTS_ROLE,
} from "./generique.js";
import { CarteIndexee, CarteLectureSeule, CartePremiersJetons, construireIndex, construireIndexTrie } from "./index-compact.js";

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
	/**
	 * Clé d'alias déjà normalisée, matérialisée par `org_alias.nom_normalise`.
	 * Absente des lignes fabriquées en mémoire (tests, bench) : dans ce cas
	 * seulement, `jetonsAlias` la recalcule.
	 */
	nom_normalise?: string | null;
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

/**
 * Organisations rangées par colonnes typées. Avec 1,6 M d'organisations, un
 * objet par ligne doublé d'une entrée de `Map` coûte plusieurs centaines de
 * Mo : on ne fabrique l'objet public qu'à la première consultation de l'id.
 */
class OrgCompactes extends CarteLectureSeule<number, GazetteerOrg> {
	private readonly positions = new Map<number, number>();
	private readonly ids: number[] = [];
	private readonly noms: string[] = [];
	private readonly kinds: string[] = [];
	private readonly depts: (string | null)[] = [];
	private readonly cities: (string | null)[] = [];
	private readonly sectors: (string | null)[] = [];
	private readonly orgs: (GazetteerOrg | undefined)[] = [];

	get size(): number {
		return this.ids.length;
	}

	/** La dernière ligne portant un id fournit ses champs, comme autrefois. */
	ajouter(row: GazetteerRow): void {
		let slot = this.positions.get(row.org_id);
		if (slot === undefined) {
			slot = this.ids.length;
			this.positions.set(row.org_id, slot);
			this.ids.push(row.org_id);
			this.orgs.push(undefined);
		}
		this.noms[slot] = row.name;
		this.kinds[slot] = row.kind;
		this.depts[slot] = row.dept;
		this.cities[slot] = row.city;
		this.sectors[slot] = row.sector;
	}

	get(id: number): GazetteerOrg | undefined {
		const slot = this.positions.get(id);
		if (slot === undefined) return undefined;
		let org = this.orgs[slot];
		if (!org) {
			org = {
				id,
				name: this.noms[slot] as string,
				kind: this.kinds[slot] as string,
				dept: this.depts[slot] ?? null,
				city: this.cities[slot] ?? null,
				sector: this.sectors[slot] ?? null,
			};
			this.orgs[slot] = org;
		}
		return org;
	}

	has(id: number): boolean {
		return this.positions.has(id);
	}

	*entries(): MapIterator<[number, GazetteerOrg]> {
		for (let slot = 0; slot < this.ids.length; slot++) {
			const id = this.ids[slot] as number;
			yield [id, this.get(id) as GazetteerOrg];
		}
	}

	*keys(): MapIterator<number> {
		yield* this.ids;
	}

	*values(): MapIterator<GazetteerOrg> {
		for (let slot = 0; slot < this.ids.length; slot++) {
			yield this.get(this.ids[slot] as number) as GazetteerOrg;
		}
	}
}

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

/**
 * Table de normalisation des caractères Latin-1 vers l'alphabet ASCII.
 * 0 = séparateur. Les ligatures (œ, æ) et les caractères au-delà de 255
 * passent par la voie lente, qui reproduit exactement `match/core.ts`.
 */
const TABLE_JETONS = new Uint8Array(256);
for (let c = 48; c <= 57; c++) TABLE_JETONS[c] = c;
for (let c = 65; c <= 90; c++) TABLE_JETONS[c] = c + 32;
for (let c = 97; c <= 122; c++) TABLE_JETONS[c] = c;
for (const [debut, fin, lettre] of [
	[192, 197, 97], [199, 199, 99], [200, 203, 101], [204, 207, 105],
	[209, 209, 110], [210, 214, 111], [217, 220, 117], [221, 221, 121],
	[224, 229, 97], [231, 231, 99], [232, 235, 101], [236, 239, 105],
	[241, 241, 110], [242, 246, 111], [249, 252, 117], [253, 253, 121],
	[255, 255, 121],
] as const) {
	for (let c = debut; c <= fin; c++) TABLE_JETONS[c] = lettre;
}

/** Voie lente, réservée aux ligatures et aux caractères hors Latin-1. */
function normaliserUnicode(texte: string): string[] {
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

/** Normalisation alignée sur `match/core.ts` : mêmes jetons des deux côtés. */
export function normaliser(texte: string): string[] {
	const jetons: string[] = [];
	let jeton = "";
	for (let i = 0; i < texte.length; i++) {
		const code = texte.charCodeAt(i) as number;
		if (code >= 256 || code === 198 || code === 230 || code === 338 || code === 339) {
			return normaliserUnicode(texte);
		}
		const lettre = TABLE_JETONS[code] as number;
		if (lettre !== 0) jeton += String.fromCharCode(lettre);
		else if (jeton !== "") {
			jetons.push(jeton);
			jeton = "";
		}
	}
	if (jeton !== "") jetons.push(jeton);
	return jetons;
}

/** Nombre de jetons après les particules et les mots de rôle de tête. */
function nbJetonsLieu(jetons: readonly string[]): number {
	let debut = 0;
	while (debut < jetons.length) {
		const jeton = jetons[debut] as string;
		if (jeton === "de" || jeton === "du" || jeton === "des" || jeton === "d"
			|| jeton === "la" || jeton === "le" || jeton === "les" || jeton === "l"
			|| MOTS_ROLE.includes(jeton)) {
			debut++;
			continue;
		}
		break;
	}
	return jetons.length - debut;
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
	const orgs = new OrgCompactes();
	const roleKeys = new Set<string>();
	const lieuKeys = new Set<string>();
	const lieuTokens = new Set<string>();
	const roleTokens = new Set<string>();

	// Une seule passe sur les lignes : la clé d'alias, les jetons du nom et
	// les faits de décision sont calculés une fois. Les jugements qui portent
	// sur l'ensemble (ambiguïté, territoire) sont appliqués ensuite sur des
	// tableaux typés, pas en parcourant de nouveau les objets PG.
	const F_ROLE = 1;
	const F_LIEU_MULTI = 2;
	const F_SOURCE_NOMMEUSE = 4;
	const F_COLLECTIVITE = 8;
	const F_SIRENE_NOM = 16;
	const F_TERRITOIRE = 32;
	const F_DEPARTEMENT = 64;
	const F_CURE = 128;

	const premierIdParCle = new Map<string, number>();
	const clesAmbigues = new Set<string>();
	const clesTerritoire = new Set<string>();
	// Paires (clé, id) en ordre d'apparition : triées et compactées une seule
	// fois en fin de construction, elles évitent une Map et un tableau par clé.
	const aliasCles: string[] = [];
	const aliasIds: number[] = [];
	const aliasFlags = new Uint8Array(rows.length);
	const aliasPorteurs = new Uint8Array(rows.length);
	const aliasNbJetons = new Uint8Array(rows.length);
	// Les jetons de noms sont bien plus nombreux que les alias : un bucket par
	// jeton distinct évite de trier des millions de paires pour si peu de clés.
	const orgsParToken = new Map<string, number[]>();
	const cureCles: string[] = [];
	const cureIds: number[] = [];

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i] as GazetteerRow;
		orgs.ajouter(row);

		// La clé d'alias est calculée une fois. Dans 92 % des lignes du stock,
		// l'alias est le nom légal : ses jetons servent aussi à la porte
		// d'admission, sans refaire la normalisation du nom.
		let cle: string;
		let jetonsAlias: string[] | null = null;
		if (row.nom_normalise != null) {
			cle = row.nom_normalise === "" ? "" : row.nom_normalise.split(" ").join(" ");
		} else {
			jetonsAlias = normaliser(row.alias);
			cle = jetonsAlias.join(" ");
		}
		// --- porte d'admission : tous les jetons des noms, sans exception -----
		const jetonsNom = row.alias === row.name && jetonsAlias !== null
			? jetonsAlias
			: normaliser(row.name);
		for (const jeton of jetonsNom) {
			if (jeton.length < 3) continue;
			const bucket = orgsParToken.get(jeton);
			if (bucket) bucket.push(row.org_id);
			else orgsParToken.set(jeton, [row.org_id]);
		}

		if (cle === "") continue;
		// Un id témoin suffit : on ne retient que le caractère ambigu de la clé.
		const premier = premierIdParCle.get(cle);
		if (premier === undefined) premierIdParCle.set(cle, row.org_id);
		else if (premier !== row.org_id) clesAmbigues.add(cle);
		const territoire = TERRITOIRES.has(row.sector ?? "");
		if (territoire) clesTerritoire.add(cle);

		// --- décision : alias indexés ----------------------------------------
		if (cle.length < MIN_KEY_LENGTH) continue;
		const jetons = jetonsAlias ?? cle.split(" ");
		if (jetons.length > MAX_ALIAS_TOKENS) continue;

		let flags = 0;
		// Seul un rôle d'établissement peut trancher. « Département de la
		// Gironde » reste un indice, jamais une preuve : c'est de la géographie.
		const role = commenceParRoleEtablissement(jetons);
		if (role) flags |= F_ROLE;
		if (nbJetonsLieu(jetons) >= 2) flags |= F_LIEU_MULTI;
		// Seule une source qui *nomme* l'organisation peut trancher sur un mot
		// seul : alias posés à la main (`usage`) ou annuaire officiel des
		// entreprises. Les alias dérivés en masse sont des fragments de raison
		// sociale — « clair », « personnelles » sont uniques dans l'index et
		// pourtant des mots ordinaires : mesuré le 2026-11-17, ils ont fabriqué
		// trois faux positifs d'un coup.
		if (row.source === "usage" || row.source === "annuaire-entreprises") flags |= F_SOURCE_NOMMEUSE;
		if (row.kind === "collectivite") flags |= F_COLLECTIVITE;
		if (row.source === "sirene-nom") flags |= F_SIRENE_NOM;
		if (territoire) flags |= F_TERRITOIRE;
		// Garde anti-toponyme : « pyrenees atlantiques » d'une association
		// colombophile rattachait tout texte citant le département (ERNAT, 15/11).
		if (CLES_DEPARTEMENTS.has(cle)) flags |= F_DEPARTEMENT;
		if (SOURCES_ALIAS_USAGE.has(row.source ?? "")) flags |= F_CURE;
		// Un alias composé uniquement de mots génériques ne vaut pas mieux.
		let porteurs = 0;
		for (const jeton of jetons) {
			if (!GENERIQUES.has(jeton) && jeton.length > 2) porteurs++;
		}

		const slot = aliasCles.length;
		aliasCles.push(cle);
		aliasIds.push(row.org_id);
		aliasFlags[slot] = flags;
		aliasPorteurs[slot] = porteurs;
		aliasNbJetons[slot] = jetons.length;
	}

	// Les deux jugements d'ensemble sont connus : on filtre les paires en
	// place, sans toucher aux lignes, puis on compacte les tableaux.
	let maxTokens = 1;
	let ecriture = 0;
	for (let i = 0; i < aliasCles.length; i++) {
		const cle = aliasCles[i] as string;
		const flags = aliasFlags[i] as number;
		const role = (flags & F_ROLE) !== 0;
		// Un alias d'un seul jeton sans rôle est un nom de lieu, pas une
		// organisation : il n'entre pas dans l'index de décision. Sauf s'il ne
		// désigne qu'une organisation et n'est le nom d'aucun territoire :
		// « Ymed », « Weda », « Cdiscount » sont des marques. « Intermarché »
		// (182 porteurs) et « Orange » (54) restent dehors : ambiguïté réelle.
		if (!role && (flags & F_LIEU_MULTI) === 0) {
			if (clesAmbigues.has(cle) || clesTerritoire.has(cle)) continue;
			if ((flags & F_COLLECTIVITE) !== 0 || (flags & F_SOURCE_NOMMEUSE) === 0) continue;
		}
		if (!role && (flags & F_DEPARTEMENT) !== 0) continue;
		const porteurs = aliasPorteurs[i] as number;
		if (porteurs === 0) continue;
		// Confiance par source : les alias auto-dérivés du stock (`sirene-nom`)
		// ne désignent qu'avec au moins deux mots propres. « A CE JOUR »
		// rattachait sinon tout texte contenant la phrase (ERNAT, 15/11).
		if ((flags & F_SIRENE_NOM) !== 0 && !role && porteurs < 2) continue;
		const territoire = (flags & F_TERRITOIRE) !== 0;
		// Le rôle se lit sur le nom légal, pas sur l'alias : une entreprise
		// dont l'alias est « Société X » n'est pas une collectivité.
		const roleLieu = role && territoire;
		if (territoire && !roleLieu) {
			lieuKeys.add(cle);
			const espace = cle.indexOf(" ");
			lieuTokens.add(espace < 0 ? cle : cle.slice(0, espace));
			continue;
		}
		if (roleLieu) {
			roleKeys.add(cle);
			// Les jetons du rôle (« ville », « mairie ») servent à la porte :
			// un texte qui les emploie parle d'une organisation.
			for (const jeton of cle.split(" ")) {
				if (jeuMotsGeneriques.has(jeton) && MOTS_ROLE.includes(jeton)) roleTokens.add(jeton);
			}
		}
		const id = aliasIds[i] as number;
		aliasCles[ecriture] = cle;
		aliasIds[ecriture] = id;
		// L'alias d'usage désigne le réseau, pas une unité légale au hasard.
		if ((flags & F_CURE) !== 0) {
			cureCles.push(cle);
			cureIds.push(id);
		}
		const nbJetons = aliasNbJetons[i] as number;
		if (nbJetons > maxTokens) maxTokens = nbJetons;
		ecriture++;
	}
	aliasCles.length = ecriture;
	aliasIds.length = ecriture;

	const indexAlias = construireIndex(aliasCles, aliasIds);
	const tokenClesTriees = [...orgsParToken.keys()].sort();
	const tokenClesParId: string[] = [];
	const tokenIds: number[] = [];
	for (const jeton of tokenClesTriees) {
		for (const id of orgsParToken.get(jeton) as number[]) {
			tokenClesParId.push(jeton);
			tokenIds.push(id);
		}
	}
	return {
		byAliasKey: new CarteIndexee(indexAlias, (ids) => Array.from(ids, (id) => orgs.get(id) as GazetteerOrg)),
		aliasKeysByFirstToken: new CartePremiersJetons(indexAlias.cles),
		roleKeys,
		lieuKeys,
		lieuTokens,
		roleTokens,
		maxTokens,
		orgsByToken: new CarteIndexee(construireIndexTrie(tokenClesParId, tokenIds), (ids) => new Set<number>(ids)),
		orgsById: orgs,
		curatedOrgsByAliasKey: new CarteIndexee(construireIndex(cureCles, cureIds), (ids) => new Set<number>(ids)),
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
		if (!gaz.aliasKeysByFirstToken.has(jetons[debut] as string)) continue;
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
