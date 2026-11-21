/**
 * Création d'organisation depuis un indice de revendication.
 *
 * Isolation : organisations suffixées, supprimées dans `after`. Le journal est
 * append-only et n'est pas nettoyé — la base jetable disparaît de toute façon.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { closePools, query } from "../src/db.js";
import { hashSessionToken } from "../src/auth.js";
import orgsRoute from "../src/routes/orgs.js";
import { installErrorHandler } from "../src/errors.js";
import { lireJournal } from "../src/journal/index.js";
import { createOrgFromHint, InvalidHintError, nomDepuisIndice } from "../src/quarantine/from-hint.js";

const TAG = `oh${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdSlugs: string[] = [];

function recordSlug(slug: string): string {
  createdSlugs.push(slug);
  return slug;
}

test("nomDepuisIndice : un indice-domaine perd son www.", () => {
  assert.equal(nomDepuisIndice("www.exemple.com"), "exemple.com");
});

const base = {
  nom: `Établissement Connectwell ${TAG}`,
  domaine: `${TAG}.example`,
  ville: "Bordeaux",
  source: `quarantine:${TAG}`,
  preuve: `revendication ${TAG} — ransomware.live`,
};

after(async () => {
  if (createdSlugs.length > 0) {
    const rows = await query<{ id: number }>("SELECT id FROM org WHERE slug = ANY($1::text[])", [createdSlugs]);
    const ids = rows.rows.map((r) => Number(r.id));
    if (ids.length > 0) {
      await query("DELETE FROM org_alias WHERE org_id = ANY($1::int[])", [ids]);
      await query("DELETE FROM org WHERE id = ANY($1::int[])", [ids]);
    }
  }
  await closePools();
});

test("création : organisation, domaine, ville et deux alias", async () => {
  const result = await createOrgFromHint(base);
  recordSlug(result.org.slug);
  assert.equal(result.journal.ecrit, true);

  assert.equal(result.created, true);
  assert.equal(result.matchedBy, null);
  assert.equal(result.aliases, 2);
  assert.equal(result.journal.ok, true, JSON.stringify(result.journal));
  assert.equal(result.org.status, "a_confirmer");
  assert.equal(result.org.domain, base.domaine);
  assert.equal(result.org.city, base.ville);
  assert.ok(result.org.slug.startsWith("hint-"));

  const aliases = await query<{ alias: string; source: string }>(
    "SELECT alias, source FROM org_alias WHERE org_id=$1 ORDER BY alias",
    [result.org.id],
  );
  assert.deepEqual(aliases.rows.map((r) => r.source).sort(), ["domain", "name-full"]);
  assert.ok(aliases.rows.some((r) => r.alias === base.domaine));
  assert.ok(aliases.rows.some((r) => r.alias === `etablissement connectwell ${TAG}`.toLowerCase()));

  const entite = await query<{ entity_source: string }>("SELECT entity_source FROM org WHERE id=$1", [result.org.id]);
  assert.equal(entite.rows[0]?.entity_source, `hint:${base.source}`);
});

test("création depuis un indice www. : le nom stocké est sans www., le journal garde le brut", async () => {
  const indice = `www.${TAG}.exemple.com`;
  const result = await createOrgFromHint({
    nom: indice,
    ville: "Bordeaux",
    source: `quarantine:www-${TAG}`,
    preuve: `revendication ${TAG} — indice domaine`,
  });
  recordSlug(result.org.slug);
  assert.equal(result.created, true);
  assert.equal(result.org.name, `${TAG}.exemple.com`);

  const faits = await lireJournal({ kind: "org.created", subject: `org:${result.org.slug}`, limite: 10 });
  assert.equal(faits[0]?.payload?.nomBrut, indice);
});

test("doublon par domaine : organisation existante rendue, sans écriture", async () => {
  const found = await query<{ slug: string; id: number }>("SELECT slug, id FROM org WHERE domain=$1", [base.domaine]);
  const existing = found.rows[0]!;

  const result = await createOrgFromHint({
    ...base,
    nom: `Autre nom ${TAG}`,
    preuve: "autre preuve",
  });

  assert.equal(result.created, false);
  assert.equal(result.journal.ecrit, false);
  assert.equal(result.matchedBy, "domaine");
  assert.equal(result.org.id, existing.id);
  assert.equal(result.aliases, 0);
  assert.equal(result.journal.ok, true);

  const count = await query<{ n: string }>("SELECT count(*)::text AS n FROM org WHERE domain=$1", [base.domaine]);
  assert.equal(count.rows[0]?.n, "1", "aucune organisation supplémentaire");
});

test("doublon par nom normalisé : accents, casse et espaces ignorés", async () => {
  const found = await query<{ slug: string; id: number }>("SELECT slug, id FROM org WHERE domain=$1", [base.domaine]);
  const existing = found.rows[0]!;

  const result = await createOrgFromHint({
    ...base,
    nom: `ETABLISSEMENT  CONNECTWELL ${TAG.toUpperCase()}`,
    domaine: `${TAG}-second.example`,
  });

  assert.equal(result.created, false);
  assert.equal(result.matchedBy, "nom");
  assert.equal(result.org.id, existing.id);
  const other = await query<{ n: string }>("SELECT count(*)::text AS n FROM org WHERE domain=$1", [
    `${TAG}-second.example`,
  ]);
  assert.equal(other.rows[0]?.n, "0", "le domaine inédit n'a pas créé d'organisation");
});

test("champs vides refusés par le service", async () => {
  for (const [champ, valeur] of [
    ["nom", "   "],
    ["source", ""],
    ["preuve", "\t "],
  ] as const) {
    await assert.rejects(
      createOrgFromHint({ ...base, [champ]: valeur }),
      (error: unknown) => error instanceof InvalidHintError,
      `${champ} vide doit être refusé`,
    );
  }
});

test("journal : le fait porte la provenance de l'indice", async () => {
  const found = await query<{ slug: string }>("SELECT slug FROM org WHERE domain=$1", [base.domaine]);
  const faits = await lireJournal({ kind: "org.created", subject: `org:${found.rows[0]!.slug}`, limite: 10 });
  assert.equal(faits.length, 1);
  assert.equal(faits[0]?.payload?.source, base.source);
  assert.equal(faits[0]?.payload?.preuve, base.preuve);
  assert.equal(faits[0]?.payload?.nomBrut, base.nom);
});

test("route : Bearer requis, validation 400, création 201 puis 200", async () => {
  const email = `fromhint-${TAG}@authtest.local`;
  const inserted = await query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','admin') RETURNING id",
    [email],
  );
  const token = `tok-${TAG}`;
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(token), inserted.rows[0]!.id],
  );

  const app = Fastify();
  installErrorHandler(app);
  await app.register(orgsRoute, { prefix: "/api" });
  await app.ready();
  try {
    const sansToken = await app.inject({
      method: "POST",
      url: "/api/orgs/from-hint",
      payload: base,
    });
    assert.equal(sansToken.statusCode, 401);

    const vide = await app.inject({
      method: "POST",
      url: "/api/orgs/from-hint",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...base, nom: "  ", preuve: "" },
    });
    assert.equal(vide.statusCode, 400);
    const champs = vide.json<{ error: { details: Array<{ champ: string }> } }>().error.details.map((d) => d.champ);
    assert.ok(champs.includes("nom") && champs.includes("preuve"), JSON.stringify(champs));

    const cree = await app.inject({
      method: "POST",
      url: "/api/orgs/from-hint",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...base, nom: `Route ${TAG}`, domaine: `${TAG}-route.example` },
    });
    assert.equal(cree.statusCode, 201, cree.body);
    recordSlug(cree.json().org.slug);
    assert.equal(cree.json().created, true);

    const rejeu = await app.inject({
      method: "POST",
      url: "/api/orgs/from-hint",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...base, nom: `Autre ${TAG}`, domaine: `${TAG}-route.example` },
    });
    assert.equal(rejeu.statusCode, 200, rejeu.body);
    assert.equal(rejeu.json().created, false);
    assert.equal(rejeu.json().matchedBy, "domaine");
    assert.equal(rejeu.json().org.id, cree.json().org.id);
  } finally {
    await app.close();
    await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(token)]);
    await query("DELETE FROM app_user WHERE id=$1", [inserted.rows[0]!.id]);
  }
});

test("réutilisation par domaine racine : www. et sous-domaine ne créent pas de doublon", async () => {
	const existant = await createOrgFromHint({
		...base,
		nom: `Racine ${TAG}`,
		domaine: `racine-${TAG}.example`,
	});
	recordSlug(existant.org.slug);
	assert.equal(existant.created, true);

	const variante = await createOrgFromHint({
		...base,
		nom: `Variante ${TAG}`,
		domaine: `https://user:pass@www.sous.racine-${TAG}.example:8443/contact`,
	});
	assert.equal(variante.created, false);
	assert.equal(variante.matchedBy, "domaine");
	assert.equal(variante.org.id, existant.org.id);
});

test("réutilisation par alias-domaine portant un sous-domaine", async () => {
	const existant = await createOrgFromHint({
		...base,
		nom: `Alias domaine ${TAG}`,
		domaine: `alias-${TAG}.example`,
	});
	recordSlug(existant.org.slug);
	const variante = await createOrgFromHint({
		...base,
		nom: `Autre alias ${TAG}`,
		domaine: `www.alias-${TAG}.example`,
	});
	assert.equal(variante.created, false);
	assert.equal(variante.matchedBy, "domaine");
	assert.equal(variante.org.id, existant.org.id);
});

test("réutilisation par site web stocké en URL", async () => {
	const existant = await createOrgFromHint({
		...base,
		nom: `Site ${TAG}`,
		domaine: `site-${TAG}.example`,
	});
	recordSlug(existant.org.slug);
	await query("UPDATE org SET website=$1 WHERE id=$2", [
		`https://www.site-${TAG}.example/contact`,
		existant.org.id,
	]);
	const variante = await createOrgFromHint({
		...base,
		nom: `Site variante ${TAG}`,
		domaine: `www.site-${TAG}.example`,
	});
	assert.equal(variante.created, false);
	assert.equal(variante.matchedBy, "domaine");
	assert.equal(variante.org.id, existant.org.id);
});

test("domaine invalide : aucun rattachement SILENCIEUX et erreur explicite", async () => {
	await assert.rejects(
		createOrgFromHint({ ...base, nom: `Invalide ${TAG}`, domaine: "pas un domaine" }),
		InvalidHintError,
	);
});
