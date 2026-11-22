/**
 * GET /api/risk/organisations — published ROC curve and AUC.
 * GET /api/risk/organisations/:id — score for one Nouvelle-Aquitaine organisation.
 *
 * Responses carry numeric aggregates only. Victim names, claim text and free
 * text are never read or returned: the score is computed from public metadata
 * and the model published by scripts/mesure-risque-organisation.mts.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { riskProbability, riskScore } from "../analyse/organisation-risk.js";
import {
	loadRiskReport,
	riskSignalsFromRow,
	RISK_NA_DEPARTMENTS,
	type RiskSignalRow,
} from "../analyse/organisation-risk-report.js";
import { query } from "../db.js";
import { notFound } from "../errors.js";

const Params = z.object({ id: z.coerce.number().int().positive() });

const SIGNALS_SQL = `
  SELECT coalesce(a.ambient_events, 0)::int AS ambient_events,
         coalesce(a.ambient_sources, 0)::int AS ambient_sources,
         coalesce(a.max_severity, 0)::int AS max_severity,
         a.days_ago,
         CASE WHEN o.website IS NOT NULL OR o.domain IS NOT NULL THEN 1 ELSE 0 END::int AS has_public_domain,
         CASE WHEN o.secteur_groupe = 'services' THEN 1 ELSE 0 END::int AS is_services,
         CASE WHEN o.secteur_groupe = 'commerce' THEN 1 ELSE 0 END::int AS is_commerce,
         CASE WHEN o.secteur_groupe = 'construction' THEN 1 ELSE 0 END::int AS is_construction,
         CASE WHEN o.secteur_groupe = 'sante' THEN 1 ELSE 0 END::int AS is_sante,
         CASE WHEN o.secteur_groupe = 'industrie' THEN 1 ELSE 0 END::int AS is_industrie
    FROM org o
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS ambient_events,
             count(DISTINCT e.source_id)::int AS ambient_sources,
             coalesce(max(e.severity), 0)::int AS max_severity,
             max(greatest(0, date_part('day', $2::date - COALESCE(e.observed_at, e.collected_at))))::int AS days_ago
        FROM event e
       WHERE e.org_id = o.id
         AND e.assertion_type <> 'third_party_claim'
         AND e.family NOT IN ('ransomware', 'leaks')
    ) a ON true
   WHERE o.id = $1 AND o.dept = ANY($3)
`;

export default async function organisationRiskRoute(app: FastifyInstance): Promise<void> {
	app.get("/risk/organisations", async () => {
		const report = loadRiskReport();
		return {
			generatedAt: report.generatedAt,
			command: report.command,
			definitions: report.definitions,
			snapshot: report.snapshot,
			population: report.population,
			cohort: report.cohort,
			evaluation: report.evaluation,
		};
	});

	app.get("/risk/organisations/:id", async (request) => {
		const { id } = Params.parse(request.params);
		const report = loadRiskReport();
		const { rows } = await query<RiskSignalRow>(SIGNALS_SQL, [
			id,
			report.referenceDate,
			[...RISK_NA_DEPARTMENTS],
		]);
		const row = rows[0];
		if (!row) throw notFound("organisation not found in Nouvelle-Aquitaine risk scope");
		const signals = riskSignalsFromRow(row);
		return {
			orgId: id,
			score: riskScore(signals, report.model),
			probability: riskProbability(signals, report.model),
			signals,
			model: { generatedAt: report.generatedAt, auc: report.evaluation.auc },
		};
	});
}
