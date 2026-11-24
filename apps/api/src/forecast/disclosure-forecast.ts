/**
 * Fenêtre de publication : producteur et lecture du critère.
 *
 * Le modèle lui-même vit dans PostgreSQL (`public.emit_disclosure_forecast`,
 * migrations 217/218) : une seule règle, exécutable par le producteur, le
 * script de mesure et le juge externe. Ce module n'est qu'une surface TS :
 * émettre les fenêtres, puis lire la mesure sans la recalculer autrement.
 */
import { ingestQuery, query } from "../db.js";

/** Règle versionnée utilisée par les migrations et le script de mesure. */
export const DISCLOSURE_MODEL = "disclosure-window-quantile@1";

/** Critère du chantier, laissé tel quel pour la sortie brute. */
export const DISCLOSURE_CRITERION_SQL =
	"SELECT count(*) FROM disclosure_forecast WHERE issued_at<first_public_at AND first_public_at BETWEEN window_start AND window_end";

/** Mesure détaillée : émises, dans la fenêtre, et part dans la fenêtre. */
export const DISCLOSURE_SCORE_SQL = `
	SELECT count(*)::int AS emitted,
	       count(*) FILTER (
	         WHERE issued_at < first_public_at
	           AND first_public_at BETWEEN window_start AND window_end
	       )::int AS in_window,
	       (count(*) FILTER (
	         WHERE issued_at < first_public_at
	           AND first_public_at BETWEEN window_start AND window_end
	       ))::double precision / nullif(count(*), 0) AS hit_rate
	  FROM disclosure_forecast`;

export type DisclosureForecastRow = {
	id: number;
	incident_id: string;
	issued_at: string;
	window_start: string;
	window_end: string;
	first_public_at: string | null;
	horizon_days: number;
	model: string;
	source_dataset: string;
};

export type DisclosureScore = {
	emitted: number;
	in_window: number;
	hit_rate: number | null;
};

/** Émet les fenêtres manquantes ; rejouable, sans doublon. */
export async function emitDisclosureForecasts(model: string = DISCLOSURE_MODEL): Promise<number> {
	const result = await ingestQuery<{ emitted: number }>(
		"SELECT public.emit_disclosure_forecast($1) AS emitted",
		[model],
	);
	return result.rows[0]?.emitted ?? 0;
}

/** Lit le critère dans la base, sans le réécrire. */
export async function readDisclosureCriterion(): Promise<number> {
	const result = await query<{ count: number }>(DISCLOSURE_CRITERION_SQL);
	return Number(result.rows[0]?.count ?? 0);
}

/** Lit la mesure détaillée (émises, réussies, taux). */
export async function readDisclosureScore(): Promise<DisclosureScore> {
	const result = await query<DisclosureScore>(DISCLOSURE_SCORE_SQL);
	const row = result.rows[0];
	if (!row) return { emitted: 0, in_window: 0, hit_rate: null };
	return {
		emitted: Number(row.emitted),
		in_window: Number(row.in_window),
		hit_rate: row.hit_rate === null ? null : Number(row.hit_rate),
	};
}
