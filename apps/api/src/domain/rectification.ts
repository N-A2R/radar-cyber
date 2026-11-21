/**
 * Droit de réponse : une organisation nommée demande la rectification d'une
 * information publiée sur sa fiche.
 *
 * Deux garanties centrales :
 *   1. aucune publication n'est automatique — la demande est reçue, puis un
 *      administrateur décide, et chaque décision est un fait daté ;
 *   2. une demande sans trace dans le journal de vérité n'existe pas —
 *      l'écriture du journal et celle de la projection sont dans la même
 *      transaction, un échec du journal annule la demande.
 *
 * Le texte publié est celui que l'organisation a envoyé. Le motif de la
 * décision administrative est affiché avec, sans jamais réécrire le message.
 */
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { consignerAvec } from "../journal/index.js";
import { conflict, notFound, unprocessable } from "../errors.js";
import { empreinteAudit } from "../security/access-log.js";
import type { AuthUser } from "../middleware/auth.js";

export const MOTIFS = ["inexactitude", "omission", "suppression", "autre"] as const;
export const STATUTS = ["recu", "en_instruction", "publiee", "refusee"] as const;
export type StatutRectification = (typeof STATUTS)[number];

export const DemandeRectificationSchema = z.object({
  orgId: z.number().int().positive(),
  organisation: z.string().trim().min(2).max(200),
  contactNom: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().max(200).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "email invalide"),
  domaine: z.string().trim().max(200).optional(),
  motif: z.enum(MOTIFS),
  message: z.string().trim().min(20, "20 caractères minimum").max(3000),
  pieceJointeRef: z.string().trim().max(300).optional(),
});
export type DemandeRectificationInput = z.infer<typeof DemandeRectificationSchema>;

export const DecisionRectificationSchema = z.object({
  decision: z.enum(["en_instruction", "publiee", "refusee"]),
  motif: z.string().trim().max(1000).optional(),
}).refine(
  (v) => v.decision === "en_instruction" || (v.motif !== undefined && v.motif.trim().length >= 5),
  { message: "un motif d'au moins 5 caractères est requis pour publier ou refuser", path: ["motif"] },
);
export type DecisionRectificationInput = z.infer<typeof DecisionRectificationSchema>;

type DemandeRow = {
  id: number;
  reference: string;
  org_id: number;
  organisation: string;
  contact_nom: string | null;
  email: string;
  domaine: string | null;
  motif: string;
  message: string;
  piece_jointe_ref: string | null;
  moyen_verification: string;
  statut: StatutRectification;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

type EvenementRow = {
  id: number;
  statut: string;
  motif: string | null;
  acteur: string;
  created_at: string;
};

export type DemandeVue = {
  id: number;
  reference: string;
  orgId: number;
  organisation: string;
  motif: string;
  message: string;
  statut: StatutRectification;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  historique: { statut: string; motif: string | null; acteur: string; date: string }[];
};

export type RectificationPubliee = {
  id: number;
  reference: string;
  organisation: string;
  motif: string;
  message: string;
  publishedAt: string | null;
  decisionMotif: string | null;
};

function normaliser(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type MoyenVerification = "nom" | "alias" | "domaine";

/** Le nom déclaré doit désigner la fiche visée : nom, alias actif ou domaine officiel. */
function moyendeVerification(
  organisation: string,
  org: { name: string; domain: string | null; website: string | null },
  aliases: string[],
  domaine: string | undefined,
): MoyenVerification | null {
  const declare = normaliser(organisation);
  if (declare === normaliser(org.name)) return "nom";
  if (aliases.some((alias) => normaliser(alias) === declare)) return "alias";
  if (domaine) {
    const normalise = (v: string) => normaliser(v.replace(/^https?:\/\//, "").replace(/^www\./, ""));
    if ([org.domain, org.website].some((v) => v !== null && normalise(v) === normalise(domaine))) {
      return "domaine";
    }
  }
  return null;
}

function acteurDemandeur(user: AuthUser | null, email: string): string {
  return user ? `humain:${user.email}` : `demandeur:${empreinteAudit(email).slice(0, 12)}`;
}

/** Le journal de vérité n'expose pas d'e-mail : identifiant pseudonyme. */
function acteurJournalDemandeur(user: AuthUser | null, email: string): string {
  return user ? `compte:${empreinteAudit(user.email).slice(0, 12)}` : `demandeur:${empreinteAudit(email).slice(0, 12)}`;
}

function vue(row: DemandeRow, evenements: EvenementRow[]): DemandeVue {
  return {
    id: row.id,
    reference: row.reference,
    orgId: row.org_id,
    organisation: row.organisation,
    motif: row.motif,
    message: row.message,
    statut: row.statut,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.closed_at,
    historique: evenements.map((e) => ({
      statut: e.statut,
      motif: e.motif,
      acteur: e.acteur,
      date: e.created_at,
    })),
  };
}

/** Un runner transactionnel ou le pool : même contrat, une seule lecture. */
type SqlRunner = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

async function evenementsDe(run: SqlRunner, demandeId: number): Promise<EvenementRow[]> {
  const r = await run(
    `SELECT id, statut, motif, acteur, created_at::text AS created_at
       FROM droit_reponse_evenement WHERE demande_id=$1 ORDER BY created_at, id`,
    [demandeId],
  );
  return (r.rows ?? []) as EvenementRow[];
}

/** Crée une demande reçue. Ne publiant rien, elle est ouverte à tous (débit limité). */
export async function creerDemande(
  input: DemandeRectificationInput,
  contexte: { user: AuthUser | null; ip: string },
): Promise<DemandeVue> {
  const orgRes = await query<{ id: number; name: string; domain: string | null; website: string | null }>(
    "SELECT id, name, domain, website FROM org WHERE id=$1 AND valid_to IS NULL",
    [input.orgId],
  );
  const org = orgRes.rows[0];
  if (!org) throw notFound("organisation inconnue");

  const aliasRes = await query<{ alias: string }>(
    "SELECT alias FROM org_alias WHERE org_id=$1 AND status='active' AND valid_to IS NULL",
    [input.orgId],
  );
  const moyen = moyendeVerification(input.organisation, org, aliasRes.rows.map((r) => r.alias), input.domaine);
  if (!moyen) {
    throw unprocessable(
      "le nom déclaré ne correspond ni au nom, ni à un alias, ni au domaine de l'organisation visée",
      { organisation: input.organisation, orgId: input.orgId },
      "NOM_ORG_INCOHERENT",
    );
  }

  const acteur = acteurDemandeur(contexte.user, input.email);
  const acteurJournal = acteurJournalDemandeur(contexte.user, input.email);
  const demande = await withTransaction(async (client) => {
    const ins = await client.query<DemandeRow>(
      `INSERT INTO droit_reponse
         (reference, org_id, organisation, contact_nom, email, domaine, motif, message,
          piece_jointe_ref, moyen_verification, demandeur_user_id, ip_hash)
       VALUES ('DR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('droit_reference_seq')::text, 6, '0'),
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, reference, org_id, organisation, contact_nom, email, domaine, motif, message,
                 piece_jointe_ref, moyen_verification, statut,
                 created_at::text AS created_at, updated_at::text AS updated_at, closed_at::text AS closed_at`,
      [
        org.id, input.organisation, input.contactNom ?? null, input.email.toLowerCase(),
        input.domaine ?? null, input.motif, input.message, input.pieceJointeRef ?? null,
        moyen, contexte.user?.id ?? null, empreinteAudit(contexte.ip),
      ],
    );
    const row = ins.rows[0]!;

    await client.query(
      `INSERT INTO droit_reponse_evenement (demande_id, statut, motif, acteur, payload)
       VALUES ($1,'recu',NULL,$2,$3::jsonb)`,
      [row.id, acteur, JSON.stringify({ moyenVerification: moyen, source: contexte.user ? "compte" : "public" })],
    );

    const trace = await consignerAvec(
      (text, params) => client.query(text, params as unknown[]),
      {
        kind: "droit_reponse.demande",
        subject: `droit-reponse:${row.reference}`,
        summary: `Demande de rectification ${row.reference} reçue pour ${row.organisation} (${row.motif})`,
        actor: acteurJournal,
        payload: {
          reference: row.reference, orgId: org.id, motif: row.motif, moyenVerification: moyen,
          contactHash: empreinteAudit(input.email).slice(0, 12),
        },
      },
    );
    if (!trace.ok) {
      // Sans journal, la demande n'a pas de traçabilité opposable : on annule.
      throw new Error(`journal indisponible : ${trace.error}`);
    }
    return vue(row, await evenementsDe((text, params) => client.query(text, params), row.id));
  });
  return demande;
}

/** Liste filtrée pour l'instruction (analystes et administrateurs). */
export async function listerDemandes(options: {
  statut?: StatutRectification;
  orgId?: number;
  limite?: number;
  offset?: number;
} = {}): Promise<{ items: DemandeVue[]; total: number; limite: number; offset: number }> {
  const conditions: string[] = [];
  const valeurs: unknown[] = [];
  if (options.statut) {
    valeurs.push(options.statut);
    conditions.push(`statut = $${valeurs.length}`);
  }
  if (options.orgId !== undefined) {
    valeurs.push(options.orgId);
    conditions.push(`org_id = $${valeurs.length}`);
  }
  const ou = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limite = Math.min(Math.max(options.limite ?? 50, 1), 200);
  const offset = Math.min(Math.max(options.offset ?? 0, 0), 1_000_000);
  const [rows, total] = await Promise.all([
    query<DemandeRow>(
      `SELECT * FROM droit_reponse ${ou} ORDER BY created_at DESC, id DESC LIMIT $${valeurs.length + 1} OFFSET $${valeurs.length + 2}`,
      [...valeurs, limite, offset],
    ),
    query<{ n: number }>(`SELECT count(*)::int AS n FROM droit_reponse ${ou}`, valeurs),
  ]);
  const items: DemandeVue[] = [];
  for (const row of rows.rows ?? []) {
    items.push(vue(row, await evenementsDe(query, row.id)));
  }
  return { items, total: total.rows[0]?.n ?? 0, limite, offset };
}

export async function lireDemande(id: number): Promise<DemandeVue> {
  const r = await query<DemandeRow>("SELECT * FROM droit_reponse WHERE id=$1", [id]);
  const row = r.rows[0];
  if (!row) throw notFound("demande de rectification inconnue");
  return vue(row, await evenementsDe(query, id));
}

/** Décision d'instruction, de publication ou de refus. Les décisions ne s'écrasent pas. */
export async function deciderDemande(
  id: number,
  input: DecisionRectificationInput,
  user: AuthUser,
): Promise<DemandeVue> {
  return withTransaction(async (client) => {
    const selection = await client.query<DemandeRow>(
      "SELECT * FROM droit_reponse WHERE id=$1 FOR UPDATE OF droit_reponse",
      [id],
    );
    const row = selection.rows[0];
    if (!row) throw notFound("demande de rectification inconnue");
    if (row.statut === "publiee" || row.statut === "refusee") {
      throw conflict("cette demande est déjà clôturée", { statut: row.statut }, "DEMANDE_CLOTUREE");
    }
    if (row.statut === "en_instruction" && input.decision === "en_instruction") {
      throw conflict("cette demande est déjà en instruction", { statut: row.statut }, "DEMANDE_DEJA_EN_INSTRUCTION");
    }

    const acteur = `humain:${user.email}`;
    const acteurJournal = `compte:${empreinteAudit(user.email).slice(0, 12)}`;
    const maj = await client.query<DemandeRow>(
      `UPDATE droit_reponse
          SET statut=$2,
              closed_at=CASE WHEN $2 IN ('publiee','refusee') THEN now() ELSE closed_at END
        WHERE id=$1
        RETURNING *, created_at::text AS created_at, updated_at::text AS updated_at, closed_at::text AS closed_at`,
      [id, input.decision],
    );
    const miseAJour = maj.rows[0]!;

    await client.query(
      `INSERT INTO droit_reponse_evenement (demande_id, statut, motif, acteur, payload)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [id, input.decision, input.motif ?? null, acteur,
        JSON.stringify({ reference: row.reference, orgId: row.org_id, public: input.decision === "publiee" })],
    );

    const trace = await consignerAvec(
      (text, params) => client.query(text, params as unknown[]),
      {
        kind: "droit_reponse.decision",
        subject: `droit-reponse:${row.reference}`,
        summary: `Demande ${row.reference} : ${row.statut} → ${input.decision}${input.motif ? ` — ${input.motif}` : ""}`,
        actor: acteurJournal,
        payload: {
          reference: row.reference, orgId: row.org_id, statutAvant: row.statut,
          decision: input.decision, motif: input.motif ?? null, publication: input.decision === "publiee",
        },
      },
    );
    if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);

    return vue(miseAJour, await evenementsDe((text, params) => client.query(text, params), id));
  });
}

/** Ce que la fiche affiche : uniquement les réponses publiées, jamais les brouillons. */
export async function publieesPourOrg(orgId: number): Promise<{ total: number; items: RectificationPubliee[] }> {
  const [rows, total] = await Promise.all([
    query<{
      id: number; reference: string; organisation: string; motif: string; message: string;
      published_at: string | null; decision_motif: string | null;
    }>(
      `SELECT d.id, d.reference, d.organisation, d.motif, d.message,
              d.closed_at::text AS published_at,
              (SELECT e.motif FROM droit_reponse_evenement e
                WHERE e.demande_id=d.id AND e.statut='publiee'
                ORDER BY e.id DESC LIMIT 1) AS decision_motif
         FROM droit_reponse d
        WHERE d.org_id=$1 AND d.statut='publiee'
        ORDER BY d.closed_at DESC, d.id DESC
        LIMIT 20`,
      [orgId],
    ),
    query<{ n: number }>(
      "SELECT count(*)::int AS n FROM droit_reponse WHERE org_id=$1 AND statut='publiee'",
      [orgId],
    ),
  ]);
  return {
    total: total.rows[0]?.n ?? 0,
    items: (rows.rows ?? []).map((r) => ({
      id: r.id,
      reference: r.reference,
      organisation: r.organisation,
      motif: r.motif,
      message: r.message,
      publishedAt: r.published_at,
      decisionMotif: r.decision_motif,
    })),
  };
}
