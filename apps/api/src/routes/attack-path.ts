/**
 * GET /api/attack-path — shortest measured chain from a group to a NA organization.
 *
 * Query string (all names in English):
 *   group    group name, with or without the `group:` prefix (required)
 *   org      target organization id, with or without the `org:` prefix (optional)
 *   maxHops  traversal depth, 1..8 (default 5)
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { findAttackPath, NA_DEPARTMENTS } from "../analyse/attack-path.js";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function groupId(raw: string | undefined): string {
  if (!raw) throw new Error("group is required");
  let value = raw.trim().toLowerCase();
  if (value.startsWith("group:")) value = value.slice("group:".length);
  if (!value || value.length > 120 || /[\u0000-\u001f]/.test(value)) {
    throw new Error("group must be a non-empty identifier of at most 120 characters");
  }
  return value;
}

function orgId(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === "") return null;
  let value = raw.trim();
  if (value.startsWith("org:")) value = value.slice("org:".length);
  if (!/^\d+$/.test(value)) throw new Error("org must be a numeric organization id");
  return `org:${value}`;
}

export default async function (app: FastifyInstance) {
  app.get("/attack-path", async (req, reply) => {
    const started = performance.now();
    const raw = req.query as Record<string, string | string[] | undefined>;

    let group: string;
    let target: string | null;
    let maxHops = 5;
    try {
      group = groupId(single(raw.group));
      target = orgId(single(raw.org));
      const asked = single(raw.maxHops);
      if (asked !== undefined) {
        maxHops = Number(asked);
        if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 8) {
          throw new Error("maxHops must be an integer between 1 and 8");
        }
      }
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "invalid query" });
    }

    if (target) {
      const allowed = await query(
        `SELECT 1 FROM graph_entity
          WHERE id = $1::text AND kind = 'org' AND props->>'dept' = ANY ($2::text[])`,
        [target, [...NA_DEPARTMENTS]],
      );
      if (allowed.rows.length === 0) {
        return reply.code(400).send({
          error: "target organization is not a Nouvelle-Aquitaine organization in the graph",
        });
      }
    }

    const match = await findAttackPath(group, target, maxHops);
    return {
      group,
      target,
      ...match,
      tookMs: Math.round((performance.now() - started) * 10) / 10,
    };
  });
}
