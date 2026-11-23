/**
 * GET /api/na/hosting-outage — public aggregate result of the top-N provider
 * outage simulation for Nouvelle-Aquitaine.
 *
 * Only provider names and counters are returned: organization ids, names,
 * domains and victim records never leave the analysis layer.
 */
import type { FastifyInstance } from "fastify";
import {
	DEFAULT_OUTAGE_SIZE,
	MAX_OUTAGE_SIZE,
} from "../analyse/hosting-outage.js";
import { measureHostingOutage } from "../analyse/hosting-outage-store.js";

export default async function hostingOutageRoute(app: FastifyInstance): Promise<void> {
	app.get<{ Querystring: { outage?: string } }>("/na/hosting-outage", async (request, reply) => {
		const raw = request.query.outage;
		const outage = raw === undefined ? DEFAULT_OUTAGE_SIZE : Number(raw);
		if (!Number.isInteger(outage) || outage < 1 || outage > MAX_OUTAGE_SIZE) {
			return reply.code(400).send({
				error: {
					code: "INVALID_OUTAGE_SIZE",
					message: `outage must be an integer between 1 and ${MAX_OUTAGE_SIZE}`,
				},
			});
		}
		const measurement = await measureHostingOutage(outage);
		return {
			scope: measurement.scope,
			outageSize: measurement.outageSize,
			providers: measurement.providers,
			totals: {
				organizationsAffected: measurement.organizationsAffected,
				organizationsObserved: measurement.organizationsObserved,
				domainsObserved: measurement.domainsObserved,
				attributedDomains: measurement.attributedDomains,
				unknownHosts: measurement.unknownHosts,
				sumProviderOrganizations: measurement.sumProviderOrganizations,
				overlappingOrganizations: measurement.overlappingOrganizations,
			},
			baseline: measurement.baseline,
			corpus: measurement.corpus,
			measuredAt: measurement.measuredAt,
		};
	});
}
