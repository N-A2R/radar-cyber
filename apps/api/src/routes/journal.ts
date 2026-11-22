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
 * two pages.
 */
import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { Query } from "pg";
import { z } from "zod";
import { badRequest } from "../errors.js";
import { pool, query } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const JournalQuery = z.object({
  limite: z.coerce.number().int().min(1).max(500).default(100),
  avant: z.coerce.number().int().positive().optional(),
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
  COALESCE(NULLIF(btrim(q.org_hint), ''), j.subject) AS indice,
  COALESCE(NULLIF(btrim(j.payload->>'reason'), ''),
           NULLIF(btrim(j.payload->>'motif'), ''),
           NULLIF(btrim(j.summary), '')) AS raison,
  j.summary AS resume,
  j.payload AS preuve`;

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
    const { limite, avant } = parsed.data;
    const filters = parseFilters(parsed.data);

    const params: unknown[] = [];
    const where = whereClause(filters, params);
    params.push(avant ?? null);
    params.push(limite + 1);
    const curseurId = `$${params.length - 1}`;
    const limiteId = `$${params.length}`;

    // +1 row tells us whether another page exists, without a second count.
    const result = await query<JournalLigne>(
      `SELECT ${SELECT_COLUMNS}
       ${FROM_JOIN}
       ${where}
       ${where ? "AND" : "WHERE"} (${curseurId}::bigint IS NULL OR j.id < ${curseurId}::bigint)
       ORDER BY j.id DESC
       LIMIT ${limiteId}`,
      params,
    );
    const lignes = result.rows ?? [];
    const rows = lignes.slice(0, limite).map((row) => ({
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
    return {
      rows,
      limite,
      avant: lignes.length > limite && rows.length > 0 ? rows[rows.length - 1].id : null,
    };
  });

  /** Audit export: the same filtered entries as a streamed CSV (admin only). */
  app.get("/journal/review/export.csv", { preHandler: requireRole("admin") }, async (req, reply) => {
    const parsed = JournalQuery.omit({ limite: true, avant: true }).safeParse(req.query ?? {});
    if (!parsed.success) zodBadRequest(parsed.error);
    const filters = parseFilters({ ...parsed.data, limite: 100 });
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
