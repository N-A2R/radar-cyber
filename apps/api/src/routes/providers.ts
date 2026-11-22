import type { FastifyInstance } from "fastify";
import { loadProviderConcentration } from "../analyse/provider-concentration-store.js";
import { etagOu304 } from "../etag.js";

/**
 * GET /na/providers — digital provider map for Nouvelle-Aquitaine.
 *
 * Institutional domains and their public NS/MX records are open data. The
 * response never contains an organization name: the referential includes
 * individuals, so only identifiers, aggregates and map points are published.
 */
export default async function (app: FastifyInstance) {
	app.get("/na/providers", async (_req, reply) => {
		const report = await loadProviderConcentration();
		if (etagOu304(reply, report)) return;
		return report;
	});
}
