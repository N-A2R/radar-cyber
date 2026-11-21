/**
 * GET /couverture — chiffre de couverture publié et ses décompositions.
 *
 * Lecture anonyme : la mesure est déjà publique dans `docs/` et `bench/`.
 * Aucun accès base, aucun rejeu du gazetteer : la route sert la mesure figée
 * et son empreinte de corpus, donc deux appels donnent toujours la même chose.
 */
import type { FastifyInstance } from "fastify";
import { COUVERTURE_PUBLIQUE } from "../analyse/couverture-publique.js";
import { etagOu304 } from "../etag.js";

export default async function (app: FastifyInstance) {
	app.get("/couverture", async (_req, reply) => {
		if (etagOu304(reply, COUVERTURE_PUBLIQUE)) return;
		return COUVERTURE_PUBLIQUE;
	});
}
