/**
 * Listes de veille de l'observatoire.
 *
 * L'observatoire déclare ici ce qu'il surveille : organisations du
 * référentiel, secteurs et technologies. Une liste est identifiée par son
 * slug ; ses éléments sont soit une référence d'org (org_id + slug figé),
 * soit un libellé libre. Aucune donnée personnelle n'est stockée.
 *
 * Le contrôle d'accès est porté par la matrice `POLITIQUE_ACCES` (lecture
 * lecteur, écriture analyste) : toutes les routes sont enregistrées dans le
 * registre unique et couvertes par le test de sécurité.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../db.js";
import { badRequest, notFound } from "../errors.js";
import { parseBody, invalidBody } from "./body-validation.js";

const CreateWatchlistBody = z.strictObject({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, "slug invalide"),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
});

const UpdateWatchlistBody = z.strictObject({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

const AddItemBody = z.strictObject({
  kind: z.enum(["org", "secteur", "technologie"]),
  ref: z.string().trim().min(1).max(160).optional(),
  orgId: z.number().int().positive().optional(),
}).refine(
  (v) => (v.kind === "org" ? v.orgId !== undefined : v.ref !== undefined),
  { message: "orgId requis pour une org, ref requis pour un secteur ou une technologie" },
);

const SlugParams = z.strictObject({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/) });
const ItemParams = SlugParams.extend({ itemId: z.coerce.number().int().positive() });

type WatchlistRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  item_count?: number;
};

type ItemRow = {
  id: number;
  kind: string;
  ref: string;
  org_id: number | null;
  created_at: string;
};

/** Paramètres d'URL invalides : même contrat 400 que les corps invalides. */
function params<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw badRequest("invalid input", parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })));
  }
  return parsed.data;
}

function publicList(row: WatchlistRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    itemCount: Number(row.item_count ?? 0),
    createdAt: row.created_at,
  };
}

function publicItem(row: ItemRow) {
  return {
    id: row.id,
    kind: row.kind,
    ref: row.ref,
    orgId: row.org_id,
    createdAt: row.created_at,
  };
}

async function findList(slug: string): Promise<WatchlistRow> {
  const r = await query<WatchlistRow>(
    `SELECT w.id, w.slug, w.name, w.description, w.created_at,
            (SELECT count(*)::int FROM watchlist_item i WHERE i.watchlist_id = w.id) AS item_count
     FROM watchlist w WHERE w.slug = $1`,
    [slug],
  );
  const row = r.rows[0];
  if (!row) throw notFound(`watchlist inconnue : ${slug}`);
  return row;
}

async function findItems(watchlistId: number): Promise<ItemRow[]> {
  const r = await query<ItemRow>(
    `SELECT id, kind, ref, org_id, created_at
     FROM watchlist_item WHERE watchlist_id = $1 ORDER BY kind, ref, id`,
    [watchlistId],
  );
  return r.rows;
}

async function detail(slug: string) {
  const row = await findList(slug);
  return { ...publicList(row), items: (await findItems(row.id)).map(publicItem) };
}

export default async function watchlistsRoute(app: FastifyInstance) {
  app.get("/watchlists", async () => {
    const r = await query<WatchlistRow>(
      `SELECT w.id, w.slug, w.name, w.description, w.created_at,
              (SELECT count(*)::int FROM watchlist_item i WHERE i.watchlist_id = w.id) AS item_count
       FROM watchlist w ORDER BY w.name, w.id`,
    );
    return { watchlists: r.rows.map(publicList) };
  });

  app.get("/watchlists/:slug", async (req) => {
    const { slug } = params(SlugParams, req.params);
    return detail(slug);
  });

  app.post("/watchlists", async (req, reply) => {
    const parsed = parseBody(CreateWatchlistBody, req.body);
    if (!parsed.success) return invalidBody(reply, parsed.error);
    const { slug, name, description } = parsed.data;
    const r = await query<WatchlistRow>(
      `INSERT INTO watchlist (slug, name, description) VALUES ($1, $2, $3)
       RETURNING id, slug, name, description, created_at`,
      [slug, name, description ?? null],
    );
    return reply.code(201).send({ ...publicList(r.rows[0]!), items: [] });
  });

  app.put("/watchlists/:slug", async (req, reply) => {
    const { slug } = params(SlugParams, req.params);
    const parsed = parseBody(UpdateWatchlistBody, req.body);
    if (!parsed.success) return invalidBody(reply, parsed.error);
    const before = await findList(slug);
    const name = parsed.data.name ?? before.name;
    const description = parsed.data.description === undefined
      ? before.description
      : parsed.data.description;
    await query("UPDATE watchlist SET name=$1, description=$2 WHERE id=$3", [name, description, before.id]);
    return detail(slug);
  });

  app.post("/watchlists/:slug/items", async (req, reply) => {
    const { slug } = params(SlugParams, req.params);
    const parsed = parseBody(AddItemBody, req.body);
    if (!parsed.success) return invalidBody(reply, parsed.error);
    const list = await findList(slug);
    const body = parsed.data;

    let ref = body.ref ?? "";
    let orgId: number | null = null;
    if (body.kind === "org") {
      const org = await query<{ id: number; slug: string }>(
        "SELECT id, slug FROM org WHERE id = $1",
        [body.orgId],
      );
      const found = org.rows[0];
      if (!found) throw notFound(`org inconnue : ${body.orgId}`);
      ref = found.slug;
      orgId = found.id;
    }

    const r = await query<ItemRow>(
      `INSERT INTO watchlist_item (watchlist_id, kind, ref, org_id)
       VALUES ($1, $2, $3, $4) RETURNING id, kind, ref, org_id, created_at`,
      [list.id, body.kind, ref, orgId],
    );
    return reply.code(201).send(publicItem(r.rows[0]!));
  });

  app.delete("/watchlists/:slug/items/:itemId", async (req) => {
    const { slug, itemId } = params(ItemParams, req.params);
    const list = await findList(slug);
    const r = await query<{ id: number }>(
      "DELETE FROM watchlist_item WHERE id=$1 AND watchlist_id=$2 RETURNING id",
      [itemId, list.id],
    );
    if (!r.rows[0]) throw notFound(`élément de veille inconnu : ${itemId}`);
    return { ok: true, id: itemId };
  });

  app.delete("/watchlists/:slug", async (req) => {
    const { slug } = params(SlugParams, req.params);
    const list = await findList(slug);
    await query("DELETE FROM watchlist WHERE id=$1", [list.id]);
    return { ok: true, slug };
  });
}
