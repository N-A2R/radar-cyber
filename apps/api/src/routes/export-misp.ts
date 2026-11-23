/**
 * GET /export/misp — flux MISP des signaux diffusables.
 *
 * Exposé à la racine (`/export/misp`) pour le partenaire qui importe le flux,
 * et sous les deux alias API (`/api/export/misp`, `/api/v1/export/misp`).
 * Filtres facultatifs : `limit` (1–5000, défaut 1000), `since` / `until`
 * (ISO 8601, fenêtre d'occurrence), `source` et `regional` (`true`/`false`).
 *
 * Toute réponse réussie écrit une ligne `export_run` et une ligne
 * `export_scellement` : le partenaire peut vérifier le SHA-256 du corps reçu
 * et revérifier le jeton RFC 3161 joint aux en-têtes.
 */
import type { FastifyInstance } from "fastify";
import { badRequest } from "../errors.js";
import { exportMisp, MAX_MISP_LIMIT } from "../export/misp.js";
import { appliquerEnTetes, scellerExport, scellementHttpActif } from "../export/scellement.js";

export default async function (app: FastifyInstance) {
	app.get("/export/misp", async (req, reply) => {
		const q = req.query as Record<string, string | undefined>;

		let limit: number | undefined;
		if (q.limit !== undefined) {
			limit = Number(q.limit);
			if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MISP_LIMIT) {
				throw badRequest(`limit doit être un entier entre 1 et ${MAX_MISP_LIMIT}`);
			}
		}

		let since: Date | null = null;
		if (q.since !== undefined && q.since !== "") {
			since = new Date(q.since);
			if (Number.isNaN(since.getTime())) {
				throw badRequest("since doit être une date ISO 8601");
			}
		}
		let until: Date | null = null;
		if (q.until !== undefined && q.until !== "") {
			until = new Date(q.until);
			if (Number.isNaN(until.getTime())) {
				throw badRequest("until doit être une date ISO 8601");
			}
		}

		let regional: boolean | null = null;
		if (q.regional !== undefined) {
			if (q.regional === "true") regional = true;
			else if (q.regional === "false") regional = false;
			else throw badRequest("regional doit valoir true ou false");
		}

		const resultat = await exportMisp({
			limit,
			since,
			source: q.source ?? null,
			regional,
			until,
		});
		// Le jeton couvre exactement les octets envoyés : il est obtenu avant
		// la publication et la réponse échoue si la TSA ne répond pas.
		if (scellementHttpActif()) {
			const scellement = await scellerExport({
				reference: "/export/misp",
				format: "misp-json",
				contenu: resultat.body,
			});
			appliquerEnTetes((nom, valeur) => reply.header(nom, valeur), scellement);
		}
		reply.header("Content-Type", "application/json; charset=utf-8");
		reply.header("Content-Disposition", 'inline; filename="radar-signals.misp.json"');
		reply.header("Cache-Control", "no-store");
		reply.header("X-Export-Sha256", resultat.run.sha256);
		return reply.send(resultat.body);
	});
}
