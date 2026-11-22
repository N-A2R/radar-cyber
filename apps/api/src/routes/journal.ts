/**
 * Auditable journal — read-only.
 *
 * The journal is append-only (migration 027): it carries the author, the
 * decision and the reason of every recorded fact, even when a projection has
 * since been rewritten. This route never writes to it.
 *
 * Unlike the original review-only endpoint, the audit screen reads every kind
 * of decision: reviews, publications (an organisation or an alert is created)
 * and corrections (an organisation or a match is changed). `kind`, `actor`,
 * `q` and the date bounds are shared by the JSON and the CSV export so the
 * downloaded file is exactly the filtered list shown on screen.
 *
 * Cursor pagination is on the journal id (bigserial): descending id is
 * chronological order and, unlike a timestamp, cannot duplicate a row across
 * two pages. `offset` lets a screen jump straight to a page, `limit` (or its
 * historical alias `limite`) bounds the page, and every response carries the
 * `total` matching the filters so the screen never counts a client-side buffer.
 */
import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { Query } from "pg";
import { z } from "zod";
import { badRequest } from "../errors.js";
import { pool, query } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const JournalQuery = z.object({
  /** Nom historique, conservé pour les clients déjà déployés (plafond d'origine). */
  limite: z.coerce.number().int().min(1).max(500).optional(),
  /** Nom préféré ; prime sur `limite` quand les deux sont fournis. */
  limit: z.coerce.number().int().min(1).max(100).optional(),
  /** Curseur : id de la dernière ligne de la page précédente. */
  avant: z.coerce.number().int().positive().optional(),
  /** Décalage, pour sauter directement à une page ; compatible avec `avant`. */
  offset: z.coerce.number().int().min(0).max(10_000_000).optional(),
  /** "all" (default), a category ("review", "publication", "correction") or an exact kind. */
  kind: z.string().trim().max(64).optional(),
  acteur: z.string().trim().max(200).optional(),
  q: z.string().trim().max(200).optional(),
  du: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").optional(),
  au: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").optional(),
});

type Params = z.infer<typeof JournalQuery>;

/** Categories shown by the type filter. A category is a fixed set of kinds. */
const CATEGORY_KINDS: Record<string, readonly string[]> = {
  review: ["review.decided"],
  publication: ["org.created", "alert.changed", "event.admitted", "publication.decided"],
  correction: ["org.changed", "match.refuse", "match.decided", "event.rattachement"],
};

type Filters = {
  /** null = no restriction; otherwise the exact `journal.kind` values to keep. */
  kinds: readonly string[] | null;
  acteur?: string;
  q?: string;
  du?: string;
  au?: string;
};

function parseFilters(raw: Params): Filters {
  let kinds: readonly string[] | null = null;
  const kind = raw.kind?.toLowerCase();
  if (kind && kind !== "all") {
    if (kind in CATEGORY_KINDS) {
      kinds = CATEGORY_KINDS[kind];
    } else if (/^[a-z][a-z0-9_.]*$/.test(kind)) {
      kinds = [kind];
    } else {
      throw badRequest("invalid journal type", [{ path: "kind", message: "unexpected type" }]);
    }
  }
  return {
    kinds,
    acteur: raw.acteur || undefined,
    q: raw.q || undefined,
    du: raw.du,
    au: raw.au,
  };
}

/** A user-supplied `%` or `_` is text, never a SQL wildcard. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Builds the WHERE clause and its positional parameters. Both routes call it,
 * which is what guarantees that the CSV exports the filtered list, not the
 * whole journal.
 */
function whereClause(filters: Filters, params: unknown[]): string {
  const conditions: string[] = [];
  const add = (sql: string, ...values: unknown[]) => {
    let index = 0;
    conditions.push(sql.replace(/\?/g, () => {
      params.push(values[index++]);
      return `$${params.length}`;
    }));
  };

  if (filters.kinds) add("j.kind = ANY(?::text[])", [...filters.kinds]);
  if (filters.acteur) add("j.actor ILIKE ? ESCAPE '\\'", `%${escapeLike(filters.acteur)}%`);
  if (filters.q) {
    const motif = `%${escapeLike(filters.q)}%`;
    add(
      `(j.summary ILIKE ? ESCAPE '\\'
         OR j.subject ILIKE ? ESCAPE '\\'
         OR j.actor ILIKE ? ESCAPE '\\'
         OR j.payload::text ILIKE ? ESCAPE '\\'
         OR COALESCE(j.payload->>'decision', '') ILIKE ? ESCAPE '\\')`,
      motif, motif, motif, motif, motif,
    );
  }
  if (filters.du) add("(j.recorded_at AT TIME ZONE 'UTC')::date >= ?::date", filters.du);
  if (filters.au) add("(j.recorded_at AT TIME ZONE 'UTC')::date <= ?::date", filters.au);
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}

type Decision = "accepter" | "refuser" | "creer";
const DECISIONS: readonly string[] = ["accepter", "refuser", "creer"];

type JournalLigne = {
  id: string;
  kind: string;
  sujet: string;
  acteur: string;
  horodatage: string;
  decision: string | null;
  indice: string | null;
  raison: string | null;
  resume: string | null;
  preuve: Record<string, unknown>;
};

/** Same projection for the screen and for the detail panel (payload = proof). */
const SELECT_COLUMNS = `
  j.id::text AS id,
  j.kind AS kind,
  j.subject AS sujet,
  j.actor AS acteur,
  j.recorded_at::text AS horodatage,
  COALESCE(j.payload->>'decision',
           CASE j.payload->>'action'
             WHEN 'promote' THEN 'accepter'
             WHEN 'reject' THEN 'refuser'
           END) AS decision,
  COALESCE(NULLIF(btrim((
    SELECT q.org_hint
    FROM quarantine_raw q
    WHERE q.id = NULLIF(substring(j.subject FROM '^quarantine:([0-9]+)$'), '')::bigint
  )), ''), j.subject) AS indice,
  COALESCE(NULLIF(btrim(j.payload->>'reason'), ''),
           NULLIF(btrim(j.payload->>'motif'), ''),
           NULLIF(btrim(j.summary), '')) AS raison,
  j.summary AS resume,
  j.payload AS preuve`;

/** Page JSON : la jointure quarantaine est une sous-requête corrélée, évaluée
 * seulement sur les lignes rendues — pas de hachage des 180 000 lignes. */
const FROM_JOURNAL = "\n  FROM journal j";

/** Export CSV : le flux parcourt tout le résultat, la jointure reste utile. */
const FROM_JOIN = `
  FROM journal j
  LEFT JOIN quarantine_raw q ON j.subject = 'quarantine:' || q.id::text`;

/** One CSV row: the plain columns plus the raw payload as evidence. */
type ExportLigne = {
  date: string;
  kind: string;
  actor: string;
  decision: string | null;
  subject: string | null;
  reason: string | null;
  org_id: string | null;
  quarantine_id: string | null;
  evidence: Record<string, unknown> | string | null;
};

const ENTETE_CSV = "date,kind,actor,decision,subject,reason,org_id,quarantine_id,evidence\r\n";

function exportSql(where: string): string {
  return `
  SELECT to_char(j.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS date,
         j.kind,
         j.actor,
         COALESCE(j.payload->>'decision',
                  CASE j.payload->>'action'
                    WHEN 'promote' THEN 'accepter'
                    WHEN 'reject' THEN 'refuser'
                  END) AS decision,
         COALESCE(NULLIF(btrim(q.org_hint), ''), j.subject) AS subject,
         COALESCE(NULLIF(btrim(j.payload->>'reason'), ''),
                  NULLIF(btrim(j.payload->>'motif'), ''),
                  NULLIF(btrim(j.summary), '')) AS reason,
         j.payload->>'orgId' AS org_id,
         COALESCE(substring(j.subject FROM '^quarantine:([0-9]+)$'),
                  j.payload->>'quarantineId') AS quarantine_id,
         j.payload AS evidence
  ${FROM_JOIN}
  ${where}
  ORDER BY j.id ASC`;
}

function celluleCsv(valeur: string | null | undefined): string {
  if (valeur === null || valeur === undefined) return "";
  const texte = String(valeur);
  return /[",\r\n]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

/** Signal woken by every row, error or end of cursor. */
type SignalFlux = { promise: Promise<void>; resolve: () => void };

/**
 * One connection for the whole stream: `Query` emits rows as they arrive and
 * never accumulates the result. If the consumer leaves, the connection is
 * destroyed instead of returned to the pool with a query still running.
 */
async function* fluxCsv(where: string, params: readonly unknown[]): AsyncGenerator<string> {
  const client = await pool.connect();
  const curseur = new Query<ExportLigne, unknown[]>(exportSql(where), [...params]);
  const tampon: string[] = [];
  let echec: Error | null = null;
  let fini = false;
  let attente: SignalFlux | null = null;
  const reveiller = () => {
    attente?.resolve();
    attente = null;
  };
  curseur.on("row", (row: ExportLigne) => {
    const evidence = typeof row.evidence === "string"
      ? row.evidence
      : JSON.stringify(row.evidence ?? {});
    tampon.push([
      row.date, row.kind, row.actor, row.decision, row.subject,
      row.reason, row.org_id, row.quarantine_id, evidence,
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

function zodBadRequest(error: z.ZodError): never {
  throw badRequest("invalid input",
    error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
}

export default async function (app: FastifyInstance) {
  /** Auditable entries, newest first. Filters match the CSV export exactly. */
  app.get("/journal/review", { preHandler: requireAuth() }, async (req, reply) => {
    const parsed = JournalQuery.safeParse(req.query ?? {});
    if (!parsed.success) zodBadRequest(parsed.error);
    const { avant, offset } = parsed.data;
    const limite = parsed.data.limit ?? parsed.data.limite ?? 100;
    const decalage = offset ?? 0;
    const filters = parseFilters(parsed.data);

    // Le WHERE ne dépend que des filtres : il sert à la page et au total, avec
    // deux jeux de paramètres distincts (le curseur et la limite n'y entrent pas).
    const filterParams: unknown[] = [];
    const where = whereClause(filters, filterParams);

    const params = [...filterParams];
    params.push(avant ?? null);
    params.push(limite);
    params.push(decalage);
    const curseurId = `$${filterParams.length + 1}`;
    const limiteId = `$${filterParams.length + 2}`;
    const offsetId = `$${filterParams.length + 3}`;

    const [totalResult, result] = await Promise.all([
      query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM journal j ${where}`,
        filterParams,
      ),
      query<JournalLigne>(
        `SELECT ${SELECT_COLUMNS}
         ${FROM_JOURNAL}
         ${where}
         ${where ? "AND" : "WHERE"} (${curseurId}::bigint IS NULL OR j.id < ${curseurId}::bigint)
         ORDER BY j.id DESC
         LIMIT ${limiteId} OFFSET ${offsetId}`,
        params,
      ),
    ]);
    const total = Number(totalResult.rows[0]?.total ?? 0);
    const lignes = result.rows ?? [];
    const rows = lignes.map((row) => ({
      id: Number(row.id),
      kind: row.kind,
      sujet: row.sujet,
      acteur: row.acteur,
      horodatage: row.horodatage,
      decision: DECISIONS.includes(row.decision ?? "") ? row.decision as Decision : null,
      indice: row.indice,
      raison: row.raison,
      resume: row.resume,
      preuve: row.preuve ?? {},
    }));
    const derniere = rows.length > 0 ? rows[rows.length - 1].id : null;
    return {
      rows,
      total,
      limite,
      offset: decalage,
      avant: derniere !== null && decalage + rows.length < total ? derniere : null,
    };
  });

  /** Audit export: the same filtered entries as a streamed CSV (admin only). */
  app.get("/journal/review/export.csv", { preHandler: requireRole("admin") }, async (req, reply) => {
    const parsed = JournalQuery
      .omit({ limite: true, limit: true, avant: true, offset: true })
      .safeParse(req.query ?? {});
    if (!parsed.success) zodBadRequest(parsed.error);
    const filters = parseFilters(parsed.data);
    const params: unknown[] = [];
    const where = whereClause(filters, params);

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="journal-review.csv"');
    reply.header("Cache-Control", "no-store");
    return reply.send(Readable.from((async function* () {
      yield ENTETE_CSV;
      yield* fluxCsv(where, params);
    })()));
  });
}
