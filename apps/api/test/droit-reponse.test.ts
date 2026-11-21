/**
 * Droit de réponse de bout en bout : dépôt public, instruction analyste,
 * publication administrative, trace dans le journal et affichage sur la fiche.
 *
 * Vérifie aussi les refus (validation, identité, rôle, débit, double décision)
 * et les états vides : la fiche d'une organisation sans rectification ne
 * montre aucun texte inventé.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import { installErrorHandler } from "../src/errors.js";
import { installAccessControl } from "../src/security/rbac.js";
import { lireJournal } from "../src/journal/index.js";
import rectificationRoute from "../src/routes/rectification.js";
import orgsRoute from "../src/routes/orgs.js";

const TAG = `dr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ORG_NAME = `Organisation Droit Réponse ${TAG}`;
const ORG_DOMAIN = `${TAG}.example`;
const TOKENS: Record<string, string> = {};
const IDS: Record<string, number> = {};
let orgId: number;
let app: FastifyInstance;

const corpsValide = {
  organisation: ORG_NAME,
  email: `contact-${TAG}@example.fr`,
  contactNom: "Service juridique",
  motif: "inexactitude",
  message: "Le signal publié le 3 novembre concerne une autre entité du même groupe.",
};

function headers(role?: string, client?: string) {
  return {
    ...(role ? { authorization: `Bearer ${TOKENS[role]}` } : {}),
    "x-client-key": client ?? `defaut-${TAG}`,
  };
}

async function demande(client?: string, surcharge: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/rectifications",
    headers: headers(undefined, client),
    payload: { ...corpsValide, orgId, ...surcharge },
  });
}

before(async () => {
  for (const role of ["lecteur", "analyste", "admin"]) {
    const u = await query<{ id: number }>(
      "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x',$2) RETURNING id",
      [`${role}-${TAG}@droit.test`, role],
    );
    IDS[role] = Number(u.rows[0]!.id);
    TOKENS[role] = `tok-${role}-${TAG}`;
    await query(
      "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
      [hashSessionToken(TOKENS[role]!), IDS[role]],
    );
  }
  const org = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, sector, city, dept, domain, status)
     VALUES ($1,$2,'entreprise','informatique','Bordeaux','33',$3,'confirme') RETURNING id`,
    [ORG_NAME, `${TAG}-org`, ORG_DOMAIN],
  );
  orgId = Number(org.rows[0]!.id);
  await query(
    "INSERT INTO org_alias (org_id, alias, source, status) VALUES ($1,$2,'test','active')",
    [orgId, `Alias Publique ${TAG}`],
  );

  app = Fastify({ logger: false });
  installErrorHandler(app);
  installAccessControl(app);
  // La limite par route n'a d'effet que si le plugin est enregistré ; on clé
  // par un en-tête de test pour isoler les scénarios sans attendre une heure.
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (req) => String(req.headers["x-client-key"] ?? req.ip),
  });
  await app.register(rectificationRoute, { prefix: "/api" });
  await app.register(orgsRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM droit_reponse_evenement WHERE demande_id IN (SELECT id FROM droit_reponse WHERE org_id=$1)", [orgId]);
  await query("DELETE FROM droit_reponse WHERE org_id=$1", [orgId]);
  await query("DELETE FROM app_session WHERE user_id = ANY($1::int[])", [Object.values(IDS)]);
  await query("DELETE FROM app_user WHERE id = ANY($1::int[])", [Object.values(IDS)]);
  await closePools();
});

test("fiche sans rectification : état vide explicite, aucune donnée inventée", async () => {
  const res = await app.inject({ method: "GET", url: `/api/orgs/${orgId}`, headers: headers("lecteur") });
  assert.equal(res.statusCode, 200, res.body.slice(0, 200));
  assert.deepEqual(res.json().rectifications, { total: 0, items: [] });
});

test("liste d'instruction vide pour un analyste, interdite au lecteur", async () => {
  const vide = await app.inject({ method: "GET", url: "/api/rectifications", headers: headers("analyste") });
  assert.equal(vide.statusCode, 200);
  assert.equal(vide.json().total, 0);
  assert.deepEqual(vide.json().items, []);
  const refuse = await app.inject({ method: "GET", url: "/api/rectifications", headers: headers("lecteur") });
  assert.equal(refuse.statusCode, 403);
});

test("dépôt invalide : champs manquants, email, nom non concordant, organisation inconnue", async () => {
  const incomplet = await app.inject({
    method: "POST", url: "/api/rectifications", headers: headers(),
    payload: { organisation: ORG_NAME },
  });
  assert.equal(incomplet.statusCode, 400);
  assert.equal(incomplet.json().error.code, "DEMANDE_INVALIDE");
  assert.ok(incomplet.json().error.details.some((d: { champ: string }) => d.champ === "email"));

  const email = await demande("err-email", { email: "pas-un-email" });
  assert.equal(email.statusCode, 400);

  const nom = await demande("err-nom", { organisation: "Organisation sans rapport" });
  assert.equal(nom.statusCode, 422);
  assert.equal(nom.json().error.code, "NOM_ORG_INCOHERENT");

  const inconnue = await demande("err-org", { orgId: 9_999_999 });
  assert.equal(inconnue.statusCode, 404);
});

test("un alias ou un domaine officiel suffit à désigner l'organisation", async () => {
  const parAlias = await demande("alias", { organisation: `Alias Publique ${TAG}` });
  assert.equal(parAlias.statusCode, 202, parAlias.body.slice(0, 200));
  const parDomaine = await demande("domaine", { organisation: "Autre nom", domaine: `www.${ORG_DOMAIN}` });
  assert.equal(parDomaine.statusCode, 202, parDomaine.body.slice(0, 200));
});

test("dépôt public accepté : 202, référence, statut reçu et fait journalisé", async () => {
  const res = await demande("principal");
  assert.equal(res.statusCode, 202, res.body.slice(0, 200));
  const corps = res.json<{ id: number; reference: string; statut: string; prochaineEtape?: string }>();
  assert.match(corps.reference, /^DR-\d{4}-\d{6}$/);
  assert.equal(corps.statut, "recu");
  assert.match(corps.prochaineEtape ?? "", /aucune publication automatique|Instruction/i);

  const { rows } = await query<{ id: number }>(
    "SELECT id FROM droit_reponse WHERE reference=$1", [corps.reference],
  );
  assert.equal(rows.length, 1);
  const entrees = await lireJournal({ kind: "droit_reponse.demande", subject: `droit-reponse:${corps.reference}` });
  assert.equal(entrees.length, 1);
  assert.equal(entrees[0]?.payload.orgId, orgId);
  assert.equal(entrees[0]?.payload.moyenVerification, "nom");

  // Le message n'est pas publié à la réception.
  const fiche = await app.inject({ method: "GET", url: `/api/orgs/${orgId}`, headers: headers("lecteur") });
  assert.equal(fiche.json().rectifications.total, 0);
});

test("limite de débit : le quatrième dépôt d'un même client est refusé", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) {
    const res = await demande("limite");
    statuses.push(res.statusCode);
    if (res.statusCode === 429) {
      assert.match(String(res.headers["retry-after"]), /^\d+$/);
      assert.equal(res.json().error.code, "RATE_LIMIT_EXCEEDED");
    }
  }
  assert.deepEqual(statuses, [202, 202, 202, 429]);
});

test("instruction : lecteur et analyste ne publient pas, admin décide", async () => {
  const cree = await demande("instruction");
  const id = cree.json().id as number;

  const lecteur = await app.inject({
    method: "POST", url: `/api/rectifications/${id}/decision`, headers: headers("lecteur"),
    payload: { decision: "en_instruction" },
  });
  assert.equal(lecteur.statusCode, 403);

  const sansMotif = await app.inject({
    method: "POST", url: `/api/rectifications/${id}/decision`, headers: headers("admin"),
    payload: { decision: "publiee" },
  });
  assert.equal(sansMotif.statusCode, 400);
  assert.equal(sansMotif.json().error.code, "DECISION_INVALIDE");

  const instruction = await app.inject({
    method: "POST", url: `/api/rectifications/${id}/decision`, headers: headers("admin"),
    payload: { decision: "en_instruction", motif: "Vérification du communiqué de presse" },
  });
  assert.equal(instruction.statusCode, 200);
  assert.equal(instruction.json().statut, "en_instruction");
  assert.equal(instruction.json().historique.length, 2);

  const publication = await app.inject({
    method: "POST", url: `/api/rectifications/${id}/decision`, headers: headers("admin"),
    payload: { decision: "publiee", motif: "Correction confirmée par la source" },
  });
  assert.equal(publication.statusCode, 200);
  assert.equal(publication.json().statut, "publiee");

  const trace = await lireJournal({ kind: "droit_reponse.decision", subject: `droit-reponse:${cree.json().reference}` });
  assert.equal(trace.length, 2);
  // le journal se lit du plus récent au plus ancien
  assert.deepEqual(trace.map((t) => t.payload.decision), ["publiee", "en_instruction"]);

  const fiche = await app.inject({ method: "GET", url: `/api/orgs/${orgId}`, headers: headers("lecteur") });
  const publiees = fiche.json().rectifications;
  assert.equal(publiees.total, 1);
  assert.equal(publiees.items[0].message, corpsValide.message);
  assert.equal(publiees.items[0].decisionMotif, "Correction confirmée par la source");
  assert.ok(publiees.items[0].publishedAt, "la date de publication est affichée");
});

test("une demande clôturée ne peut plus être modifiée", async () => {
  const cree = await demande("cloturee");
  const id = cree.json().id as number;
  const url = `/api/rectifications/${id}/decision`;
  const admin = headers("admin");
  const premiere = await app.inject({
    method: "POST", url, headers: admin, payload: { decision: "refusee", motif: "Pièce justificative insuffisante" },
  });
  assert.equal(premiere.statusCode, 200);
  const seconde = await app.inject({
    method: "POST", url, headers: admin, payload: { decision: "publiee", motif: "Nouvelle décision" },
  });
  assert.equal(seconde.statusCode, 409);
  assert.equal(seconde.json().error.code, "DEMANDE_CLOTUREE");

  const fiche = await app.inject({ method: "GET", url: `/api/orgs/${orgId}`, headers: headers("lecteur") });
  assert.equal(fiche.json().rectifications.total, 1, "un refus n'est jamais publié sur la fiche");
});

test("l'historique des décisions et les faits de la demande sont immuables", async () => {
  await assert.rejects(
    query("UPDATE droit_reponse_evenement SET statut='publiee' WHERE demande_id IN (SELECT id FROM droit_reponse WHERE org_id=$1)", [orgId]),
    /ne se réécrit pas/,
  );
  await assert.rejects(
    query("UPDATE droit_reponse SET message='modifié' WHERE org_id=$1", [orgId]),
    /ne se réécrivent pas/,
  );
});

test("lecture d'une demande : historique complet pour l'analyste, 404 si absente", async () => {
  const liste = await app.inject({ method: "GET", url: "/api/rectifications", headers: headers("analyste") });
  const premiere = liste.json().items[0] as { id: number };
  const detail = await app.inject({
    method: "GET", url: `/api/rectifications/${premiere.id}`, headers: headers("analyste"),
  });
  assert.equal(detail.statusCode, 200);
  assert.ok(detail.json().historique.length >= 1);
  const absent = await app.inject({
    method: "GET", url: "/api/rectifications/9999999", headers: headers("analyste"),
  });
  assert.equal(absent.statusCode, 404);
});
