/**
 * Public counter for SIRET establishments linked to an active headquarters.
 * Read-only: the backfill runs as a separate, explicit script.
 */
import type { FastifyInstance } from "fastify";
import { countSiretEstablishments } from "../referentiel/siret-establishments.js";

export default async function siretEstablishmentsRoute(app: FastifyInstance): Promise<void> {
	app.get("/siret/establishments/count", async () => ({
		region: "Nouvelle-Aquitaine",
		...(await countSiretEstablishments()),
	}));
}
