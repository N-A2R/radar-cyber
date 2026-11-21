/**
 * File de revue des candidats presse — un test par comportement observable.
 * Base isolée par le lanceur de tests ; le journal append-only est identifié
 * par un préfixe unique et n'est pas nettoyé.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import authRoute from "../src/routes/auth.js";
import presseCandidatsRoute from "../src/routes/presse-candidats.js";
import { importerCandidats } from "../src/corpus/importer-presse.js";
import { cleDepuisUrl, organisationProposee, scoreCandidat } from "../src/corpus/candidats-presse.js";
import type { ArticlePresse } from "../src/corpus/candidats-presse.js";

const TAG = `prs${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const EMAIL = `${TAG}@presse.test`;
const TOKEN = `tok-${TAG}`;
const PASSE = `passe-${TAG}`;
const auth = { authorization: `Bearer ${TOKEN}` };

let app: FastifyInstance;
let cles: string[] = [];

function article(n: number, options: Partial<ArticlePresse> = {}): ArticlePresse {
  return {
    titre: `Cyberattaque chez Org${TAG}${n} : données piratées`,
    url: `https://exemple.test/${TAG}/${n}`,
    date: `2026-11-${String(n).padStart(2, "0")}`,
    date_source: "page",
    extrait: `Org${TAG}${n} a été victime d'un piratage ; des données ont été exposées.`,
    nom_source: "Presse test",
    mots_cyber: ["cyberattaque", "piratage"],
    cyber: true,
    ...options,
  };
}

before(async () => {
  const user = await query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','lecteur') RETURNING id",
    [EMAIL],
  );
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(TOKEN), user.rows[0].id],
  );
  await importerCandidats([
    article(1),
    article(2),
    article(3),
    article(4),
    article(5, { cyber: false }),
  ]);
  const rows = await query<{ cle: string }>(
    "SELECT cle FROM presse_candidat WHERE url LIKE $1 ORDER BY url",
    [`https://exemple.test/${TAG}/%`],
  );
  cles = rows.rows.map((r) => r.cle);

  app = Fastify();
  await app.register(authRoute, { prefix: "/api" });
  await app.register(presseCandidatsRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM presse_candidat WHERE url LIKE $1", [`https://exemple.test/${TAG}/%`]);
  await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(TOKEN)]);
  await query("DELETE FROM app_user WHERE email=$1", [EMAIL]);
  await closePools();
});

test("score : déterministe, expliqué et pénalisé par la prévention", () => {
  const incident = article(9);
  const prevention = {
    ...incident,
    titre: "Un jeu de cartes pour apprendre la cybersécurité en prévention",
    extrait: "Une campagne de sensibilisation et de conseils pour prévenir les cyberattaques.",
  };
  const a = scoreCandidat(incident, null);
  const b = scoreCandidat(incident, null);
  const c = scoreCandidat(prevention, null);
  assert.deepEqual(a, b);
  assert.ok(a.score > c.score, `${a.score} doit dépasser ${c.score}`);
  assert.ok(a.signaux.some((s) => s.startsWith("incident-titre:")));
  assert.ok(c.signaux.some((s) => s.startsWith("contexte:")));
  assert.equal(organisationProposee("Vous êtes client chez LDLC ?", ""), "LDLC");
  assert.equal(organisationProposee("Cyberattaque à Bordeaux", ""), null);
  assert.match(cles[0], /^[0-9a-f]{20}$/);
  assert.equal(cleDepuisUrl("https://exemple.test/a"), cleDepuisUrl("https://exemple.test/a"));
});


test("file : authentifiée, champs complets, triée, hors décisions", async () => {
  const sans = await app.inject({ method: "GET", url: "/api/presse/candidats" });
  assert.equal(sans.statusCode, 401);
  const res = await app.inject({ method: "GET", url: "/api/presse/candidats?limit=10", headers: auth });
  assert.equal(res.statusCode, 200);
  const body = res.json<{ rows: Array<Record<string, unknown>>; total: number }>();
  assert.equal(body.total, 4);
  assert.equal(body.rows.length, 4);
  for (const row of body.rows) {
    for (const champ of ["cle", "titre", "extrait", "url", "date", "orgProposee", "scoreConfiance"]) {
      assert.ok(champ in row, `${champ} doit être exposé`);
    }

    assert.equal(typeof row.scoreConfiance, "number");
    assert.match(String(row.url), /^https:\/\//);
  }
  const scores = body.rows.map((r) => r.scoreConfiance as number);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test("import : seuls les candidats cyber sont chargés, une fois", async () => {
  const resultat = await importerCandidats([article(1), article(5, { cyber: false })]);
  assert.equal(resultat.inserts, 0);
  assert.equal(resultat.existants, 1);
  const total = await query<{ total: string }>(
    "SELECT count(*)::text AS total FROM presse_candidat WHERE url LIKE $1",
    [`https://exemple.test/${TAG}/%`],
  );
  assert.equal(total.rows[0].total, "4");
});

test("décision : confirmer porte auteur, horodatage et trace dans le journal", async () => {
  const res = await app.inject({
    method: "POST",
    url: `/api/presse/candidats/${cles[0]}/decision`,
    headers: auth,
    payload: { decision: "confirmer", raison: "incident caractérisé", passe: PASSE, orgRetenue: `Org${TAG}1` },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().candidat.etat, "confirme");

  const décisions = await query<{ auteur: string; horodatage: string; raison: string; avant: unknown }>(
    `SELECT auteur, horodatage::text, raison, avant FROM presse_candidat_decision
      WHERE cle=$1 AND passe=$2`, [cles[0], PASSE],
  );
  assert.equal(décisions.rows.length, 1);
  assert.equal(décisions.rows[0].auteur, `humain:${EMAIL}`);
  assert.ok(!Number.isNaN(Date.parse(décisions.rows[0].horodatage)));
  assert.equal(décisions.rows[0].raison, "incident caractérisé");
  assert.ok(décisions.rows[0].avant);

  const traces = await query<{ actor: string; payload: unknown }>(
    `SELECT actor, payload FROM journal WHERE subject=$1 ORDER BY id`, [`presse-candidat:${cles[0]}`],
  );
  assert.equal(traces.rows.length, 1);
  assert.equal(traces.rows[0].actor, `humain:${EMAIL}`);
  assert.equal((traces.rows[0].payload as { decision: string }).decision, "confirmer");
});

test("décision : refuser vide la file sans organisation retenue", async () => {
  const res = await app.inject({
    method: "POST",
    url: `/api/presse/candidats/${cles[1]}/decision`,
    headers: auth,
    payload: { decision: "refuser", raison: "article de prévention", passe: PASSE },
  });
  assert.equal(res.statusCode, 200);
  const ligne = await query<{ etat: string; org_retenue: string | null }>(
    "SELECT etat, org_retenue FROM presse_candidat WHERE cle=$1", [cles[1]],
  );
  assert.equal(ligne.rows[0].etat, "refuse");
  assert.equal(ligne.rows[0].org_retenue, null);

  const file = await app.inject({ method: "GET", url: "/api/presse/candidats?limit=10", headers: auth });
  assert.equal(file.json<{ total: number }>().total, 2);
});

test("décision : reclasser exige une organisation et la conserve", async () => {
  const sansOrg = await app.inject({
    method: "POST",
    url: `/api/presse/candidats/${cles[2]}/decision`,
    headers: auth,
    payload: { decision: "reclasser", raison: "organisation correction", passe: PASSE },
  });
  assert.equal(sansOrg.statusCode, 400);

  const res = await app.inject({
    method: "POST",
    url: `/api/presse/candidats/${cles[2]}/decision`,
    headers: auth,
    payload: {
      decision: "reclasser", raison: "organisation correction", passe: PASSE,
      orgRetenue: `Autre-${TAG}`,
    },
  });
  assert.equal(res.statusCode, 200);
  const ligne = await query<{ etat: string; org_retenue: string }>(
    "SELECT etat, org_retenue FROM presse_candidat WHERE cle=$1", [cles[2]],
  );
  assert.equal(ligne.rows[0].etat, "reclasse");
  assert.equal(ligne.rows[0].org_retenue, `Autre-${TAG}`);
});

test("décision : un candidat déjà traité ne peut pas être redécidé", async () => {
  const res = await app.inject({
    method: "POST",
    url: `/api/presse/candidats/${cles[0]}/decision`,
    headers: auth,
    payload: { decision: "refuser", raison: "doublon", passe: PASSE },
  });
  assert.equal(res.statusCode, 409);
  const n = await query(
    "SELECT count(*)::text AS total FROM presse_candidat_decision WHERE cle=$1", [cles[0]],
  );
  assert.equal(n.rows[0].total, "1");
});

test("audit : décisions listables et rejeu cohérent avec la projection", async () => {
  const décisions = await app.inject({
    method: "GET", url: `/api/presse/candidats/decisions?passe=${PASSE}`, headers: auth,
  });
  assert.equal(décisions.statusCode, 200);
  const lignes = décisions.json<{ rows: Array<{ auteur: string; decision: string }> }>().rows;
  assert.equal(lignes.length, 3);
  assert.ok(lignes.every((l) => l.auteur === `humain:${EMAIL}`));

  const replay = await app.inject({ method: "GET", url: "/api/presse/candidats/replay", headers: auth });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().coherent, true);

  await query("UPDATE presse_candidat SET etat='en_attente' WHERE cle=$1", [cles[0]]);
  const diverge = await app.inject({ method: "GET", url: "/api/presse/candidats/replay", headers: auth });
  assert.equal(diverge.json().coherent, false);
  assert.equal(diverge.json().divergences.length, 1);
  await query("UPDATE presse_candidat SET etat='confirme' WHERE cle=$1", [cles[0]]);
});

test("mesure : statistiques d'une passe — traités et taux de confirmation", async () => {
  const stats = await app.inject({
    method: "GET", url: `/api/presse/candidats/stats?passe=${PASSE}`, headers: auth,
  });
  assert.equal(stats.statusCode, 200);
  const body = stats.json<Record<string, number | string | null>>();
  assert.equal(body.traites, 3);
  assert.equal(body.traitesDansPasse, 3);
  assert.equal(body.confirme, 1);
  assert.equal(body.refuse, 1);
  assert.equal(body.reclasse, 1);
  assert.equal(body.tauxConfirmation, 33.3);
});
