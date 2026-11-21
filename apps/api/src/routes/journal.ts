/**
 * Journal des décisions de revue — lecture seule.
 *
 * Le journal est append-only (migration 027) : c'est lui qui porte l'auteur,
 * la décision et le motif des revues humaines, même quand la projection de
 * quarantaine a été réécrite. Cette route ne fait que le lire : aucune écriture.
 *
 * Pagination par curseur `avant` sur l'id du journal. L'id est un bigserial
 * incrémenté à chaque fait : l'ordre descendant est l'ordre chronologique, et
 * contrairement à un timestamp il ne produit pas de doublon entre deux pages.
 */
import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { Query } from "pg";
import { z } from "zod";
import { pool, query } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const JournalQuery = z.object({
  limite: z.coerce.number().int().min(1).max(500).default(100),
  avant: z.coerce.number().int().positive().optional(),
});

type Decision = "accepter" | "refuser" | "creer";
const DECISIONS: readonly string[] = ["accepter", "refuser", "creer"];

type JournalLigne = {
  id: string;
  sujet: string;
  acteur: string;
  horodatage: string;
  decision: string | null;
  indice: string | null;
  raison: string | null;
};

function badRequest(reply: { code: (n: number) => { send: (body: unknown) => unknown } }, error: z.ZodError) {
  return reply.code(400).send({
    error: "invalid input",
    details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
}

const ENTETE_CSV = "date,acteur,decision,indice,org_id,raison,quarantine_id\r\n";

/** Mêmes colonnes que /journal/review, aplaties pour un tableur. */
const EXPORT_SQL = `
  SELECT to_char(j.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS date,
         j.actor AS acteur,
         COALESCE(j.payload->>'decision',
                  CASE j.payload->>'action'
                    WHEN 'promote' THEN 'accepter'
                    WHEN 'reject' THEN 'refuser'
                  END) AS decision,
         COALESCE(NULLIF(btrim(q.org_hint), ''), j.subject) AS indice,
         j.payload->>'orgId' AS org_id,
         COALESCE(NULLIF(btrim(j.payload->>'reason'), ''),
                  NULLIF(btrim(j.payload->>'motif'), ''),
                  NULLIF(btrim(j.summary), '')) AS raison,
         COALESCE(substring(j.subject FROM '^quarantine:([0-9]+)$'),
                  j.payload->>'quarantineId') AS quarantine_id
    FROM journal j
    LEFT JOIN quarantine_raw q ON j.subject = 'quarantine:' || q.id::text
   WHERE j.kind = 'review.decided'
   ORDER BY j.id ASC`;

type ExportLigne = {
  date: string;
  acteur: string;
  decision: string | null;
  indice: string | null;
  org_id: string | null;
  raison: string | null;
  quarantine_id: string | null;
};
/** Signal réveillé à chaque ligne, erreur ou fin du curseur. */
type SignalFlux = { promise: Promise<void>; resolve: () => void };

function celluleCsv(valeur: string | null | undefined): string {
  if (valeur === null || valeur === undefined) return "";
  const texte = String(valeur);
  return /[",\r\n]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

/**
 * Une connexion pour tout le flux : `Query` émet les lignes au fur et à mesure
 * et n'accumule pas le résultat. Si le consommateur abandonne, la connexion
 * est détruite plutôt que rendue au pool avec une requête en cours.
 */
async function* fluxCsv(): AsyncGenerator<string> {
  const client = await pool.connect();
  const curseur = new Query<ExportLigne>(EXPORT_SQL);
  const tampon: string[] = [];
  let echec: Error | null = null;
  let fini = false;
  let attente: SignalFlux | null = null;
  const reveiller = () => {
    attente?.resolve();
    attente = null;
  };
  curseur.on("row", (row: ExportLigne) => {
    tampon.push([
      row.date, row.acteur, row.decision, row.indice,
      row.org_id, row.raison, row.quarantine_id,
    ].map(celluleCsv).join(",") + "\r\n");
    reveiller();
  });
  curseur.on("error", (err: Error) => { echec = err; reveiller(); });
  curseur.on("end", () => { fini = true; reveiller(); });
  try {
    client.query(curseur);
    while (true) {
      if (tampon.length > 0) { yield tampon.shift()!; continue; }
      if (echec) throw echec;
      if (fini) return;
      attente ??= Promise.withResolvers<void>();
      await attente.promise;
    }
  } finally {
    client.release(echec !== null || !fini);
  }
}

export default async function (app: FastifyInstance) {
  /** Décisions de revue, les plus récentes d'abord. Garde identique à /review/*. */
  app.get("/journal/review", { preHandler: requireAuth() }, async (req, reply) => {
    const parsed = JournalQuery.safeParse(req.query ?? {});
    if (!parsed.success) return badRequest(reply, parsed.error);
    const { limite, avant } = parsed.data;

    // +1 pour savoir s'il reste une page, sans second compte sur la table.
    const result = await query<JournalLigne>(
      `SELECT j.id::text AS id, j.subject AS sujet, j.actor AS acteur,
              j.recorded_at::text AS horodatage,
              COALESCE(j.payload->>'decision',
                       CASE j.payload->>'action'
                         WHEN 'promote' THEN 'accepter'
                         WHEN 'reject' THEN 'refuser'
                       END) AS decision,
              COALESCE(NULLIF(btrim(q.org_hint), ''), j.subject) AS indice,
              COALESCE(NULLIF(btrim(j.payload->>'reason'), ''),
                       NULLIF(btrim(j.payload->>'motif'), ''),
                       NULLIF(btrim(j.summary), '')) AS raison
         FROM journal j
         LEFT JOIN quarantine_raw q ON j.subject = 'quarantine:' || q.id::text
        WHERE j.kind = 'review.decided'
          AND ($1::bigint IS NULL OR j.id < $1::bigint)
        ORDER BY j.id DESC
        LIMIT $2`,
      [avant ?? null, limite + 1],
    );
    const lignes = result.rows ?? [];
    const rows = lignes.slice(0, limite).map((row) => ({
      id: Number(row.id),
      sujet: row.sujet,
      acteur: row.acteur,
      horodatage: row.horodatage,
      decision: DECISIONS.includes(row.decision ?? "") ? row.decision as Decision : null,
      indice: row.indice,
      raison: row.raison,
    }));
    // Curseur à renvoyer à la prochaine requête ; null = dernière page.
    return {
      rows,
      limite,
      avant: lignes.length > limite && rows.length > 0 ? rows[rows.length - 1].id : null,
    };
  });

  /** Export d'audit : les mêmes décisions, en CSV streamé (admin seulement). */
  app.get("/journal/review/export.csv", { preHandler: requireRole("admin") }, (_req, reply) => {
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="journal-review.csv"');
    reply.header("Cache-Control", "no-store");
    return reply.send(Readable.from((async function* () {
      yield ENTETE_CSV;
      yield* fluxCsv();
    })()));
  });
}
