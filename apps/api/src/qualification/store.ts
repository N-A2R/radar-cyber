/**
 * Qualification fiches for the Nouvelle-Aquitaine dossier.
 *
 * The ANSSI catalogue is a national source. Each fiche carries the decision
 * reference, the grant date, the expiry date and the dated extract it came
 * from. No fiche is exposed as current when its qualification has expired.
 */

import { query } from "../db.js";

export interface ExtraitAnssi {
	id: string;
	titre: string;
	url: string;
	editeLe: string;
	extraitLe: string;
	sha256Fichier: string;
	pages: string;
}

export interface FichePrestataireQualifie {
	id: string;
	nom: string;
	region: string;
	referentiel: string;
	service: string;
	referenceAnssi: string;
	qualifieLe: string;
	validiteFin: string;
	active: boolean;
	estQualifie: boolean;
	sourcePortee: string;
	ancrageRegional: string;
	extrait: ExtraitAnssi;
}

interface LigneFiche extends Omit<FichePrestataireQualifie, "estQualifie"> {}

export async function chargerFichesPrestatairesQualifies(
	maintenant: Date = new Date(),
): Promise<FichePrestataireQualifie[]> {
	const resultat = await query<LigneFiche>(
		`SELECT p.id,
		        p.nom,
		        p.region,
		        p.referentiel,
		        p.service,
		        p.reference_anssi AS "referenceAnssi",
		        p.qualifie_le::text AS "qualifieLe",
		        p.validite_fin::text AS "validiteFin",
		        p.active,
		        p.source_portee AS "sourcePortee",
		        p.ancrage_regional AS "ancrageRegional",
		        json_build_object(
		          'id', e.id,
		          'titre', e.titre,
		          'url', e.url,
		          'editeLe', e.edite_le::text,
		          'extraitLe', e.extrait_le::text,
		          'sha256Fichier', e.sha256_fichier,
		          'pages', e.pages
		        ) AS extrait
		   FROM prestataire_qualifie p
		   JOIN anssi_extrait e ON e.id = p.extrait_id
		  WHERE p.region = 'Nouvelle-Aquitaine'
		    AND p.reference_anssi IS NOT NULL
		    AND p.qualifie_le IS NOT NULL
		    AND p.validite_fin IS NOT NULL
		  ORDER BY p.nom`,
	);
	const date = maintenant.toISOString().slice(0, 10);
	return resultat.rows.map((fiche) => ({
		...fiche,
		estQualifie: fiche.active && fiche.validiteFin >= date,
	}));
}

/** Only fiches that are still qualified are fit for public display. */
export async function chargerFichesQualifieesCourantes(
	maintenant: Date = new Date(),
): Promise<FichePrestataireQualifie[]> {
	const fiches = await chargerFichesPrestatairesQualifies(maintenant);
	return fiches.filter((fiche) => fiche.estQualifie);
}
