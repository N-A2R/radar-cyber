/**
 * Graphe de connaissance temporel — lecture de la projection construite par
 * `db/migrate-052-graphe-temporal.sql` (`refresh_graphe_temporal()`).
 *
 * Trois questions, une seule route :
 *   ?at=2026-03-15                    état du graphe à une date donnée ;
 *   ?entity=org:34354&at=...          qui était lié à cette entité à la date D ;
 *   ?changedSince=...&changedUntil=.. relations créées ou closes sur la période.
 *
 * Sans filtre, la route renvoie les relations valides au plus près de `at`,
 * bornées par `limit` (2000 par défaut) pour rester lisibles et rapides.
 * Aucun lien n'est inféré à la volée : tout vient de la table des relations.
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

type EntityRow = {
  id: string;
  label: string;
  kind: string;
  valid_from: string;
  valid_to: string | null;
  props: Record<string, unknown>;
};

type RelationRow = {
  source_id: string;
  target_id: string;
  type: string;
  valid_from: string;
  valid_to: string | null;
};

const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 10000;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseDate(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${field} doit être une date ISO valide`);
  return new Date(time).toISOString();
}

export default async function (app: FastifyInstance) {
  app.get("/graph/temporal", async (req, reply) => {
    const raw = req.query as Record<string, string | string[] | undefined>;
    let at: string;
    let since: string | undefined;
    let until: string | undefined;
    let entity: string | undefined;
    let limit: number;
    try {
      at = parseDate(single(raw.at), "at") ?? new Date().toISOString();
      since = parseDate(single(raw.changedSince), "changedSince");
      until = parseDate(single(raw.changedUntil), "changedUntil");
      entity = single(raw.entity)?.trim() || undefined;
      const asked = single(raw.limit);
      limit = asked === undefined ? DEFAULT_LIMIT : Number(asked);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw new Error(`limit doit être un entier entre 1 et ${MAX_LIMIT}`);
      }
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "requête invalide" });
    }

    const params: unknown[] = [];
    const conditions: string[] = [];
    if (entity) {
      params.push(entity);
      const p = `$${params.length}`;
      conditions.push(`(r.source_id = ${p} OR r.target_id = ${p})`);
    }
    if (since || until) {
      params.push(since ?? "1970-01-01T00:00:00Z", until ?? "9999-12-31T00:00:00Z");
      const from = `$${params.length - 1}::timestamptz`;
      const to = `$${params.length}::timestamptz`;
      conditions.push(
        `((r.valid_from BETWEEN ${from} AND ${to}) OR (r.valid_to BETWEEN ${from} AND ${to}))`
      );
    } else {
      params.push(at);
      const p = `$${params.length}::timestamptz`;
      conditions.push(`r.valid_from <= ${p} AND (r.valid_to IS NULL OR r.valid_to > ${p})`);
    }
    params.push(limit);

    const linksResult = await query<RelationRow>(
      `SELECT r.source_id, r.target_id, r.type, r.valid_from, r.valid_to
         FROM graph_relation r
        WHERE ${conditions.join(" AND ")}
        ORDER BY r.valid_from DESC, r.id DESC
        LIMIT $${params.length}`,
      params,
    );
    const links = linksResult.rows;
    const ids = new Set<string>();
    for (const link of links) {
      ids.add(link.source_id);
      ids.add(link.target_id);
    }
    const nodesResult = ids.size === 0 ? { rows: [] as EntityRow[] } : await query<EntityRow>(
      `SELECT id, label, kind, valid_from, valid_to, props
         FROM graph_entity WHERE id = ANY ($1::text[])`,
      [[...ids]],
    );

    return {
      nodes: nodesResult.rows.map((row) => {
        const p = row.props ?? {};
        return {
          id: row.id,
          label: row.label,
          kind: row.kind,
          validFrom: row.valid_from,
          validTo: row.valid_to,
          ...(typeof p.family === "string" ? { family: p.family } : {}),
          ...(typeof p.severity === "number" ? { severity: p.severity } : {}),
          ...(typeof p.observedAt === "string" ? { observedAt: p.observedAt } : {}),
          ...(typeof p.dept === "string" ? { dept: p.dept } : {}),
        };
      }),
      links: links.map((row) => ({
        source: row.source_id,
        target: row.target_id,
        type: row.type,
        validFrom: row.valid_from,
        validTo: row.valid_to,
      })),
      meta: {
        at,
        entity: entity ?? null,
        changedSince: since ?? null,
        changedUntil: until ?? null,
        limit,
        returned: links.length,
      },
    };
  });
}

