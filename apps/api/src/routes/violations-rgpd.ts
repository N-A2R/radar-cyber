/**
 * Registre des violations de données personnelles.
 *
 * L'export CSV mensuel reste public ; le suivi opérationnel est réservé aux
 * comptes (analyste pour qualifier/notifier, admin pour clôturer). Aucune
 * donnée de victime ne transite : identifiants publics, dates et statut.
 */
import type { FastifyInstance } from "fastify";
import { badRequest } from "../errors.js";
import { construireExport, moisCourant, verifierMois } from "../export/violations-rgpd.js";
import {
  cloturerViolation,
  lireViolation,
  listerViolations,
  notifierViolation,
  qualifierViolation,
  statistiquesViolations,
  type StatutViolation,
} from "../domain/violations-rgpd.js";
import { z } from "zod";
import { parseBody, invalidBody } from "./body-validation.js";

const STATUTS: StatutViolation[] = ["suspectee", "qualifiee", "notifiee", "close"];
const QualificationBody = z.strictObject({ motif: z.string().trim().max(1000).optional() });
const NotificationBody = z.strictObject({
  destinataire: z.string().trim().min(1).max(200),
  reference: z.string().trim().max(200).optional(),
});
const ClotureBody = z.strictObject({ motif: z.string().trim().max(1000).optional() });

function identifiant(brut: string): number {
  const id = Number(brut);
  if (!Number.isInteger(id) || id <= 0) throw badRequest("identifiant invalide");
  return id;
}

function acteurDe(req: { user?: { email: string } }): string {
  return `compte:${req.user?.email ?? "inconnu"}`;
}

function nombre(brut: unknown): number | undefined {
  if (brut === undefined) return undefined;
  const valeur = Number(brut);
  return Number.isInteger(valeur) && valeur >= 0 ? valeur : undefined;
}

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

  /** Suivi interne : statut, échéance et compteur d'échéances dépassées. */
  app.get("/violations-rgpd", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const statut = STATUTS.find((s) => s === q.statut);
    const retard = q.enRetard === "true" ? true : q.enRetard === "false" ? false : undefined;
    return listerViolations({
      statut,
      enRetard: retard,
      limite: nombre(q.limite) ?? 50,
      offset: nombre(q.offset) ?? 0,
    });
  });

  app.get("/violations-rgpd/stats", async () => statistiquesViolations());

  app.get<{ Params: { id: string } }>("/violations-rgpd/:id", async (req) => lireViolation(identifiant(req.params.id)));

  app.post<{ Params: { id: string } }>("/violations-rgpd/:id/qualification", async (req, reply) => {
    const parsed = parseBody(QualificationBody, req.body);
    if (!parsed.success) return invalidBody(reply, parsed.error);
    return qualifierViolation(identifiant(req.params.id), acteurDe(req), parsed.data.motif ?? null);
  });

  app.post<{ Params: { id: string } }>("/violations-rgpd/:id/notification", async (req, reply) => {
    const parsed = parseBody(NotificationBody, req.body);
    if (!parsed.success) return invalidBody(reply, parsed.error);
    return notifierViolation(
      identifiant(req.params.id), acteurDe(req), parsed.data.destinataire, parsed.data.reference ?? null,
    );
  });

  app.post<{ Params: { id: string } }>("/violations-rgpd/:id/cloture", async (req, reply) => {
    const parsed = parseBody(ClotureBody, req.body);
    if (!parsed.success) return invalidBody(reply, parsed.error);
    return cloturerViolation(identifiant(req.params.id), acteurDe(req), parsed.data.motif ?? null);
  });
}
