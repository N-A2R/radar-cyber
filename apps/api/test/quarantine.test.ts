/**
 * Tests de la promotion des revendications de quarantaine
 * (src/quarantine/promote.ts) et de la route associée (src/routes/quarantine.ts).
 *
 * Isolation : chaque enregistrement de test est jetable (préfixé TAG,
 * domaine de test en .example) et supprimé dans le `after` global.
 * Lespromotions de test sont restreintes à leurs propres faits via
 * `promoteMatches(..., { ids })` pour ne pas toucher aux données réelles.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { closePools, query } from "../src/db.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";
import {
  MIN_CONFIDENCE,
  loadOrgIndex,
  matchOrg,
  promoteMatches,
  promoteOne,
} from "../src/quarantine/promote.js";
import quarantineRoute from "../src/routes/quarantine.js";
import { hashSessionToken } from "../src/auth.js";

/** Crée un utilisateur et une session pour les routes désormais protégées. */
async function createSession(role = "lecteur"): Promise<{ token: string; userId: number }> {
  const u = await query<{ id: number }>(
    `INSERT INTO app_user (email, password_hash, role, display_name)
     VALUES ($1,'x',$2,'Test quarantaine') RETURNING id`,
    [`${next()}@example.invalid`, role]
  );
  const token = `tok-q-${next()}`;
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(token), u.rows[0].id]
  );
  return { token, userId: u.rows[0].id };
}


const TAG = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let seq = 0;
function next(): string {
  seq += 1;
  return `${TAG}-${seq}`;
}

const createdOrgs: number[] = [];
const createdFacts: Array<{ id: number; contentHash: string }> = [];

async function insertOrg(
  name: string,
  opts: { domain?: string | null; city?: string | null; kind?: string } = {}
): Promise<number> {
  const r = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, domain, city) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [name, next(), opts.kind ?? "entreprise", opts.domain ?? null, opts.city ?? null]
  );
  createdOrgs.push(r.rows[0].id);
  return r.rows[0].id;
}

async function insertFact(opts: {
  orgHint?: string | null;
  groupe?: string | null;
  rawBody?: string | null;
} = {}): Promise<{ id: number; contentHash: string }> {
  const contentHash = `hash-${next()}`;
  const r = await query<{ id: number }>(
    `INSERT INTO quarantine_raw (source, source_url, groupe, org_hint, claimed_at, extracted, raw_body, content_hash)
     VALUES ('test', $1, $2, $3, now(), '{}'::jsonb, $4, $5) RETURNING id`,
    [
      `https://example.invalid/${next()}`,
      opts.groupe ?? "Groupe Test",
      opts.orgHint ?? null,
      opts.rawBody ?? "revendication de test",
      contentHash,
    ]
  );
  const created = { id: r.rows[0].id, contentHash };
  createdFacts.push(created);
  return created;
}

function dedupKey(contentHash: string): string {
  return `quarantine:${contentHash}`;
}

async function promotedCount(ids: number[]): Promise<number> {
  const r = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM quarantine_raw WHERE id = ANY($1::bigint[]) AND promoted",
    [ids]
  );
  return Number(r.rows[0].n);
}

async function eventCount(hashes: string[]): Promise<number> {
  const r = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM event WHERE dedup_key = ANY($1::text[])",
    [hashes.map(dedupKey)]
  );
  return Number(r.rows[0].n);
}

async function alertRuleFor(hashes: string[]): Promise<string[]> {
  const r = await query<{ rule_id: string }>(
    `SELECT a.rule_id FROM alert a JOIN event e ON e.id = a.event_id
     WHERE e.dedup_key = ANY($1::text[]) ORDER BY a.rule_id`,
    [hashes.map(dedupKey)]
  );
  return r.rows.map((x) => x.rule_id);
}

after(async () => {
  const hashes = createdFacts.map((f) => f.contentHash);
  if (hashes.length) {
    const ev = await query<{ id: number }>(
      "SELECT id FROM event WHERE dedup_key = ANY($1::text[])",
      [hashes.map(dedupKey)]
    );
    const evIds = ev.rows.map((x) => x.id);
    if (evIds.length) {
      await query("DELETE FROM alert WHERE event_id = ANY($1::bigint[])", [evIds]);
      await supprimerEvenementsArchivees("id = ANY($1::bigint[])", [evIds]);
    }
  }
  const factIds = createdFacts.map((f) => f.id);
  if (factIds.length) await query("DELETE FROM quarantine_raw WHERE id = ANY($1::bigint[])", [factIds]);
  if (createdOrgs.length) await query("DELETE FROM org WHERE id = ANY($1::int[])", [createdOrgs]);
  await closePools();
});

test("matchOrg : domaine exact", async () => {
  const orgId = await insertOrg(`Acme ${TAG}`, { domain: `acme-${TAG}.example` });
  const m = await matchOrg(`www.acme-${TAG}.example`);
  assert.ok(m);
  assert.equal(m.orgId, orgId);
  assert.ok(m.confidence >= 0.9);
});

test("matchOrg : nom normalisé (accents, casse, ponctuation)", async () => {
  const orgId = await insertOrg(`Société Générale ${TAG}`);
  const m = await matchOrg(`societe-generale-${TAG}`);
  assert.ok(m);
  assert.equal(m.orgId, orgId);
  assert.ok(m.confidence >= 0.9);
});

test("matchOrg : ville + nom", async () => {
  // Nom et ville distincts des organisations réelles (« Dassault … Mérignac »
  // existe en base et ramènerait un id plus faible à égalité de score).
  const orgId = await insertOrg(`Villetaine-${TAG} Aviation`, { city: "Mérignac" });
  const m = await matchOrg(`Villetaine-${TAG} Mérignac`);
  assert.ok(m);
  assert.equal(m.orgId, orgId);
  assert.ok(m.confidence >= MIN_CONFIDENCE);
});

test("matchOrg : négatifs (vide, inconnu, ville seule)", async () => {
  await insertOrg(`Babouche ${TAG}`, { city: `Villetaine-${TAG}` });
  assert.equal(await matchOrg(""), null);
  assert.equal(await matchOrg("   "), null);
  assert.equal(await matchOrg(`introuvable-${TAG}-xyz`), null);
  // La ville seule ne désigne pas une organisation.
  assert.equal(await matchOrg(`Villetaine-${TAG}`), null);
});

test("promotion automatique : promotion, événement, alerte, idempotence", async () => {
  const orgId = await insertOrg(`Promo ${TAG}`, { domain: `promo-${TAG}.example` });
  const fact = await insertFact({ orgHint: `promo-${TAG}.example`, groupe: "Groupe Promo" });

  const first = await promoteMatches(false, { ids: [fact.id], log: () => {} });
  assert.equal(first.scanned, 1);
  assert.equal(first.matched, 1);
  assert.equal(first.promoted, 1);
  assert.equal(first.eventsCreated, 1);
  assert.equal(first.alertsCreated, 1);
  assert.equal(await promotedCount([fact.id]), 1);
  assert.equal(await eventCount([fact.contentHash]), 1);
  assert.deepEqual(await alertRuleFor([fact.contentHash]), ["ransomware-revendication"]);

  const row = await query<{ promoted_by: string; status: string }>(
    "SELECT promoted_by, status FROM quarantine_raw WHERE id=$1",
    [fact.id]
  );
  assert.equal(row.rows[0].promoted_by, "auto");
  assert.equal(row.rows[0].status, "promoted");

  const ev = await query<{ family: string; assertion_type: string; org_id: number | null }>(
    "SELECT family, assertion_type, org_id FROM event WHERE dedup_key=$1",
    [dedupKey(fact.contentHash)]
  );
  assert.equal(ev.rows[0].family, "ransomware");
  assert.equal(ev.rows[0].assertion_type, "third_party_claim");
  assert.equal(ev.rows[0].org_id, orgId);

  // Second passage : le fait n'est plus candidat, aucun doublon.
  const second = await promoteMatches(false, { ids: [fact.id], log: () => {} });
  assert.equal(second.scanned, 0);
  assert.equal(second.promoted, 0);
  assert.equal(await eventCount([fact.contentHash]), 1);
  assert.deepEqual(await alertRuleFor([fact.contentHash]), ["ransomware-revendication"]);
});

test("promotion automatique : dryRun n'écrit rien", async () => {
  await insertOrg(`Dry ${TAG}`, { domain: `dry-${TAG}.example` });
  const fact = await insertFact({ orgHint: `dry-${TAG}.example` });

  const r = await promoteMatches(true, { ids: [fact.id], log: () => {} });
  assert.equal(r.matched, 1);
  assert.equal(r.promoted, 0);
  assert.equal(r.eventsCreated, 0);
  assert.equal(await promotedCount([fact.id]), 0);
  assert.equal(await eventCount([fact.contentHash]), 0);
});

test("promotion manuelle : promoteOne, idempotence, introuvable", async () => {
  const orgId = await insertOrg(`Manual ${TAG}`, { domain: `manual-${TAG}.example` });
  const fact = await insertFact({ orgHint: `manual-${TAG}.example` });

  const first = await promoteOne(fact.id, "analyste@example.invalid");
  assert.equal(first.found, true);
  assert.equal(first.alreadyPromoted, false);
  assert.equal(first.orgId, orgId);
  assert.equal(first.alertsCreated, 1);

  const second = await promoteOne(fact.id, "analyste@example.invalid");
  assert.equal(second.found, true);
  assert.equal(second.alreadyPromoted, true);
  assert.equal(await eventCount([fact.contentHash]), 1);

  const missing = await promoteOne(999999999, "analyste@example.invalid");
  assert.equal(missing.found, false);
});

test("route : lectures protégées par jeton", async () => {
  const app = Fastify({ logger: false });
  await app.register(quarantineRoute, { prefix: "/api" });
  await app.ready();
  try {
    const anon = await app.inject({ method: "GET", url: "/api/quarantine?limit=5" });
    assert.equal(anon.statusCode, 401);
    const anonStats = await app.inject({ method: "GET", url: "/api/quarantine/stats" });
    assert.equal(anonStats.statusCode, 401);
    const anonQueue = await app.inject({ method: "GET", url: "/api/quarantine/queue" });
    assert.equal(anonQueue.statusCode, 401);

    const { token } = await createSession("lecteur");
    const auth = { authorization: `Bearer ${token}` };

    const list = await app.inject({ method: "GET", url: "/api/quarantine?limit=5", headers: auth });
    assert.equal(list.statusCode, 200);
    assert.ok(Array.isArray(list.json()));

    const stats = await app.inject({ method: "GET", url: "/api/quarantine/stats", headers: auth });
    assert.equal(stats.statusCode, 200);
    const body = stats.json() as {
      total: number;
      pendingUnpromoted: number;
      byStatus: unknown[];
      byPromoted: unknown[];
    };
    assert.equal(typeof body.total, "number");
    assert.equal(typeof body.pendingUnpromoted, "number");
    assert.ok(Array.isArray(body.byStatus));
    assert.ok(Array.isArray(body.byPromoted));

    // La file de revue est réservée aux analystes, pas à tout lecteur authentifié.
    const queueLecteur = await app.inject({ method: "GET", url: "/api/quarantine/queue", headers: auth });
    assert.equal(queueLecteur.statusCode, 403);

    const post = await app.inject({ method: "POST", url: "/api/quarantine/1/promote" });
    assert.equal(post.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("route : org rapprochée exposée sur le fait", async () => {
  const orgId = await insertOrg(`Exposed ${TAG}`, { domain: `exposed-${TAG}.example` });
  await insertFact({ orgHint: `exposed-${TAG}.example` });
  const app = Fastify({ logger: false });
  await app.register(quarantineRoute, { prefix: "/api" });
  await app.ready();
  try {
    const { token } = await createSession("lecteur");
    const res = await app.inject({
      method: "GET",
      url: `/api/quarantine?source=test&limit=50`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const rows = res.json() as Array<{ orgHint: string | null; org: { id: number } | null }>;
    const row = rows.find((r) => r.orgHint === `exposed-${TAG}.example`);
    assert.ok(row, "fait de test absent de la réponse");
    assert.equal(row.org?.id, orgId);
  } finally {
    await app.close();
  }
});

test("loadOrgIndex : charge les organisations actives", async () => {
  const index = await loadOrgIndex();
  assert.ok(Array.isArray(index));
  assert.ok(index.length > 0);
  for (const e of index) {
    assert.equal(typeof e.nameNorm, "string");
  }
});

test("un corps illisible n'entre pas dans la file de revue", async () => {
  const { reviewQueue } = await import("../src/quarantine/review.js");
  const org = await insertOrg(`Corps Illisible ${TAG}`, { domain: `corps-${TAG}.example` });
  const fait = await insertFact({ orgHint: `corps-${TAG}.example`, groupe: "Groupe Corps" });
  const corps = await insertFact({ orgHint: null, rawBody: "<html>bruit</html>" });
  await query("UPDATE quarantine_raw SET kind='unparsable' WHERE id=$1", [corps.id]);

  try {
    const queue = await reviewQueue({ limit: 200 });
    // `id` est un bigint : pg le rend en chaîne, la file en nombre.
    const ids = queue.rows.map((row) => row.id);
    assert.ok(ids.includes(Number(fait.id)), "un fait ordinaire doit rester dans la file");
    assert.ok(!ids.includes(Number(corps.id)), "un corps illisible ne doit jamais être proposé à un humain");
  } finally {
    await query("DELETE FROM quarantine_raw WHERE id = ANY($1::bigint[])", [[fait.id, corps.id]]).catch(() => {});
    await query("DELETE FROM org WHERE id=$1", [org]).catch(() => {});
  }
});

test("un domaine identique est une clé, pas une ressemblance", async () => {
  const domain = `cle-${TAG}.example`;
  const org = await insertOrg(`Organisation Cle ${TAG}`, { domain });

  const exact = await matchOrg(domain);
  assert.ok(exact, "un domaine présent au référentiel doit se rattacher");
  assert.equal(exact.orgId, org);
  assert.equal(exact.via, "domain", "l'égalité de domaine doit être marquée comme telle");
  assert.ok(exact.confidence >= 0.95);

  // Le même indice par le nom seul ne doit pas prétendre être un domaine.
  const parNom = await matchOrg(`Organisation Cle ${TAG}`);
  assert.ok(parNom);
  assert.equal(parNom.via, "name");

  await query("DELETE FROM org WHERE id=$1", [org]).catch(() => {});
});

test("un jeton générique (« com ») ne fonde jamais un rattachement", async () => {
  // Cas réel : une organisation nommée « N-COM (N-COM) » se réduisait au jeton
  // « com », présent dans tous les domaines en .com. Huit revendications d'un
  // lot de dix lui ont été rattachées.
  const org = await insertOrg(`N-COM (N-COM) ${TAG}`, { domain: `ncom-${TAG}.example` });
  const vrai = await insertOrg(`Vraie Cible ${TAG}`, { domain: `cible-${TAG}.example` });

  try {
    const faux = await matchOrg(`advelo-${TAG}.com`);
    assert.ok(
      !faux || faux.orgId !== org,
      "un domaine en .com ne doit pas se rattacher à une organisation nommée N-COM",
    );

    // Le domaine exact reste une clé : la vraie cible se trouve toujours.
    const exact = await matchOrg(`cible-${TAG}.example`);
    assert.ok(exact);
    assert.equal(exact.orgId, vrai);
    assert.equal(exact.via, "domain");
  } finally {
    await query("DELETE FROM org WHERE id = ANY($1::int[])", [[org, vrai]]).catch(() => {});
  }
});
