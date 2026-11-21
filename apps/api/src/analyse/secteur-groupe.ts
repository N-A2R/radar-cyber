/**
 * Réduction du référentiel à neuf secteurs publiable :
 * agroalimentaire, industrie, construction, commerce, sante, enseignement,
 * public, services, autre.
 *
 * Le référentiel porte un vocabulaire fin (`sector` : immobilier, sante-social,
 * administration, hopital, ecole…) né des imports SIRENE. Cette règle le
 * ramène aux neuf groupes demandés, sans inventer d'activité : quand aucune
 * donnée ne permet de choisir, le groupe est « autre » et la confiance le dit.
 *
 * Priorité : `sector` (champ enrichi, le plus précis) → `naf` (division NAF,
 * code officiel) → `kind` (type d'établissement, très grossier) → « autre ».
 * Un `sector` connu gagne même sur un NAF contradictoire : il porte les
 * corrections humaines (établissements scolaires, collectivités) que le code
 * NAF seul ne voit pas.
 */

/** Les neuf groupes, dans l'ordre des tableaux de mesure. */
export const SECTEURS_GROUPE = [
	"agroalimentaire",
	"industrie",
	"construction",
	"commerce",
	"sante",
	"enseignement",
	"public",
	"services",
	"autre",
] as const;

export type SecteurGroupe = (typeof SECTEURS_GROUPE)[number];

/** Ce qui a décidé du groupe : la source est publiée avec la valeur. */
export type SourceSecteur = "secteur" | "naf" | "kind" | "defaut";

export type SecteurClasse = {
	secteur: SecteurGroupe;
	source: SourceSecteur;
	/** 0 à 1 ; « autre » n'est jamais une affirmation forte. */
	confiance: number;
};

export type OrganisationASecteur = {
	sector?: string | null;
	naf?: string | null;
	kind?: string | null;
};

/** Vocabulaire fin du référentiel → groupe. Clés en minuscules, sans accent. */
const GROUPE_PAR_SECTEUR: Record<string, SecteurGroupe> = {
	agriculture: "agroalimentaire",
	agroalimentaire: "agroalimentaire",
	industrie: "industrie",
	"energie-eau-dechets": "industrie",
	construction: "construction",
	commerce: "commerce",
	"sante-social": "sante",
	sante: "sante",
	pharmacie: "sante",
	hopital: "sante",
	"centre-sante": "sante",
	ssiad: "sante",
	foyer: "sante",
	enseignement: "enseignement",
	ecole: "enseignement",
	college: "enseignement",
	lycee: "enseignement",
	administration: "public",
	collectivite: "public",
	commune: "public",
	epci: "public",
	departement: "public",
	region: "public",
	numerique: "services",
	immobilier: "services",
	"finance-assurance": "services",
	"transport-logistique": "services",
	"restauration-hotellerie": "services",
	"culture-loisirs": "services",
	"activites-specialisees": "services",
	"services-entreprises": "services",
	"services-personnels": "services",
	laboratoire: "services",
	recherche: "services",
	"operateur-critique": "services",
	associations: "autre",
	"particulier-employeur": "autre",
	ess: "autre",
	autre: "autre",
};

/**
 * Division NAF (deux chiffres) → groupe. Miroir agrégé de
 * `scripts/naf-division-secteurs.mts` : une division absente d'ici est
 * inconnue, pas un service — on ne devine pas.
 */
const GROUPE_PAR_DIVISION: Record<string, SecteurGroupe> = {
	"01": "agroalimentaire", "02": "agroalimentaire", "03": "agroalimentaire", "10": "agroalimentaire",
	"05": "industrie", "06": "industrie", "07": "industrie", "08": "industrie", "09": "industrie",
	"11": "industrie", "12": "industrie", "13": "industrie", "14": "industrie", "15": "industrie",
	"16": "industrie", "17": "industrie", "18": "industrie", "19": "industrie", "20": "industrie",
	"21": "industrie", "22": "industrie", "23": "industrie", "24": "industrie", "25": "industrie",
	"26": "industrie", "27": "industrie", "28": "industrie", "29": "industrie", "30": "industrie",
	"31": "industrie", "32": "industrie", "33": "industrie",
	"35": "industrie", "36": "industrie", "37": "industrie", "38": "industrie", "39": "industrie",
	"41": "construction", "42": "construction", "43": "construction",
	"45": "commerce", "46": "commerce", "47": "commerce",
	"49": "services", "50": "services", "51": "services", "52": "services", "53": "services",
	"55": "services", "56": "services",
	"58": "services", "59": "services", "60": "services", "61": "services", "62": "services",
	"63": "services", "64": "services", "65": "services", "66": "services", "68": "services",
	"69": "services", "70": "services", "71": "services", "72": "services", "73": "services",
	"74": "services", "75": "services",
	"77": "services", "78": "services", "79": "services", "80": "services", "81": "services",
	"82": "services",
	"84": "public",
	"85": "enseignement",
	"86": "sante", "87": "sante", "88": "sante",
	"90": "services", "91": "services", "92": "services", "93": "services",
	"94": "autre",
	"95": "services", "96": "services",
	"97": "autre", "98": "autre", "99": "autre",
};

/** Le `kind` ne dit rien d'une entreprise : on ne classifie pas sur ce mot seul. */
const GROUPE_PAR_KIND: Partial<Record<string, SecteurGroupe>> = {
	collectivite: "public",
	sante: "sante",
	enseignement: "enseignement",
};

const CONFIANCE = {
	secteur: 0.9,
	naf: 0.8,
	kind: 0.5,
	autreSecteur: 0.4,
	autreNaf: 0.3,
	defaut: 0.2,
} as const;

function normaliser(valeur: string | null | undefined): string {
	return (valeur ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Classe une organisation avec la source et la confiance qui vont avec. */
export function classerSecteurGroupe(org: OrganisationASecteur): SecteurClasse {
	const secteur = GROUPE_PAR_SECTEUR[normaliser(org.sector)];
	if (secteur) {
		return {
			secteur,
			source: "secteur",
			confiance: secteur === "autre" ? CONFIANCE.autreSecteur : CONFIANCE.secteur,
		};
	}
	const code = (org.naf ?? "").replace(/[.\s]/g, "").toUpperCase();
	if (/^\d{2}/.test(code)) {
		const division = GROUPE_PAR_DIVISION[code.slice(0, 2)];
		if (division) {
			return {
				secteur: division,
				source: "naf",
				confiance: division === "autre" ? CONFIANCE.autreNaf : CONFIANCE.naf,
			};
		}
	}
	const kind = GROUPE_PAR_KIND[normaliser(org.kind)];
	if (kind) return { secteur: kind, source: "kind", confiance: CONFIANCE.kind };
	return { secteur: "autre", source: "defaut", confiance: CONFIANCE.defaut };
}

export type LigneCouverture = { secteur: SecteurGroupe | null };

export type RapportCouverture = {
	total: number;
	classes: number;
	couverture: number;
	parSecteur: { secteur: SecteurGroupe; n: number; part: number }[];
	/** Groupes à zéro ligne : un résultat, pas une ligne à masquer. */
	vides: SecteurGroupe[];
};

export type ComptesSecteurs = Partial<Record<SecteurGroupe, number>>;

/** Mesure à partir de comptages SQL, sans remonter 1,6 M de lignes en mémoire. */
export function mesurerCouvertureComptes(comptes: ComptesSecteurs, total: number): RapportCouverture {
	const parSecteur = SECTEURS_GROUPE.map((secteur) => {
		const n = comptes[secteur] ?? 0;
		return { secteur, n, part: total === 0 ? 0 : n / total };
	}).sort((a, b) => b.n - a.n);
	const classes = parSecteur.reduce((somme, s) => somme + s.n, 0);
	return {
		total,
		classes,
		couverture: total === 0 ? 0 : classes / total,
		parSecteur,
		vides: parSecteur.filter((s) => s.n === 0).map((s) => s.secteur),
	};
}

/** Mesure rejouable de la couverture, sans base ni réseau. */
export function mesurerCouvertureSecteurs(lignes: readonly LigneCouverture[]): RapportCouverture {
	const comptes: ComptesSecteurs = {};
	for (const ligne of lignes) {
		if (!ligne.secteur || !SECTEURS_GROUPE.includes(ligne.secteur)) continue;
		comptes[ligne.secteur] = (comptes[ligne.secteur] ?? 0) + 1;
	}
	return mesurerCouvertureComptes(comptes, lignes.length);
}
