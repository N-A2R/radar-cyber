/**
 * Transformation des jeux d'établissements et d'entreprises en organisations.
 *
 * Même séparation que `plan.ts` : ce module décide *quoi* charger, `load.ts`
 * décide *comment* l'écrire. Rien ici ne touche Postgres, donc tout se teste.
 *
 * Trois décisions méritent d'être explicitées, parce qu'elles ne vont pas de soi :
 *
 *  1. **Les coordonnées manquantes sont reconstruites depuis la commune.** Les
 *     jeux livrés ont `lat`/`lon` à `null` sur 16 536 lignes, mais 100 % d'entre
 *     elles portent un code commune INSEE présent et géolocalisé dans
 *     `referentiel-na.json`. Poser le centroïde de la commune est exact à
 *     l'échelle d'une carte régionale, et la provenance est écrite dans
 *     `geo_source` pour qu'on ne confonde jamais les deux précisions.
 *
 *  2. **Tous les noms ne deviennent pas des alias.** Le moteur de rattachement
 *     charge les alias en mémoire et rend `null` dès que deux organisations
 *     revendiquent le même nom. Or 710 écoles s'appellent « Ecole primaire » et
 *     21 pharmacies « Pharmacie du Centre » : les verser telles quelles
 *     paralyserait le rattachement au lieu de l'améliorer. Seuls les noms
 *     distinctifs — au moins deux jetons, dont un qui ne soit ni un mot
 *     générique de secteur ni un nombre — deviennent des alias. Le nom complet
 *     reste dans `org.name` : on ne perd rien, on n'arme simplement pas le
 *     moteur avec du vocabulaire commun.
 *
 *  3. **Un établissement est une organisation à part entière**, pas un alias de
 *     sa commune. Un rançongiciel qui frappe un hôpital de Tarnos n'est pas un
 *     incident de la ville de Tarnos.
 */
import type {
	EtablissementSource,
	EtablissementsNA,
	EntrepriseSource,
	EntreprisesNA,
	ReferentielNA,
} from "./model.js";
import { MOTS_GENERIQUES, MOTS_GENERIQUES_ENTREPRISE } from "../match/generique.js";
import type { PlannedAlias, PlannedOrg } from "./plan.js";

export type SecteurEtendu = "sante" | "enseignement" | "entreprise";

export type PlanEtendu = {
	orgs: PlannedOrg[];
	counts: {
		orgs: number;
		aliases: number;
		sante: number;
		enseignement: number;
		entreprise: number;
		/** Noms écartés du moteur parce que trop génériques. */
		nomsGeneriques: number;
		/** Coordonnées reconstruites depuis le centroïde communal. */
		coordonneesHeriteesCommune: number;
		sansCoordonnees: number;
		/** Noms portés par plusieurs organisations du jeu (homonymes). */
		homonymes: number;
	};
	warnings: string[];
};

/** Normalisation alignée sur `match/core.ts` : accents retirés, jetons séparés. */
export function normaliserJeton(valeur: string): string {
	return valeur
		.replace(/œ/g, "oe")
		.replace(/Œ/g, "OE")
		.replace(/æ/g, "ae")
		.replace(/Æ/g, "AE")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/**
 * Vrai si le nom désigne une organisation identifiable plutôt qu'une catégorie.
 *
 * Trois conditions, toutes nécessaires : au moins deux jetons (un nom d'un seul
 * mot est presque toujours une enseigne locale, illisible hors de sa ville), au
 * moins un jeton non générique de trois lettres et plus, et une forme
 * normalisée d'au moins huit caractères.
 */
export function nomDistinctif(
	nom: string,
	generiques: ReadonlySet<string> = MOTS_GENERIQUES,
): boolean {
	const jetons = normaliserJeton(nom).split(" ").filter((j) => j.length > 0);
	if (jetons.length < 2) return false;
	if (jetons.join(" ").length < 8) return false;
	const porteurs = jetons.filter(
		(jeton) => jeton.length > 2 && !generiques.has(jeton) && !/^\d+$/.test(jeton),
	);
	return porteurs.length > 0;
}

/**
 * Noms commerciaux enfouis entre parenthèses dans `nom`.
 *
 * « ALLIANCE ATLANTIQUE (H.M. VOYAGES, AUTOCARS BERTRAND) » porte deux enseignes
 * qu'aucun champ ne reprend. Une enseigne est un nom propre : elle échappe à la
 * liste de mots génériques d'entreprise.
 */
export function nomsCommerciaux(nom: string): string[] {
	const match = /\(([^)]*)\)/.exec(nom);
	if (!match) return [];
	return match[1]
		.split(/[,;]/)
		.map((part) => part.trim())
		// Une enseigne est un nom propre : elle échappe à la liste de mots
		// génériques, et un seul mot suffit (« AGUR », « PEAKSYS »). Le moteur
		// plafonne de toute façon la confiance d'un alias mono-jeton sous le
		// seuil d'application : elle ne servira qu'à la revue, jamais seule.
		.filter((part) => part.length >= 4 && !MOTS_GENERIQUES_ENTREPRISE.has(normaliserJeton(part)));
}

/** Le slug doit rester stable et unique : il dérive de l'identifiant officiel. */
function slugDe(prefixe: string, code: string, nom: string): string {
	const lisible = normaliserJeton(nom)
		.replace(/ /g, "-")
		.slice(0, 40)
		.replace(/^-+|-+$/g, "");
	return `${prefixe}-${code}${lisible ? `-${lisible}` : ""}`.toLowerCase();
}

function dedupe(alias: Array<{ alias: string; source: string }>): PlannedAlias[] {
	const seen = new Set<string>();
	const out: PlannedAlias[] = [];
	for (const item of alias) {
		const propre = item.alias.replace(/\s+/g, " ").trim();
		if (propre.length < 4) continue;
		const cle = propre.toLowerCase();
		if (seen.has(cle)) continue;
		seen.add(cle);
		out.push({ alias: propre, source: item.source });
	}
	return out;
}

/** Coordonnées du centroïde communal, seule source disponible quand la ligne est nue. */
type GeoCommune = Map<string, { lat: number; lon: number }>;

function indexGeo(data: ReferentielNA): GeoCommune {
	const index: GeoCommune = new Map();
	for (const commune of data.communes) {
		if (commune.lat === null || commune.lon === null) continue;
		index.set(commune.code, { lat: commune.lat, lon: commune.lon });
	}
	return index;
}

/**
 * Reporte sur chaque organisation les compteurs d'homonymie et les avertissements
 * communs aux trois jeux : c'est ce qui permet d'annoncer un chargement sain
 * avant d'écrire en base.
 */
function finaliser(
	orgs: PlannedOrg[],
	warnings: string[],
	coordonneesHeriteesCommune: number,
	nomsGeneriques: number,
): Omit<PlanEtendu["counts"], "sante" | "enseignement" | "entreprise"> & {
	parSecteur: Map<string, number>;
} {
	const parNom = new Map<string, number>();
	for (const org of orgs) {
		const cle = normaliserJeton(org.name);
		parNom.set(cle, (parNom.get(cle) ?? 0) + 1);
	}
	const homonymes = [...parNom.values()].filter((n) => n > 1).length;
	if (homonymes > 0) {
		warnings.push(
			`${homonymes} nom(s) porté(s) par plusieurs organisations : le moteur s'abstiendra dessus`,
		);
	}
	const parSecteur = new Map<string, number>();
	for (const org of orgs) {
		const secteur = org.sector ?? org.kind;
		parSecteur.set(secteur, (parSecteur.get(secteur) ?? 0) + 1);
	}
	return {
		orgs: orgs.length,
		aliases: orgs.reduce((total, org) => total + org.aliases.length, 0),
		nomsGeneriques,
		coordonneesHeriteesCommune,
		sansCoordonnees: orgs.filter((o) => o.lat === null || o.lon === null).length,
		homonymes,
		parSecteur,
	};
}

function planEtablissements(
	data: EtablissementsNA,
	geo: GeoCommune,
	kind: "sante" | "enseignement",
	prefixe: string,
	source: string,
	warnings: string[],
): { orgs: PlannedOrg[]; coordonneesHeritees: number; nomsGeneriques: number } {
	const orgs: PlannedOrg[] = [];
	let coordonneesHeritees = 0;
	let nomsGeneriques = 0;
	let sansIdentifiant = 0;

	for (const etab of data.etablissements) {
		const code = kind === "sante" ? etab.finess : etab.uai;
		if (!code) {
			sansIdentifiant++;
			continue;
		}
		let lat = etab.lat;
		let lon = etab.lon;
		let geoSource = kind === "sante" ? "finess" : "annuaire-education";
		if ((lat === null || lon === null) && etab.codeCommune) {
			const centre = geo.get(etab.codeCommune);
			if (centre) {
				lat = centre.lat;
				lon = centre.lon;
				geoSource = "centroide-commune";
				coordonneesHeritees++;
			}
		}

		const aliases: Array<{ alias: string; source: string }> = [];
		if (nomDistinctif(etab.nom)) aliases.push({ alias: etab.nom, source });
		else nomsGeneriques++;

		orgs.push({
			slug: slugDe(prefixe, code, etab.nom),
			name: etab.nom,
			kind,
			// Le secteur éditorial dit la nature réelle : c'est lui qui alimente les
			// facettes du répertoire, et il distingue une pharmacie d'un EHPAD.
			sector: secteurDeType(etab.type, kind),
			city: etab.adresse ? nomDeCommune(etab.adresse) : null,
			dept: etab.departement,
			siren: null,
			lat,
			lon,
			geoSource,
			status: "confirme",
			entityCode: code,
			codesPostaux: [],
			population: null,
			aliases: dedupe(aliases),
			entitySource: source,
		});
	}

	if (sansIdentifiant > 0) {
		warnings.push(`${kind} : ${sansIdentifiant} établissement(s) sans identifiant officiel, ignoré(s)`);
	}
	return { orgs, coordonneesHeritees, nomsGeneriques };
}

const TYPES_CONNUS: Record<string, string> = {
	// santé : libellés FINESS ramenés à une famille
	pharmacie: "pharmacie",
	"pharmacie d'officine": "pharmacie",
	ehpad: "ehpad",
	"maison de retraite": "ehpad",
	hopital: "hopital",
	"centre hospitalier": "hopital",
	clinique: "clinique",
	laboratoire: "laboratoire",
	"laboratoire d'analyses": "laboratoire",
	// enseignement : catégories de l'annuaire
	ecole: "ecole",
	"collège": "college",
	"lycée": "lycee",
	"lycée professionnel": "lycee",
};

/**
 * Ramène le libellé de type de la source à une famille courte utilisable en
 * facette. Les libellés FINESS sont longs et bavards (« Foyer d'Accueil
 * Médicalisé pour Adultes Handicapés (F.A.M.) ») : on garde la famille, le
 * libellé exact reste consultable sur la fiche.
 */
export function secteurDeType(type: string | null, kind: "sante" | "enseignement"): string {
	if (!type) return kind;
	const normalise = normaliserJeton(type);
	for (const [motif, famille] of Object.entries(TYPES_CONNUS)) {
		if (normalise.includes(normaliserJeton(motif))) return famille;
	}
	if (normalise.includes("foyer") || normalise.includes("maison d accueil")) return "foyer";
	if (normalise.includes("service") && normalise.includes("domicile")) return "ssiad";
	if (normalise.includes("centre") && normalise.includes("sante")) return "centre-sante";
	return kind;
}

/** Dernier jeton alphabétique d'une adresse : la commune, dans les deux formats livrés. */
function nomDeCommune(adresse: string): string | null {
	const morceaux = adresse.split(/[,\s]+/).filter(Boolean).reverse();
	for (const morceau of morceaux) {
		if (/^\d+$/.test(morceau)) continue;
		if (morceau.length < 3) continue;
		return morceau.replace(/^l'/i, "");
	}
	return null;
}

function planEntreprises(
	data: EntreprisesNA,
	geo: GeoCommune,
	warnings: string[],
): { orgs: PlannedOrg[]; coordonneesHeritees: number; nomsGeneriques: number } {
	const orgs: PlannedOrg[] = [];
	let coordonneesHeritees = 0;
	let nomsGeneriques = 0;
	let horsRegion = 0;
	let sansCoordonnees = 0;

	for (const ent of data.entreprises) {
		if (!ent.siren) {
			horsRegion++;
			continue;
		}
		const siege = ent.siege ?? ({} as EntrepriseSource["siege"]);
		let lat = siege.lat ?? null;
		let lon = siege.lon ?? null;
		let geoSource = "sirene";
		if ((lat === null || lon === null) && siege.codeCommune) {
			const centre = geo.get(siege.codeCommune);
			if (centre) {
				lat = centre.lat;
				lon = centre.lon;
				geoSource = "centroide-commune";
				coordonneesHeritees++;
			}
		}
		if (lat === null || lon === null) sansCoordonnees++;

		const aliases: Array<{ alias: string; source: string }> = [];
		// Le nom légal est déjà l'alias naturel de l'organisation ; on l'ajoute
		// seulement s'il est distinctif, sinon la recherche par nom suffit.
		if (nomDistinctif(ent.nom, MOTS_GENERIQUES_ENTREPRISE)) {
			aliases.push({ alias: ent.nom, source: "sirene" });
		} else {
			nomsGeneriques++;
		}
		if (ent.sigle && nomDistinctif(ent.sigle, MOTS_GENERIQUES_ENTREPRISE)) {
			aliases.push({ alias: ent.sigle, source: "sirene-sigle" });
		}
		for (const enseigne of nomsCommerciaux(ent.nom)) {
			aliases.push({ alias: enseigne, source: "sirene-enseigne" });
		}
		for (const alternatif of ent.nomsAlternatifs ?? []) {
			if (nomDistinctif(alternatif, MOTS_GENERIQUES_ENTREPRISE)) {
				aliases.push({ alias: alternatif, source: "sirene" });
			}
		}

		orgs.push({
			slug: `na-entreprise-${ent.siren}`,
			name: ent.nom,
			kind: "entreprise",
			sector: familleNaf(ent.naf),
			city: siege.commune ?? null,
			dept: siege.departement ?? null,
			siren: ent.siren,
			lat,
			lon,
			geoSource,
			status: "confirme",
			entityCode: ent.siren,
			codesPostaux: siege.codePostal ? [siege.codePostal] : [],
			population: null,
			aliases: dedupe(aliases),
			entitySource: "sirene",
			naf: ent.naf ?? null,
			effectifMin: ent.effectifMin ?? null,
			website: ent.siteWeb ?? null,
			domain: ent.domaine ?? null,
		});
	}

	if (horsRegion > 0) {
		warnings.push(`entreprises : ${horsRegion} ligne(s) sans SIREN ignorée(s)`);
	}
	if (sansCoordonnees > 0) {
		warnings.push(`entreprises : ${sansCoordonnees} sans coordonnées, ni siège ni commune`);
	}
	return { orgs, coordonneesHeritees, nomsGeneriques };
}

/**
 * Famille sectorielle lisible depuis le code NAF.
 *
 * Les 13 332 entreprises livrées sont à 98 % du numérique, mais un référentiel
 * qui ne saurait nommer que le numérique ne servirait à rien pour
 * l'agroalimentaire ou le bâtiment — les deux secteurs les plus touchés par les
 * rançongiciels en région.
 */
export function familleNaf(naf: string | null): string {
	if (!naf) return "entreprise";
	const division = naf.slice(0, 2);
	if (division === "61" || division === "62" || division === "63" || division === "58")
		return "numerique";
	if (["35", "36", "37", "38", "39"].includes(division)) return "energie-eau-dechets";
	if (["49", "50", "51", "52", "53"].includes(division)) return "transport-logistique";
	if (division === "86" || division === "87" || division === "88") return "sante-social";
	if (["64", "65", "66"].includes(division)) return "finance-assurance";
	if (["10", "11", "12", "13"].includes(division)) return "agroalimentaire";
	if (["41", "42", "43"].includes(division)) return "construction";
	if (["45", "46", "47"].includes(division)) return "commerce";
	if (["20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"].includes(division))
		return "industrie";
	if (["01", "02", "03"].includes(division)) return "agriculture";
	return "autre";
}

/**
 * Construit le plan complet du référentiel : territorial (délégué à `plan.ts`)
 * puis santé, enseignement et entreprises. Les trois jeux partagent l'index
 * géographique du référentiel — sans lui, 16 536 lignes resteraient sans
 * coordonnées alors que leur commune est connue.
 */
export function planReferentielEtendu(input: {
	referentiel: ReferentielNA;
	territorial: PlannedOrg[];
	sante?: EtablissementsNA;
	enseignement?: EtablissementsNA;
	entreprises?: EntreprisesNA;
}): PlanEtendu {
	const geo = indexGeo(input.referentiel);
	const warnings: string[] = [];
	const orgs: PlannedOrg[] = [...input.territorial];
	let coordonnees = 0;
	let generiques = 0;
	const compter = (bloc: {
		orgs: PlannedOrg[];
		coordonneesHeritees: number;
		nomsGeneriques: number;
	}) => {
		orgs.push(...bloc.orgs);
		coordonnees += bloc.coordonneesHeritees;
		generiques += bloc.nomsGeneriques;
		return bloc.orgs.length;
	};

	const sante = input.sante
		? compter(planEtablissements(input.sante, geo, "sante", "na-sante", "finess", warnings))
		: 0;
	const enseignement = input.enseignement
		? compter(
				planEtablissements(
					input.enseignement, geo, "enseignement", "na-ecole", "annuaire-education", warnings,
				),
			)
		: 0;
	const entreprise = input.entreprises
		? compter(planEntreprises(input.entreprises, geo, warnings))
		: 0;

	// Slugs distincts par construction (préfixe + identifiant officiel) : un
	// doublon signalerait un identifiant répété dans le jeu source.
	const slugs = new Set<string>();
	for (const org of orgs) {
		if (slugs.has(org.slug)) warnings.push(`slug en doublon dans le jeu : ${org.slug}`);
		slugs.add(org.slug);
	}

	const commun = finaliser(orgs, warnings, coordonnees, generiques);
	return {
		orgs,
		counts: {
			orgs: commun.orgs,
			aliases: commun.aliases,
			sante,
			enseignement,
			entreprise,
			nomsGeneriques: commun.nomsGeneriques,
			coordonneesHeriteesCommune: commun.coordonneesHeriteesCommune,
			sansCoordonnees: commun.sansCoordonnees,
			homonymes: commun.homonymes,
		},
		warnings,
	};
}
