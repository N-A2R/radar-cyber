/**
 * Critère de sortie du chantier « listes de veille ».
 *
 * Scénario joué tel quel : création de la liste « hopitaux-NA » avec 12
 * organisations, ajout d'un secteur, ajout puis suppression d'un élément
 * temporaire (preuve du DELETE), puis la requête SQL du critère. La sortie
 * brute contient la requête exacte et le compteur lu en base.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import { installErrorHandler } from "../src/errors.js";
import { installAccessControl } from "../src/security/rbac.js";
import watchlistsRoute from "../src/routes/watchlists.js";

const TAG = `wl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = "hopitaux-na";
const TOKENS: Record<string, string> = {};
const USER_IDS: number[] = [];
const ORG_IDS: number[] = [];
const ORG_SLUGS: string[] = [];
let app: FastifyInstance;

/** Requête du critère, exécutée telle quelle en fin de scénario. */
const SQL_COUNT =
  "SELECT count(*) FROM watchlist_item WHERE watchlist_id = (SELECT id FROM watchlist WHERE slug='hopitaux-na')";

function headers(role: string) {
  return { authorization: `Bearer ${TOKENS[role]}` };
}

before(async () => {
  for (const role of ["lecteur", "analyste"]) {
    const u = await query<{ id: number }>(
      "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x',$2) RETURNING id",
      [`${role}-${TAG}@watchlist.test`, role],
    );
    const id = Number(u.rows[0]!.id);
    USER_IDS.push(id);
    TOKENS[role] = `tok-${role}-${TAG}`;
    await query(
      "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
      [hashSessionToken(TOKENS[role]!), id],
    );
  }

  for (let i = 1; i <= 12; i++) {
    const slug = `${TAG}-hopital-${String(i).padStart(2, "0")}`;
    const org = await query<{ id: number }>(
      `INSERT INTO org (name, slug, kind, sector, city, status)
       VALUES ($1, $2, 'sante', 'sante', 'Bordeaux', 'confirme') RETURNING id`,
      [`Hôpital de test ${TAG} ${i}`, slug],
    );
    ORG_IDS.push(Number(org.rows[0]!.id));
    ORG_SLUGS.push(slug);
  }

  app = Fastify({ logger: false });
  installErrorHandler(app);
  installAccessControl(app);
  await app.register(watchlistsRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM watchlist WHERE slug=$1", [SLUG]);
  if (ORG_IDS.length) await query("DELETE FROM org WHERE id = ANY($1::int[])", [ORG_IDS]);
  if (USER_IDS.length) {
    await query("DELETE FROM app_session WHERE user_id = ANY($1::int[])", [USER_IDS]);
    await query("DELETE FROM app_user WHERE id = ANY($1::int[])", [USER_IDS]);
  }
  await closePools();
});

test("création hopitaux-NA : 12 orgs + secteur, suppression prouvée, count = 13", async () => {
  // Sans jeton : aucune écriture possible.
  const sansJeton = await app.inject({
    method: "POST",
    url: "/api/watchlists",
    payload: { slug: SLUG, name: "Hôpitaux Nouvelle-Aquitaine" },
  });
  assert.equal(sansJeton.statusCode, 401);

  const cree = await app.inject({
    method: "POST",
    url: "/api/watchlists",
    headers: headers("analyste"),
    payload: {
      slug: SLUG,
      name: "Hôpitaux Nouvelle-Aquitaine",
      description: "Liste de veille des établissements de santé",
    },
  });
  assert.equal(cree.statusCode, 201, cree.body.slice(0, 300));
  assert.equal(cree.json().slug, SLUG);

  for (const orgId of ORG_IDS) {
    const res = await app.inject({
      method: "POST",
      url: `/api/watchlists/${SLUG}/items`,
      headers: headers("analyste"),
      payload: { kind: "org", orgId },
    });
    assert.equal(res.statusCode, 201, res.body.slice(0, 300));
    assert.equal(res.json().kind, "org");
  }

  const secteur = await app.inject({
    method: "POST",
    url: `/api/watchlists/${SLUG}/items`,
    headers: headers("analyste"),
    payload: { kind: "secteur", ref: "sante" },
  });
  assert.equal(secteur.statusCode, 201, secteur.body.slice(0, 300));

  // Ajout puis suppression : le DELETE est exercé, le compteur final reste 13.
  const temporaire = await app.inject({
    method: "POST",
    url: `/api/watchlists/${SLUG}/items`,
    headers: headers("analyste"),
    payload: { kind: "technologie", ref: "VPN-test" },
  });
  assert.equal(temporaire.statusCode, 201);
  const tempId = Number(temporaire.json().id);
  const supprime = await app.inject({
    method: "DELETE",
    url: `/api/watchlists/${SLUG}/items/${tempId}`,
    headers: headers("analyste"),
  });
  assert.equal(supprime.statusCode, 200, supprime.body.slice(0, 300));
  assert.equal(supprime.json().ok, true);

  const detail = await app.inject({
    method: "GET",
    url: `/api/watchlists/${SLUG}`,
    headers: headers("lecteur"),
  });
  assert.equal(detail.statusCode, 200, detail.body.slice(0, 300));
  const items = detail.json().items as Array<{ kind: string; ref: string }>;
  assert.equal(items.length, 13);
  assert.equal(items.filter((i) => i.kind === "org").length, 12);
  assert.equal(items.filter((i) => i.kind === "secteur").length, 1);
  assert.equal(items.filter((i) => i.ref === ORG_SLUGS[0]).length, 1);

  // Mise à jour et listing font partie du CRUD.
  const maj = await app.inject({
    method: "PUT",
    url: `/api/watchlists/${SLUG}`,
    headers: headers("analyste"),
    payload: { name: "Hôpitaux NA — veille" },
  });
  assert.equal(maj.statusCode, 200, maj.body.slice(0, 300));
  assert.equal(maj.json().name, "Hôpitaux NA — veille");
  const liste = await app.inject({ method: "GET", url: "/api/watchlists", headers: headers("lecteur") });
  assert.equal(liste.statusCode, 200);
  assert.ok(liste.json().watchlists.some((w: { slug: string }) => w.slug === SLUG));

  const r = await query<{ count: string }>(SQL_COUNT);
  const valeur = String(r.rows[0]!.count);
  console.log(`${SQL_COUNT};`);
  console.log(valeur);
  assert.equal(Number(valeur), 13, "le critère exige 13 éléments dans hopitaux-na");

  // Suppression de la liste elle-même : cascade vérifiée après la mesure.
  const suppression = await app.inject({
    method: "DELETE",
    url: `/api/watchlists/${SLUG}`,
    headers: headers("analyste"),
  });
  assert.equal(suppression.statusCode, 200);
  const apres = await query<{ count: string }>(SQL_COUNT);
  assert.equal(Number(apres.rows[0]!.count), 0);
});
