/**
 * Registre des violations de données personnelles — export CSV mensuel public.
 *
 * Une ligne par violation du mois demandé, avec sa date de prise de
 * connaissance, son échéance des 72 heures, son statut et sa notification.
 * L'empreinte SHA-256 du fichier est renvoyée dans l'en-tête `X-Sha256` :
 * elle porte sur les octets exacts du corps, sans ligne de pied ajoutée.
 */
import type { FastifyInstance } from "fastify";
import { badRequest } from "../errors.js";
import { construireExport, moisCourant, verifierMois } from "../export/violations-rgpd.js";

export default async function (app: FastifyInstance) {
  app.get("/violations-rgpd/export.csv", async (req, reply) => {
    const fourni = (req.query as { mois?: unknown } | null)?.mois;
    const mois = fourni === undefined || fourni === null ? moisCourant() : String(fourni);
    try {
      verifierMois(mois);
    } catch {
      throw badRequest("mois invalide (attendu AAAA-MM)");
    }

    const exportMois = await construireExport(mois);
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${exportMois.fichier}"`);
    reply.header("Cache-Control", "no-store");
    reply.header("X-Sha256", exportMois.sha256);
    reply.header("X-Fichier", exportMois.fichier);
    reply.header("X-Lignes", String(exportMois.lignes));
    return reply.send(exportMois.corps);
  });
}
