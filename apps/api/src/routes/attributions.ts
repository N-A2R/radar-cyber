/**
 * Attribution des revendications : lecture publique, contestation analyste.
 *
 * Le groupe affiché vient de `attribution`, jamais du champ libre de collecte.
 * Les lignes exposées ne contiennent ni victime, ni indice, ni identité de
 * personne : `auteur` est un rôle et `motif` un code stable.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { badRequest, notFound } from "../errors.js";
import { parseBody, invalidBody } from "./body-validation.js";

const ListeQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const HistoriqueQuery = z.strictObject({
  claimId: z.coerce.number().int().positive(),
});

const ClaimParams = z.strictObject({ claimId: z.coerce.number().int().positive() });

const ContestationBody = z.strictObject({
  groupe: z.string().trim().min(1).max(160),
  codeAdmiralty: z.string().trim().regex(/^[A-Fa-f][1-6]$/, "code Admiralty invalide"),
  motif: z.enum(["preuve-nouvelle", "groupe-errone", "confiance-a-revoir", "autre"]),
});

type AttributionRow = {
  claim_id: string;
  groupe: string;
  code_admiralty: string;
  evidence_url: string | null;
  auteur: string;
  updated_at: string;
};

type AuditRow = {
  id: string;
  operation: string;
  groupe_avant: string | null;
  groupe_apres: string | null;
  code_avant: string | null;
  code_apres: string | null;
  auteur: string;
  motif: string | null;
  horodatage: string;
};

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest("invalid input", result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })));
  }
  return result.data;
}

function publique(row: AttributionRow) {
  return {
    claimId: Number(row.claim_id),
    groupe: row.groupe,
    codeAdmiralty: row.code_admiralty,
    evidenceUrl: row.evidence_url,
    auteur: row.auteur,
    updatedAt: row.updated_at,
  };
}

export default async function attributionsRoute(app: FastifyInstance): Promise<void> {
  app.get("/attributions", async (req) => {
    const { limit, offset } = parse(ListeQuery, req.query);
    const [lignes, total] = await Promise.all([
      query<AttributionRow>(
        `SELECT claim_id::text, groupe, code_admiralty, evidence_url, auteur, updated_at
           FROM attribution
          ORDER BY claim_id
          LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      query<{ total: string }>("SELECT count(*)::text AS total FROM attribution"),
    ]);
    return {
      total: Number(total.rows[0]?.total ?? 0),
      limit,
      offset,
      attributions: lignes.rows.map(publique),
    };
  });

  app.get("/attributions/historique", async (req) => {
    const { claimId } = parse(HistoriqueQuery, req.query);
    const lignes = await query<AuditRow>(
      `SELECT id::text, operation, groupe_avant, groupe_apres, code_avant, code_apres,
              auteur, motif, horodatage
         FROM attribution_audit
        WHERE claim_id = $1
        ORDER BY horodatage DESC, id DESC
        LIMIT 100`,
      [claimId],
    );
    return {
      claimId,
      historique: lignes.rows.map((row) => ({
        id: Number(row.id),
        operation: row.operation,
        groupeAvant: row.groupe_avant,
        groupeApres: row.groupe_apres,
        codeAvant: row.code_avant,
        codeApres: row.code_apres,
        auteur: row.auteur,
        motif: row.motif,
        horodatage: row.horodatage,
      })),
    };
  });

  app.patch("/attributions/:claimId", async (req, reply) => {
    const { claimId } = parse(ClaimParams, req.params);
    const corps = parseBody(ContestationBody, req.body);
    if (!corps.success) return invalidBody(reply, corps.error);

    const existe = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM attribution WHERE claim_id = $1",
      [claimId],
    );
    if (existe.rows[0]?.n !== 1) throw notFound(`attribution inconnue pour ${claimId}`);

    // `req.user.role` est un rôle applicatif, jamais un courriel ni un identifiant
    // de compte : l'audit reste sans donnée personnelle.
    const auteur = req.user?.role ?? "analyste";
    await withTransaction(async (client) => {
      await client.query(
        "SELECT contester_attribution($1, $2, $3, $4, $5)",
        [claimId, corps.data.groupe, corps.data.codeAdmiralty.toUpperCase(), auteur, corps.data.motif],
      );
    });

    const misAJour = await query<AttributionRow>(
      `SELECT claim_id::text, groupe, code_admiralty, evidence_url, auteur, updated_at
         FROM attribution WHERE claim_id = $1`,
      [claimId],
    );
    return publique(misAJour.rows[0]!);
  });
}
