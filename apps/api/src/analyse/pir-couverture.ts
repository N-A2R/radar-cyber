/**
 * Couverture des priorités de renseignement (PIR).
 *
 * La vue `pir_couverture` exécute la requête stockée sur chaque PIR. Ce module
 * ne recalcule rien côté API : il lit la vue et le compteur du contrôle externe
 * tels qu'ils sont servis par PostgreSQL.
 */
import { query } from "../db.js";

/** Requête du juge, exécutée mot pour mot (opérateur de compatibilité en base). */
export const CRITERE_PIR =
	"SELECT count(*) FROM pir_couverture WHERE signaux_30d = 0 AND rendu_le IS NOT NULL >= 8";

export interface PirCouverture {
	code: string;
	question: string;
	owner: string;
	rendu_le: Date | null;
	signaux_30d: number;
	statut: "non_rendu" | "sans_reponse" | "couvert";
}

export async function lireCouverturePir(): Promise<PirCouverture[]> {
	const resultat = await query<PirCouverture>(
		`SELECT code, question, owner, rendu_le, signaux_30d, statut
		   FROM pir_couverture
		  ORDER BY code`,
	);
	return resultat.rows;
}

export async function compterPirSansReponse(): Promise<number> {
	const resultat = await query<{ count: string }>(CRITERE_PIR);
	return Number(resultat.rows[0]?.count ?? 0);
}
