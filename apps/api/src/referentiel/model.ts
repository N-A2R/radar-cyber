/**
 * Types du jeu `db/data/referentiel-na.json`.
 *
 * Le jeu est versionné : un déploiement neuf n'a besoin ni du réseau ni du
 * générateur (`bench/referentiel/build_na.py`). Les champs reflètent exactement
 * ce que produit le générateur, provenance et limites incluses.
 */

export type ReferentielSource = {
	nom: string;
	version?: string;
	licence: string;
	url: string;
	commit?: string | null;
	apporte: string;
};

export type ReferentielMeta = {
	titre: string;
	genereLe: string;
	region: { code: string; nom: string };
	sources: ReferentielSource[];
	methodeGeocodage: string;
	limites: string[];
	counts: Record<string, number>;
};

export type ReferentielCommune = {
	/** Code INSEE communal, cinq caractères. */
	code: string;
	nom: string;
	type: "commune-actuelle" | "commune-deleguee" | "commune-associee" | string;
	siren: string | null;
	departement: string;
	epci: string | null;
	population: number | null;
	codesPostaux: string[];
	codesPostauxRecoupes: string[];
	/** Code INSEE de la commune parente, pour les déléguées et associées. */
	parent: string | null;
	lat: number | null;
	lon: number | null;
};

export type ReferentielEpci = {
	/** Code SIREN de l'EPCI. */
	code: string;
	nom: string;
	type: "CC" | "CA" | "CU" | "METRO" | string;
	population: number | null;
	membres: string[];
	membresHorsRegion: number;
	lat: number | null;
	lon: number | null;
};

export type ReferentielDepartement = {
	code: string;
	nom: string;
	chefLieu: string | null;
	lat: number | null;
	lon: number | null;
};

export type ReferentielRegion = {
	code: string;
	nom: string;
	chefLieu: string | null;
	lat: number | null;
	lon: number | null;
};

export type ReferentielNA = {
	meta: ReferentielMeta;
	region: ReferentielRegion;
	departements: ReferentielDepartement[];
	epci: ReferentielEpci[];
	communes: ReferentielCommune[];
};

/**
 * Jeux d'établissements livrés à côté du référentiel territorial.
 *
 * Deux formats, une même forme : un identifiant officiel (`finess` ou `uai`),
 * un nom, un type de la source, un code commune INSEE et — quand la source les
 * fournit — des coordonnées. **Le code commune est la pièce maîtresse** : il
 * permet de situer l'établissement même quand `lat`/`lon` sont nuls, ce qui est
 * le cas de 100 % des lignes livrées jusqu'ici.
 */
export type EtablissementSource = {
	/** FINESS (9 chiffres) pour la santé, UAI (7 caractères) pour l'enseignement. */
	finess?: string | null;
	uai?: string | null;
	nom: string;
	type: string | null;
	departement: string | null;
	codeCommune: string | null;
	adresse: string | null;
	statut: string | null;
	lat: number | null;
	lon: number | null;
	siteWeb: string | null;
	source: string | null;
};

export type EtablissementsNA = {
	meta: {
		titre: string;
		genereLe: string;
		methode?: string;
		sources?: ReferentielSource[];
	};
	etablissements: EtablissementSource[];
};

/**
 * Entreprises de Nouvelle-Aquitaine (`db/data/entreprises-na.json`).
 *
 * Les noms commerciaux ne sont pas dans un champ dédié : ils sont **entre
 * parenthèses dans `nom`** — « ALLIANCE ATLANTIQUE (H.M. VOYAGES, AUTOCARS
 * BERTRAND) ». `nomsAlternatifs` est vide sur toutes les lignes livrées. Les
 * extraire est ce qui permet de reconnaître une entreprise dans un article qui
 * ne cite que son enseigne.
 */
export type EntrepriseSource = {
	siren: string;
	nom: string;
	sigle: string | null;
	nomsAlternatifs: string[] | null;
	naf: string | null;
	categorie: string | null;
	/** Borne basse de la tranche d'effectif INSEE, `null` si non renseignée. */
	effectifMin: number | null;
	etat: string | null;
	dateCreation: string | null;
	siege: {
		adresse: string | null;
		codePostal: string | null;
		codeCommune: string | null;
		commune: string | null;
		departement: string | null;
		lat: number | null;
		lon: number | null;
	};
	siteWeb: string | null;
	domaine: string | null;
	source: string | null;
};

export type EntreprisesNA = {
	meta: {
		titre: string;
		genereLe: string;
		producteur?: string;
		methode?: string;
		sources?: ReferentielSource[];
		compteurs?: Record<string, number>;
		limites?: string;
	};
	entreprises: EntrepriseSource[];
};
