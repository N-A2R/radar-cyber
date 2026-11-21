/**
 * Écriture de l'inventaire CT. Les trois tables sont nouvelles (migration
 * 051) : aucun fichier partagé n'est modifié. Les réinsertions sont
 * idempotentes et ne comptent que les lignes réellement ajoutées.
 */
import { withTransaction } from "../db.js";
import type { SousDomaineInventaire, Suspect, Tentative } from "./inventaire.js";
import { tauxEchec } from "./inventaire.js";

export type RapportCT = {
	collecte_le: string;
	domaines_interroges: number;
	sous_domaines: number;
	suspects: number;
	taux_echec: { total: number; echecs: number; taux: number };
	par_fournisseur: Record<string, { total: number; echecs: number; taux: number }>;
	variantes_interrogees: number;
};

export type ResultatStockage = {
	sousDomainesInscrits: number;
	suspectsInscrits: number;
};

const LOT = 200;

function lots<T>(valeurs: T[], taille: number): T[][] {
	const resultat: T[][] = [];
	for (let i = 0; i < valeurs.length; i += taille) resultat.push(valeurs.slice(i, i + taille));
	return resultat;
}

function fournisseurStats(tentatives: Tentative[]): RapportCT["par_fournisseur"] {
	const resultat: RapportCT["par_fournisseur"] = {};
	for (const fournisseur of ["crt.sh", "certspotter"]) {
		resultat[fournisseur] = tauxEchec(tentatives.filter((t) => t.fournisseur === fournisseur));
	}
	return resultat;
}

/** Construit le rapport publié (JSONL et table `ct_collecte`). */
export function construireRapport(args: {
	collecteLe: string;
	domainesInterroges: number;
	sousDomaines: number;
	suspects: number;
	variantesInterrogees: number;
	tentatives: Tentative[];
}): RapportCT {
	return {
		collecte_le: args.collecteLe,
		domaines_interroges: args.domainesInterroges,
		sous_domaines: args.sousDomaines,
		suspects: args.suspects,
		taux_echec: tauxEchec(args.tentatives),
		par_fournisseur: fournisseurStats(args.tentatives),
		variantes_interrogees: args.variantesInterrogees,
	};
}

export async function enregistrerInventaire(args: {
	sousDomaines: SousDomaineInventaire[];
	suspects: Suspect[];
	rapport: RapportCT;
}): Promise<ResultatStockage> {
	return withTransaction(async (client) => {
		let sousDomainesInscrits = 0;
		for (const lot of lots(args.sousDomaines, LOT)) {
			const valeurs: unknown[] = [];
			const places: string[] = [];
			for (const ligne of lot) {
				valeurs.push(
					ligne.sous_domaine, ligne.domaine, ligne.organisation, ligne.source,
					ligne.premiere_vue, ligne.certificat_id, ligne.emetteur,
				);
				places.push(`($${valeurs.length - 6}, $${valeurs.length - 5}, $${valeurs.length - 4}, $${valeurs.length - 3}, $${valeurs.length - 2}, $${valeurs.length - 1}, $${valeurs.length})`);
			}
			const resultat = await client.query(
				`INSERT INTO ct_sous_domaine
				 (sous_domaine, domaine, organisation, source, premiere_vue, certificat_id, emetteur)
				 VALUES ${places.join(", ")} ON CONFLICT (sous_domaine, source) DO NOTHING`,
				valeurs,
			);
			sousDomainesInscrits += resultat.rowCount ?? 0;
		}

		let suspectsInscrits = 0;
		for (const lot of lots(args.suspects, LOT)) {
			const valeurs: unknown[] = [];
			const places: string[] = [];
			for (const ligne of lot) {
				valeurs.push(
					ligne.domaine, ligne.organisation_cible, ligne.distance, ligne.motif,
					ligne.premiere_vue, ligne.source, ligne.certificat_id ?? "",
					ligne.sous_domaines_observes,
				);
				places.push(`($${valeurs.length - 7}, $${valeurs.length - 6}, $${valeurs.length - 5}, $${valeurs.length - 4}, $${valeurs.length - 3}, $${valeurs.length - 2}, $${valeurs.length - 1}, $${valeurs.length})`);
			}
			const resultat = await client.query(
				`INSERT INTO ct_certificat_suspect
				 (domaine, organisation_cible, distance, motif, premiere_vue, source, certificat_id, sous_domaines_observes)
				 VALUES ${places.join(", ")}
				 ON CONFLICT (domaine, source, certificat_id) DO NOTHING`,
				valeurs,
			);
			suspectsInscrits += resultat.rowCount ?? 0;
		}

		const rapport = args.rapport;
		await client.query(
			`INSERT INTO ct_collecte
			 (collecte_le, domaines_interroges, sous_domaines, suspects, appels, echecs,
			  echecs_crtsh, appels_crtsh, rapport)
			 VALUES ($1::timestamptz, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
			[
				rapport.collecte_le,
				rapport.domaines_interroges,
				rapport.sous_domaines,
				rapport.suspects,
				rapport.taux_echec.total,
				rapport.taux_echec.echecs,
				rapport.par_fournisseur["crt.sh"]?.echecs ?? 0,
				rapport.par_fournisseur["crt.sh"]?.total ?? 0,
				JSON.stringify(rapport),
			],
		);
		return { sousDomainesInscrits, suspectsInscrits };
	});
}
