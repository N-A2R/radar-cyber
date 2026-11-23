import type { FastifyInstance } from "fastify";
import { chargerFichesQualifieesCourantes } from "../qualification/store.js";
import { etagOu304 } from "../etag.js";

/**
 * GET /na/prestataires-qualifies — public fiches for providers qualified by
 * the ANSSI catalogue in the Nouvelle-Aquitaine dossier. Every fiche carries
 * the decision reference, validity dates and the dated national extract.
 */
export default async function (app: FastifyInstance) {
	app.get("/na/prestataires-qualifies", async (_req, reply) => {
		const fiches = await chargerFichesQualifieesCourantes();
		const reponse = {
			sourcePortee: "nationale",
			total: fiches.length,
			fiches,
		};
		if (etagOu304(reply, reponse)) return;
		return reponse;
	});
}
