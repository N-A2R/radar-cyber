/**
 * GET /api/corpus/stats — état du corpus en un appel, pour l'écran #/corpus.
 *
 * Réponse : `{ sourcesParDepartement, sourcesParFamille, organisationsAvecDomaine,
 * incidentsCorpus, sourcesProductives, sourcesTotales, tauxSourcesProductives,
 * windowDays }`.
 *
 * Définitions, pour que les chiffres soient discutables :
 * - `sourcesParDepartement` : `source` n'a pas de colonne département. On
 *   réutilise donc l'inférence documentée de `/stats/departements` (alias,
 *   code postal, identifiant ; ambiguïté = pas d'attribution). Les douze
 *   départements de Nouvelle-Aquitaine sont renvoyés même à zéro. Ce sont des
 *   MINIMUMS, pas une couverture. Le total des sources y est compté, actives
 *   comprises au sens `enabled` ; le décompte des seules sources actives reste
 *   dans `/stats/departements`.
 * - `sourcesParFamille` : famille déclarée par la source (`source.family`),
 *   pas famille des événements qu'elle a produits.
 * - `organisationsAvecDomaine` : `org.domain` renseigné et non vide (le blank
 *   compte comme absent).
 * - `incidentsCorpus` : événements dont l'assertion est `confirmed_incident`.
 *   Les revendications tierces, indicateurs techniques et signaux d'ambiance
 *   ne sont pas des incidents établis.
 * - `sourcesProductives` : sources ayant au moins un événement attribué sur
 *   30 jours glissants — la même règle que `sourceYield()` côté interface et
 *   que `evenements30j` dans `/sources`. Le taux est un pourcentage arrondi à
 *   0,1 point, ou `null` s'il n'y a aucune source (0 % dirait le contraire).
 */
import type { FastifyInstance } from "fastify";
import { DEPT_LABELS } from "../collectors/relevance.js";
import { query } from "../db.js";
import { departementDeLaSource, type SourceRow } from "./stats.js";

const WINDOW_DAYS = 30;

export default async function (app: FastifyInstance) {
	app.get("/corpus/stats", async () => {
		const [familles, sources, orgs, incidents, productivite] = await Promise.all([
			query<{ family: string; n: number }>(
				`SELECT family, count(*)::int AS n
				   FROM source GROUP BY family ORDER BY n DESC, family ASC`,
			),
			query<SourceRow>(
				`SELECT id, name, url, description, enabled FROM source ORDER BY id`,
			),
			query<{ n: number }>(
				`SELECT count(*) FILTER (WHERE domain IS NOT NULL AND btrim(domain) <> '')::int AS n
				   FROM org`,
			),
			query<{ n: number }>(
				`SELECT count(*)::int AS n FROM event WHERE assertion_type = 'confirmed_incident'`,
			),
			query<{ total: number; productives: number }>(
				`WITH productives AS (
				   SELECT DISTINCT source_id FROM event
				  WHERE COALESCE(observed_at, collected_at) >= now() - interval '30 days'
				 )
				 SELECT count(*)::int AS total,
				        count(*) FILTER (WHERE p.source_id IS NOT NULL)::int AS productives
				   FROM source s
				   LEFT JOIN productives p ON p.source_id = s.id`,
			),
		]);

		const parDepartement = new Map<string, number>();
		for (const source of sources.rows) {
			const dept = departementDeLaSource(source);
			if (dept !== null) parDepartement.set(dept, (parDepartement.get(dept) ?? 0) + 1);
		}
		const codes = new Set<string>([...Object.keys(DEPT_LABELS), ...parDepartement.keys()]);

		const total = productivite.rows[0]?.total ?? 0;
		const productives = productivite.rows[0]?.productives ?? 0;

		return {
			sourcesParDepartement: [...codes].sort((a, b) => a.localeCompare(b, "fr")).map((departement) => ({
				departement,
				sources: parDepartement.get(departement) ?? 0,
			})),
			sourcesParFamille: familles.rows.map((f) => ({ family: f.family, sources: Number(f.n) })),
			organisationsAvecDomaine: orgs.rows[0]?.n ?? 0,
			incidentsCorpus: incidents.rows[0]?.n ?? 0,
			sourcesProductives: productives,
			sourcesTotales: total,
			tauxSourcesProductives: total > 0 ? Math.round((productives / total) * 1000) / 10 : null,
			windowDays: WINDOW_DAYS,
		};
	});
}
