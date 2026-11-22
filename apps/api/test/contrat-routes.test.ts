/**
 * Contrat HTTP des routes GET : statut + forme de la réponse, vérifiés par Zod.
 *
 * Un `.strictObject` échoue si une clé attendue disparaît **ou** si une clé
 * inattendue apparaît : un champ retiré par un refactoring casse le contrat
 * au lieu de laisser le front lire `undefined` silencieusement. Les objets
 * imbriqués qui ne font pas l'objet de ce contrat sont seulement typés comme
 * JSON ; seules les clés de premier niveau (des objets comme des tableaux
 * d'éléments) sont verrouillées ici.
 *
 * Isolation : le serveur n'est pas importé (il écoute et lance les
 * collecteurs). On monte les plugins de routes sur une instance Fastify
 * jetable, avec le même hook d'authentification et un compte admin jetable.
 * La base est celle de `test/run.ts`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { closePools, query } from "../src/db.js";
import { hashSessionToken } from "../src/auth.js";
import { resolveUser } from "../src/middleware/auth.js";
import alertsRoute from "../src/routes/alerts.js";
import confidenceRoute from "../src/routes/confidence.js";
import authRoute from "../src/routes/auth.js";
import directoryRoute from "../src/routes/directory.js";
import dossierRoute from "../src/routes/dossier.js";
import enrichRoute from "../src/routes/enrich.js";
import eventsRoute from "../src/routes/events.js";
import flowsRoute from "../src/routes/flows.js";
import graphRoute from "../src/routes/graph.js";
import healthCausesRoute from "../src/routes/health-causes.js";
import healthDetailRoute from "../src/routes/health-detail.js";
import journalRoute from "../src/routes/journal.js";
import naRoute from "../src/routes/na.js";
import orgsLieesHistoriqueRoute from "../src/routes/orgs-liees-historique.js";
import orgsLieesRoute from "../src/routes/orgs-liees.js";
import orgsRoute from "../src/routes/orgs.js";
import quarantineRoute from "../src/routes/quarantine.js";
import reviewRoute from "../src/routes/review.js";
import searchRoute from "../src/routes/search.js";
import sourcesRoute from "../src/routes/sources.js";
import { reglePour } from "../src/security/rbac.js";
import statsRoute from "../src/routes/stats.js";
import todayRoute from "../src/routes/today.js";

const TOKEN = `contrat${randomBytes(12).toString("hex")}`;
const EMAIL = `${TOKEN}@contrat.invalid`;

/** `z.unknown()` admet `undefined` : ce type exige une valeur JSON présente. */
const json = z.union([
  z.string(), z.number(), z.boolean(), z.null(),
  z.array(z.record(z.string(), z.unknown())),
  z.record(z.string(), z.unknown()),
]);
const objet = z.record(z.string(), z.unknown());
const objets = z.array(objet);
const chaineNullable = z.string().nullable();
const nombreNullable = z.number().nullable();

/* ---- Schémas de réponse (un par route) --------------------------------- */

const alerte = z.strictObject({
  id: z.number(), rule_id: z.string(), title: z.string(), severity: z.number(),
  status: z.string(), event_id: nombreNullable, indicator_id: nombreNullable,
  org_id: nombreNullable, evidence: objet,
  created_at: z.string(), updated_at: z.string(),
  acked_at: json, acked_by: json, scope: z.string(),
  delivered_at: json, attempts: z.number(), last_error: json,
  next_attempt_at: json, webhook_delivered_at: json, telegram_delivered_at: json,
  event_title: json, event_family: json, event_tlp: json, event_summary: json,
  event_confidence: json, event_assertion: json, indicator_type: json,
  indicator_value: json, org_name: json, org_dept: json, confidence: objet,
  url_orientation: chaineNullable, actions: z.array(z.string()), lien_verifie_le: json,
});

const evenement = z.strictObject({
  id: z.number(), dedupKey: z.string(), family: z.string(),
  assertionType: z.string(), title: z.string(), sourceId: z.string(),
  geoType: z.string(), tlp: z.string(), severity: z.number(),
  summary: chaineNullable, observedAt: chaineNullable, collectedAt: chaineNullable,
  confidence: json, sourceUrl: chaineNullable, dateSource: chaineNullable,
  dateConfidence: chaineNullable, tlpSource: chaineNullable,
  regionalMotif: chaineNullable, evidence: objet,
  langue: chaineNullable, pertinenceScore: nombreNullable, pertinenceRule: chaineNullable,
  lat: nombreNullable, lon: nombreNullable, orgId: nombreNullable,
  regional: z.boolean(), fraicheur: objet, confiance: objet,
});

const organisation = z.strictObject({
  id: z.number(), name: z.string(), slug: z.string(), kind: z.string(),
  sector: chaineNullable, city: chaineNullable, dept: chaineNullable,
  website: chaineNullable, domain: chaineNullable,
  lat: nombreNullable, lon: nombreNullable, eventCount: z.number(),
});

const faitQuarantaine = z.strictObject({
  id: z.number(), source: json, sourceUrl: json, groupe: json, orgHint: json,
  claimedAt: json, extracted: json, review: z.array(json), tlp: z.string(),
  status: z.string(), promoted: z.boolean(), promotedAt: json,
  promotedBy: json, receivedAt: json, purgeAfter: json, contentHash: json,
  org: json, orgConfidence: nombreNullable,
});

const source = z.strictObject({
  id: z.string(), name: z.string(), family: z.string(), url: z.string(),
  kind: z.string(), format: z.string(), enabled: z.boolean(),
  intervalSec: z.number(), lastOkAt: chaineNullable,
  lastErrorAt: chaineNullable, lastError: chaineNullable,
  itemsTotal: nombreNullable, lastItems: nombreNullable,
  disabledAt: chaineNullable, disabledReason: chaineNullable,
  statut: z.string(), derniereErreur: chaineNullable, ok: z.boolean(),
  entrees: nombreNullable, rejets: nombreNullable,
  evenements30j: z.number(), evenementsTotal: z.number(), lastEventAt: chaineNullable,
  dernierRun: chaineNullable, dernierRunStatut: chaineNullable,
  motifs: json, motifDominant: chaineNullable, rendement: nombreNullable,
  // Enrichissement optionnel (ValeurSource), absent sans données de valeur.
  faits: z.number().optional(), faitsUniques: z.number().optional(),
  partUniquesPct: z.number().optional(), primeurs: z.number().optional(),
  retardMedianHeures: nombreNullable.optional(), sourceId: z.string().optional(),
});

const SCHEMAS = {
  "/api/alerts": z.array(alerte),
  "/api/alerts/stats": z.array(z.strictObject({ status: z.string(), severity: z.number(), count: z.string() })),
  "/api/auth/me": z.strictObject({ id: z.number(), email: z.string(), role: z.string(), displayName: chaineNullable }),
  "/api/directory": z.strictObject({
    rows: objets, total: z.number(), page: z.number(), limit: z.number(),
    facets: z.strictObject({ kind: objets, sector: objets, dept: objets }),
    truncated: z.boolean(), tookMs: z.number(),
  }),
  "/api/dossier": z.strictObject({ etat: objet, dossier: objet }),
  "/api/confidence/distribution": z.strictObject({
    generatedAt: z.string(), weights: objet, levels: objet,
    scores: objets, facts: objet,
  }),
  "/api/events": z.array(evenement),
  "/api/flows": z.strictObject({ arcs: objets, total: z.number(), truncated: z.boolean() }),
  "/api/graph": z.strictObject({ nodes: objets, links: objets }),
  "/api/health/causes": z.strictObject({
    ok: z.literal(true), generatedAt: z.string(), rouges: z.number(),
    sansTrace: z.number(), stockage: objet, causes: objets,
  }),
  "/api/health/detail": z.strictObject({
    ok: z.literal(true), generatedAt: z.string(), windowDays: z.number(),
    db: objet, sources: objet, events24h: z.number(), orgs7j: z.number(),
    queues: objet, families: objets,
  }),
  "/api/health/sources": z.strictObject({
    ok: z.literal(true), generatedAt: z.string(), total: z.number(),
    counts: z.strictObject({ ok: z.number(), error: z.number(), pending: z.number() }),
    families: z.array(z.strictObject({ family: z.string(), sources: z.number() })),
    matching: z.number(), page: z.number(), pageSize: z.number(), pages: z.number(),
    items: z.array(z.strictObject({
      id: z.string(), name: z.string(), family: z.string(), url: z.string(),
      enabled: z.boolean(), status: z.enum(["ok", "error", "pending"]),
      lastOkAt: chaineNullable, lastErrorAt: chaineNullable, lastError: chaineNullable,
      lastItems: nombreNullable,
    })),
  }),
  "/api/journal/review": z.strictObject({ rows: objets, limite: z.number(), avant: nombreNullable }),
  "/api/na/overview": z.strictObject({ depts: objets, derniereCollecte: chaineNullable, total: objet }),
  "/api/na/events": z.strictObject({ dept: z.string(), events: objets }),
  "/api/orgs/liees/historique": z.strictObject({ jours: z.number(), points: objets }),
  "/api/orgs/liees": z.strictObject({
    semaine: z.number(), total: z.number(), enAttente: z.number(),
    examinees: z.number(), parDepartement: objets,
  }),
  "/api/orgs": z.array(organisation),
  "/api/orgs/:id": z.strictObject({
    org: objet, aliases: z.array(json), domains: z.array(z.string()),
    relatedOrgs: objets, sourceCount: z.number(), assets: objet,
    events: objet, claims: objet, exposure: objets, corroboration: objet,
    historique: objet, rectifications: objet,
  }),
  "/api/quarantine": z.array(faitQuarantaine),
  "/api/quarantine/stats": z.strictObject({
    total: z.number(), pendingUnpromoted: z.number(),
    byStatus: objets, byPromoted: objets, bySource: objets,
  }),
  "/api/quarantine/queue": z.strictObject({
    rows: objets, total: z.number(), page: z.number(), limit: z.number(),
    nextCursor: nombreNullable, window: z.number(), truncated: z.boolean(),
    facets: objet, counts: objet, tookMs: z.number(),
  }),
  "/api/review/queue": z.strictObject({
    rows: objets, total: z.number(), page: z.number(), limit: z.number(),
    window: z.number(), nextCursor: nombreNullable, counts: objet,
    tookMs: z.number(),
  }),
  "/api/review/stats": z.strictObject({
    pending: z.number(), acceptees: z.number(), refusees: z.number(), promues: z.number(),
  }),
  "/api/search": z.strictObject({ orgs: objets, events: objets, indicators: objets }),
  "/api/sources": z.array(source),
  "/api/stats": z.strictObject({
    orgs: z.number(), events: z.number(), indicators: z.number(),
    sources: z.strictObject({ total: z.number(), active: z.number(), ok: z.number(), err: z.number() }),
    byFamily: objets, byAssertion: objets,
  }),
  "/api/stats/departements": z.strictObject({ windowDays: z.number(), departements: objets, departements24h: objets }),
  "/api/today": z.strictObject({ compteurs: objet, evenements: objets }),
} satisfies Record<string, z.ZodType>;

let app: FastifyInstance;
let userId: number;
let orgId: number;

before(async () => {
  const u = await query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','admin') RETURNING id", [EMAIL]);
  userId = Number(u.rows[0].id);
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(TOKEN), userId],
  );
  const org = await query<{ id: number }>("SELECT id FROM org ORDER BY id LIMIT 1");
  orgId = Number(org.rows[0]?.id ?? 1);

  app = Fastify({ logger: false });
  // Même attachment du user que dans server.ts : les routes protégées lisent req.user.
  app.addHook("onRequest", async (req) => {
    const user = await resolveUser(req);
    if (user) req.user = user;
  });
  const plugins: FastifyPluginAsync[] = [
    alertsRoute, authRoute, directoryRoute, dossierRoute, enrichRoute, eventsRoute,
    flowsRoute, graphRoute, healthCausesRoute, healthDetailRoute, journalRoute,
    naRoute, orgsLieesHistoriqueRoute, orgsLieesRoute, orgsRoute, quarantineRoute,
    confidenceRoute,
    reviewRoute, searchRoute, sourcesRoute,
    // statsRoute porte déjà /stats/departements ; ne pas monter le plugin
    // stats-departements.ts qui déclare la même route.
    statsRoute, todayRoute,
  ];
  for (const plugin of plugins) await app.register(plugin, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM app_session WHERE user_id = $1", [userId]);
  await query("DELETE FROM app_user WHERE id = $1", [userId]);
  await closePools();
});

async function verifierContrat(path: string, schema: z.ZodType): Promise<void> {
  const url = path === "/api/orgs/:id" ? `/api/orgs/${orgId}` : path;
  const res = await app.inject({
    method: "GET", url, headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(res.statusCode, 200, `${url} : statut inattendu — ${res.body.slice(0, 300)}`);
  const parsed = schema.safeParse(res.json());
  if (!parsed.success) {
    assert.fail(`${url} : réponse hors contrat — ${JSON.stringify(parsed.error.issues, null, 2)}`);
  }
}

for (const [path, schema] of Object.entries(SCHEMAS)) {
  test(`GET ${path} : statut 200 et forme de réponse`, async () => {
    await verifierContrat(path, schema);
  });
}

test("chaque route du contrat est déclarée dans la matrice d'accès", () => {
  // Sans cette assertion, une route peut répondre au handler et renvoyer 404
  // en production : `installAccessControl` refuse toute route absente de la
  // matrice. C'est le sens routes → matrice, complémentaire de
  // `securite-couverture.test.ts`.
  const manquantes = Object.keys(SCHEMAS).filter((path) => reglePour("GET", path) === null);
  assert.deepEqual(manquantes, [], `routes hors matrice : ${manquantes.join(", ")}`);
});

test("le contrat couvre au moins 15 routes GET", () => {
  assert.ok(Object.keys(SCHEMAS).length >= 15);
});
