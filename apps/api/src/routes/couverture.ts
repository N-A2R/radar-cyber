/**
 * GET /couverture — chiffre de couverture publié et ses décompositions.
 *
 * Lecture anonyme : la mesure est déjà publique dans `docs/` et `bench/`.
 * Aucun accès base, aucun rejeu du gazetteer : la route sert la mesure figée
 * et son empreinte de corpus, donc deux appels donnent toujours la même chose.
 * Le verdict des seuils est servi en tête de réponse (`publiable`, `raison`)
 * et détaillé sous `publication` : un chiffre refusé n'est pas présenté comme
 * publiable, même s'il reste calculable et documenté avec ses preuves.
 */
import type { FastifyInstance } from "fastify";
import { COUVERTURE_PUBLIQUE } from "../analyse/couverture-publique.js";
import { etagOu304 } from "../etag.js";

export default async function (app: FastifyInstance) {
	app.get("/couverture", async (_req, reply) => {
		const { publiable, mention, raison } = COUVERTURE_PUBLIQUE.publication;
		const corps = { ...COUVERTURE_PUBLIQUE, publiable, mention, raison };
		if (etagOu304(reply, corps)) return;
		return corps;
	});
}
