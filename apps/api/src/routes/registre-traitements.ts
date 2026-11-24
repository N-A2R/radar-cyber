/**
 * Registre des traitements du corpus — export CSV public.
 *
 * Une ligne par source active : la déclaration (base légale, finalité, durée)
 * vient du registre, la portée géographique est calculée ici à partir des
 * champs de la source. Aucune donnée personnelle ne sort de cette route :
 * identifiants et noms de sources publiques, finalités et durées déclarées.
 */
import type { FastifyInstance } from "fastify";
import { ligneCsv } from "../security/csv.js";
import { query } from "../db.js";

const BASE_LEGALE = "Intérêt légitime : observatoire de la cybermenace (art. 6.1.f)";
const FINALITE_GENERIQUE = "Veille de sécurité : détection, qualification et documentation des incidents cyber";
const ENTETE_CSV = "source_id,source_nom,famille,portee,finalite,base_legale,duree_jours,declare_at,exporte_le\r\n";

type Ligne = {
  source_id: string;
  source_nom: string;
  famille: string;
  portee: string;
  finalite: string;
  base_legale: string;
  duree_jours: number;
  declare_at: string;
  exporte_le: string;
};

/** $1 = finalité de repli, $2 = base légale de référence, $3 = jour UTC d'export. */
const SQL_EXPORT = `
  SELECT s.id AS source_id,
         COALESCE(NULLIF(btrim(s.name), ''), s.id) AS source_nom,
         COALESCE(NULLIF(btrim(s.family), ''), 'autre') AS famille,
         CASE
           WHEN s.region = 'national' THEN 'nationale'
           WHEN s.department IS NOT NULL THEN 'locale'
           WHEN s.region IS NOT NULL THEN 'regionale'
           ELSE 'internationale'
         END AS portee,
         COALESCE(NULLIF(btrim(r.finalite), ''), $1) AS finalite,
         COALESCE(NULLIF(btrim(r.base_legale), ''), $2) AS base_legale,
         COALESCE(r.duree_jours, 90) AS duree_jours,
         to_char(COALESCE(r.declare_at, s.created_at, now()) AT TIME ZONE 'UTC',
                 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS declare_at,
         $3 AS exporte_le
    FROM source s
    LEFT JOIN registre_traitement r ON r.source_id = s.id
   WHERE s.enabled
   ORDER BY s.id ASC`;



export default async function (app: FastifyInstance) {
  /** Registre opposable du corpus : fichier daté, sans authentification. */
  app.get("/registre-traitements/export.csv", async (_req, reply) => {
    const exporteLe = new Date().toISOString().slice(0, 10);
    const result = await query<Ligne>(SQL_EXPORT, [FINALITE_GENERIQUE, BASE_LEGALE, exporteLe]);
    const corps = result.rows.map((ligne) => ligneCsv([
      ligne.source_id, ligne.source_nom, ligne.famille, ligne.portee, ligne.finalite,
      ligne.base_legale, ligne.duree_jours, ligne.declare_at, ligne.exporte_le,
    ])).join("");


    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="registre_traitements_${exporteLe}.csv"`);
    reply.header("Cache-Control", "no-store");
    return reply.send(ENTETE_CSV + corps);
  });
}
