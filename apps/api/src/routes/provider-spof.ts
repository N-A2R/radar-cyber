/**
 * GET /api/na/provider-spof — public list of digital providers whose outage
 * would affect more than 100 Nouvelle-Aquitaine organizations.
 *
 * The response is aggregate-only: organization identifiers, names and domains
 * never leave the database.
 */
import type { FastifyInstance } from "fastify";
import { SPOF_THRESHOLD } from "../analyse/provider-spof.js";
import { measureProviderSpof } from "../analyse/provider-spof-store.js";

export default async function providerSpofRoute(app: FastifyInstance): Promise<void> {
	app.get<{ Querystring: { threshold?: string } }>("/na/provider-spof", async (request, reply) => {
		const raw = request.query.threshold;
		const threshold = raw === undefined ? SPOF_THRESHOLD : Number(raw);
		if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100_000) {
			return reply.code(400).send({
				error: { code: "INVALID_THRESHOLD", message: "threshold must be an integer between 1 and 100000" },
			});
		}
		const measurement = await measureProviderSpof(threshold);
		return {
			scope: measurement.scope,
			threshold: measurement.threshold,
			providers: measurement.providers,
			totals: {
				organizationsObserved: measurement.organizationsObserved,
				organizationsAttributed: measurement.organizationsAttributed,
				domainsObserved: measurement.domainsObserved,
				unknownHosts: measurement.unknownHosts,
			},
			baseline: measurement.baseline,
			measuredAt: measurement.measuredAt,
		};
	});
}
