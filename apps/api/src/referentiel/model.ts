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
