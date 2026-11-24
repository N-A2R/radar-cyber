/**
 * Priorité CTEM par organisation : lecture du score et du critère de sortie.
 *
 * La règle de classement vit dans `db/migrate-217-org-score.sql` (fonction
 * `refresh_org_score`). Ce module n'en duplique pas le SQL : il porte les
 * constantes publiées, le rafraîchissement et les deux mesures du juge.
 */
import { query } from "../db.js";

export const REGLE_CTEM = "ctem-priorite@1";
export const SEUIL_VALIDATION = 0.9;
export const TOP_N = 50;

/** Requête exacte du critère : part des expositions portées par un score > 0,9. */
export const CRITERE_EXPOSITIONS =
	"SELECT count(*) FILTER (WHERE esc.score>0.9 AND es.id IS NOT NULL)::float / NULLIF(count(*) FILTER (WHERE es.id IS NOT NULL),0) FROM org_score esc JOIN exposition_service es ON es.org_id=esc.org_id;";

/**
 * Précision au top N : parmi les N organisations au score le plus élevé,
 * combien portent une exposition encore citée et fraîche.
 * L'anti-join par EXISTS évite de compter deux fois la même organisation.
 */
export const PRECISION_TOP_N = `SELECT count(*)::float / $1 AS precision
  FROM (
    SELECT org_id FROM org_score ORDER BY score DESC, org_id LIMIT $1
  ) top
 WHERE EXISTS (
    SELECT 1 FROM exposition_service es
     WHERE es.org_id = top.org_id
       AND es.source_url ~ '^https?://'
       AND es.consulted_at >= now() - interval '7 days'
 );`;

export type CritereCtem = {
	/** Part des lignes de exposition_service dont l'organisation a un score > 0,9. */
	partExpositions: number;
	/** Précision du top 50 : organisations du top avec une exposition validée. */
	precisionTop: number;
	organisationsScorees: number;
	expositions: number;
};

/** Recalcule la table depuis les expositions mesurées. */
export async function rafraichirOrgScore(): Promise<number> {
	const { rows } = await query<{ total: number }>(
		"SELECT refresh_org_score()::int AS total",
	);
	return rows[0]?.total ?? 0;
}

/** Lit les deux mesures du critère, telle quelle et avec un alias pg. */
export async function lireCritereCtem(): Promise<CritereCtem> {
	const [brut, precision, volumes] = await Promise.all([
		query<Record<string, number | null>>(CRITERE_EXPOSITIONS),
		query<{ precision: number }>(PRECISION_TOP_N, [TOP_N]),
		query<{ organisations: number; expositions: number }>(
			`SELECT (SELECT count(*)::int FROM org_score) AS organisations,
			        (SELECT count(*)::int FROM exposition_service) AS expositions`,
		),
	]);
	return {
		partExpositions: Number(brut.rows[0]?.["?column?"] ?? 0),
		precisionTop: Number(precision.rows[0]?.precision ?? 0),
		organisationsScorees: volumes.rows[0]?.organisations ?? 0,
		expositions: volumes.rows[0]?.expositions ?? 0,
	};
}
