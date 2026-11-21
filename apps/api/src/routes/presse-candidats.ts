/**
 * File de revue des candidats incidents cyber extraits de la presse.
 *
 * La file est distincte de `/review/*` (quarantaine des rattachements) : ici on
 * décide si un article est un incident, pas à quelle organisation le rattacher.
 * Les décisions sont append-only dans `presse_candidat_decision` et dans le
 * journal ; la projection `presse_candidat.etat` se recalcule par le rejeu.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../errors.js";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { enLigne, enregistrerDecisionPresse, type LigneFile } from "../corpus/decision-presse.js";

const ListeQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  statut: z.enum(["en_attente", "confirme", "refuse", "reclasse"]).default("en_attente"),
  passe: z.string().trim().max(100).optional(),
});

const FiltreQuery = z.object({
  cle: z.string().trim().max(100).optional(),
  passe: z.string().trim().max(100).optional(),
});

const DecisionBody = z.object({
  decision: z.enum(["confirmer", "refuser", "reclasser"]),
  raison: z.string().trim().min(1).max(500),
  orgRetenue: z.string().trim().min(1).max(300).optional(),
  passe: z.string().trim().min(1).max(100).default("defaut"),
}).strict().refine(
  (body) => body.decision !== "reclasser" || body.orgRetenue !== undefined,
  { message: "orgRetenue requis pour reclasser", path: ["orgRetenue"] },
);

async function statistiques(passe?: string) {
  const r = await query<{ etat: string; total: string }>(
    `SELECT etat, count(*)::text AS total FROM presse_candidat GROUP BY etat`,
  );
  const comptes: Record<string, number> = {
    en_attente: 0, confirme: 0, refuse: 0, reclasse: 0,
  };
  for (const row of r.rows) comptes[row.etat] = Number(row.total);

  const traites = comptes.confirme + comptes.refuse + comptes.reclasse;
  const decisions = passe
    ? await query<{ decision: string; total: string }>(
        `SELECT decision, count(*)::text AS total FROM presse_candidat_decision
          WHERE passe = $1 GROUP BY decision`, [passe],
      )
    : await query<{ decision: string; total: string }>(
        `SELECT decision, count(*)::text AS total FROM presse_candidat_decision GROUP BY decision`,
      );
  const parDecision: Record<string, number> = { confirmer: 0, refuser: 0, reclasser: 0 };
  for (const row of decisions.rows) parDecision[row.decision] = Number(row.total);
  const observes = parDecision.confirmer + parDecision.refuser + parDecision.reclasser;

  return {
    enAttente: comptes.en_attente,
    confirme: comptes.confirme,
    refuse: comptes.refuse,
    reclasse: comptes.reclasse,
    traites,
    // Le taux porte sur les décisions de la passe demandée, pas sur le stock
    // global : c'est ce qui permet de comparer deux passes entre elles.
    traitesDansPasse: observes,
    tauxConfirmation: observes === 0 ? null : Math.round((parDecision.confirmer / observes) * 1000) / 10,
    passe: passe ?? "toutes",
  };
}

export default async function (app: FastifyInstance) {
  const ecriture = rateLimit({ max: 120, windowMs: 60_000 });

  app.get("/presse/candidats", { preHandler: requireAuth() }, async (req) => {
    const parsed = ListeQuery.safeParse(req.query ?? {});
    if (!parsed.success) throw badRequest("invalid input");
    const { limit, offset, passe } = parsed.data;
    // Une passe est une lecture historique : sans filtre explicite, on y voit
    // les candidats décidés ; la file, elle, montre les en attente.
    const statut = parsed.data.statut ?? (passe ? undefined : "en_attente");

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (statut) {
      params.push(statut);
      conditions.push(`c.etat = $${params.length}`);
    }
    if (passe) {
      params.push(passe);
      conditions.push(`EXISTS (SELECT 1 FROM presse_candidat_decision d
                              WHERE d.cle = c.cle AND d.passe = $${params.length})`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);
    const rows = await query<LigneFile>(
      `SELECT c.* FROM presse_candidat c ${where}
        ORDER BY c.score_confiance DESC, c.date_publication DESC NULLS LAST, c.cle
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = await query<{ total: string }>(
      `SELECT count(*)::text AS total FROM presse_candidat c ${where}`,
      params.slice(0, -2),
    );
    return {
      rows: rows.rows.map(enLigne),
      total: Number(total.rows[0]?.total ?? 0),
      limit, offset,
      statistiques: await statistiques(passe),
    };
  });

  app.get("/presse/candidats/stats", { preHandler: requireAuth() }, async (req) => {
    const parsed = FiltreQuery.safeParse(req.query ?? {});
    if (!parsed.success) throw badRequest("invalid input");
    return statistiques(parsed.data.passe);
  });

  app.get("/presse/candidats/decisions", { preHandler: requireAuth() }, async (req) => {
    const parsed = FiltreQuery.safeParse(req.query ?? {});
    if (!parsed.success) throw badRequest("invalid input");
    const { cle, passe } = parsed.data;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (cle) {
      params.push(cle);
      conditions.push(`cle = $${params.length}`);
    }
    if (passe) {
      params.push(passe);
      conditions.push(`passe = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await query(
      `SELECT id, cle, passe, decision, auteur, horodatage, raison, org_retenue, avant, apres
         FROM presse_candidat_decision ${where} ORDER BY id`,
      params,
    );
    return { rows: rows.rows };
  });

  /** Rejeu : replie les décisions dans l'ordre et compare à la projection. */
  app.get("/presse/candidats/replay", { preHandler: requireAuth() }, async () => {
    const candidats = await query<{ cle: string; etat: string; org_retenue: string | null; score_confiance: number }>(
      `SELECT cle, etat, org_retenue, score_confiance FROM presse_candidat`,
    );
    const decisions = await query<{
      cle: string; decision: string; org_retenue: string | null; passe: string;
      auteur: string; horodatage: string;
    }>(`SELECT cle, decision, org_retenue, passe, auteur, horodatage
          FROM presse_candidat_decision ORDER BY id`);

    const rejoue = new Map<string, { etat: string; orgRetenue: string | null }>();
    for (const d of decisions.rows) {
      rejoue.set(d.cle, {
        etat: d.decision === "confirmer" ? "confirme" : d.decision === "refuser" ? "refuse" : "reclasse",
        orgRetenue: d.org_retenue,
      });
    }
    const divergences: Array<{ cle: string; projete: string; rejoue: string }> = [];
    for (const c of candidats.rows) {
      const etatRejoue = rejoue.get(c.cle)?.etat ?? "en_attente";
      const orgRejouee = rejoue.get(c.cle)?.orgRetenue ?? null;
      if (etatRejoue !== c.etat || orgRejouee !== c.org_retenue) {
        divergences.push({ cle: c.cle, projete: `${c.etat}/${c.org_retenue}`, rejoue: `${etatRejoue}/${orgRejouee}` });
      }
    }
    return {
      coherent: divergences.length === 0,
      candidats: candidats.rows.length,
      decisions: decisions.rows.length,
      divergences,
    };
  });

  app.post<{ Params: { cle: string } }>(
    "/presse/candidats/:cle/decision",
    { preHandler: [ecriture, requireAuth()] },
    async (req) => {
      const parsed = DecisionBody.safeParse(req.body ?? {});
      if (!parsed.success) throw badRequest("invalid input");
      const { decision, raison, passe } = parsed.data;
      const auteur = `humain:${req.user!.email}`;
      const cle = req.params.cle.slice(0, 100);

      const result = await enregistrerDecisionPresse({
        cle,
        decision,
        raison,
        passe,
        auteur,
        orgRetenue: parsed.data.orgRetenue,
      });

      return { ok: true, candidat: result };
    },
  );
}
