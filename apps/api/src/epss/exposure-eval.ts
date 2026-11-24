/**
 * Priorisation EPSS × exposition_service.
 *
 * La règle de classement vit dans `db/migrate-215-epss-exposure-eval.sql`
 * (fonction `refresh_epss_exposure_eval`). Ce module n'en duplique pas le SQL :
 * il fournit le prédicat pur vérifié par les tests et les lecteurs de la table.
 */
import { query } from "../db.js";

export const REGLE_EPSS_EXPOSITION = "epss-cross@1";
export const SEUIL_EPSS = 0.5;
export const FENETRE_JOURS = 7;
export const TOP_N = 50;

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;
const FENETRE_MS = FENETRE_JOURS * MS_PAR_JOUR;

export type PaireEpssExposition = {
	cve: string;
	sourceService: string;
	observeLe: Date;
	epssScore: number;
	epssMajLe: Date;
	/** La CVE figure dans la preuve primaire du service (`evidence->vulns`). */
	cveDansPreuve: boolean;
};

/**
 * `confirmé` qualifie une observation datée et citée des deux côtés :
 * le service a été consulté récemment et le score EPSS est récent.
 * Ce n'est pas une preuve d'exploitation active (le KEV reste un signal à part).
 */
export function estConfirme(paire: PaireEpssExposition, maintenant: Date = new Date()): boolean {
	const ageObservation = maintenant.getTime() - paire.observeLe.getTime();
	const ageScore = maintenant.getTime() - paire.epssMajLe.getTime();

	const expose = paire.cveDansPreuve
		&& paire.sourceService.trim() !== ""
		&& ageObservation >= 0
		&& ageObservation <= FENETRE_MS;
	const exploitable = paire.epssScore >= SEUIL_EPSS
		&& ageScore >= 0
		&& ageScore <= FENETRE_MS;

	return expose && exploitable;
}

/** Recalcule la table depuis `epss` et `exposition_service`. */
export async function rafraichirEvalEpssExposition(): Promise<number> {
	const { rows } = await query<{ total: number }>(
		"SELECT refresh_epss_exposure_eval()::int AS total",
	);
	return rows[0]?.total ?? 0;
}

export type CritereEpssExposition = {
	ratio: number;
	confirmes: number;
	lignes: number;
};

/** Lit le critère de sortie sur le top N, sans dépendre du LDH du juge. */
export async function lireCritereEpssExposition(): Promise<CritereEpssExposition> {
	const { rows } = await query<{ confirmes: number; lignes: number; ratio: number | null }>(
		`SELECT count(*) FILTER (WHERE confirmed)::int                         AS confirmes,
		        count(*)::int                                                  AS lignes,
		        count(*) FILTER (WHERE confirmed)::float / NULLIF(count(*), 0) AS ratio
		   FROM epss_exposure_eval
		  WHERE rank <= $1`,
		[TOP_N],
	);
	const lignes = rows[0]?.lignes ?? 0;
	return {
		ratio: rows[0]?.ratio ?? 0,
		confirmes: rows[0]?.confirmes ?? 0,
		lignes,
	};
}
