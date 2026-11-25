/**
 * Tests de composition de `server.ts` : les hooks sont installés par
 * `installApiCore`, donc `buildApp()` exerce le même ordre que la production.
 * Aucun de ces comportements n'était couvert par un test construisant un
 * Fastify à part (C1/C2/M8/E4/E7).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { buildApp } from "../src/app.js";
import { generateApiKey, hashApiKey } from "../src/api-key.js";
import { closePools, query } from "../src/db.js";
import { installSecurityHeaders, ecrireEntetesSse } from "../src/security/headers.js";
import { evenementPublic, evenementPublicSql } from "../src/security/tlp.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `comp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const EMAIL = `${TAG}@composition.test`;
const TOKEN = `tok-${TAG}`;
const marqueurTlp = (tlp: string) => `Composition ${TAG} ${tlp}`;
const cleDedupTlp = (tlp: string) => `composition:${TAG}:${tlp}`;
const CLE = generateApiKey();
let app: FastifyInstance;
let userId: number;
let amberId: number;
let redId: number;
let clearId: number;
const alertIds: number[] = [];
let sourceId: string;
let sourceCree = false;
let runId: string;
let runCree: number | undefined;

before(async () => {
  const u = await query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','admin') RETURNING id", [EMAIL],
  );
  userId = Number(u.rows[0]!.id);
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(TOKEN), userId],
  );
  await query(
    `INSERT INTO api_key (name, key_hash, key_prefix, scope, quota, user_id)
     VALUES ($1,$2,$3,'write',100,$4)`,
    [`${TAG}-key`, hashApiKey(CLE), CLE.slice(0, 8), userId],
  );
  const source = await query<{ id: string }>("SELECT id FROM source ORDER BY id LIMIT 1");
  sourceId = source.rows[0]?.id ?? `urn:source:${TAG}`;
  if (!source.rows[0]) {
    await query(
      `INSERT INTO source (id, name, family, url, enabled)
       VALUES ($1,$2,'cti','https://example.invalid/composition',false)`,
      [sourceId, `Source composition ${TAG}`],
    );
    sourceCree = true;
  }
  // Chaîne de preuve (migration 206) : tout événement cite un collector_run
  // existant. On reprend celui de la source, ou on en crée un dédié.
  const run = await query<{ id: string }>(
    "SELECT id::text AS id FROM collector_run WHERE source_id = $1 ORDER BY id LIMIT 1",
    [sourceId],
  );
  runId = run.rows[0]?.id ?? "";
  if (!runId) {
    const cree = await query<{ id: number }>(
      `INSERT INTO collector_run (source_id, started_at, finished_at, status, items_in, items_new, kind)
       VALUES ($1, now(), now(), 'ok', 0, 0, 'analyst') RETURNING id`,
      [sourceId],
    );
    runCree = Number(cree.rows[0]!.id);
    runId = String(runCree);
  }
  for (const tlp of ["CLEAR", "AMBER", "RED"]) {
    const r = await query<{ id: number }>(
      `INSERT INTO event
         (dedup_key, family, assertion_type, title, summary, severity, confidence, source_id, source_url, observed_at, tlp, evidence, lat, lon, regional)
       VALUES ($1,'ransomware','ambient_signal',$2,$2,5,'A1',$3,'https://example.invalid/composition',now(),$4::text,
               JSONB_BUILD_OBJECT('tlp',$4::text,'run_id',$5::text),45.5,-0.5,true) RETURNING id`,
      [cleDedupTlp(tlp), marqueurTlp(tlp), sourceId, tlp, runId],
    );
    const id = Number(r.rows[0]!.id);
    if (tlp === "CLEAR") clearId = id;
    else if (tlp === "AMBER") amberId = id;
    else redId = id;
    const alerte = await query<{ id: number }>(
      `INSERT INTO alert (rule_id, title, severity, status, event_id)
       VALUES ($1,$2,5,'open',$3) RETURNING id`,
      [`composition:${TAG}:${tlp}`, `Alerte composition ${tlp}`, id],
    );
    alertIds.push(Number(alerte.rows[0]!.id));
  }
  app = await buildApp();
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM api_key WHERE user_id=$1", [userId]);
  await query("DELETE FROM app_session WHERE user_id=$1", [userId]);
  if (alertIds.length > 0) {
    await query("DELETE FROM alert WHERE id = ANY($1::bigint[])", [alertIds]);
  }
  const ids = [clearId, amberId, redId].filter((id) => Number.isFinite(id));
  if (ids.length > 0) {
    await query("DELETE FROM notification_brouillon WHERE source_event_id = ANY($1::bigint[])", [ids]);
    await supprimerEvenementsArchivees("id = ANY($1::bigint[])", [ids]);
  }
  if (runCree !== undefined) await query("DELETE FROM collector_run WHERE id=$1", [runCree]);
  if (sourceCree) await query("DELETE FROM source WHERE id=$1", [sourceId]);
  await query("DELETE FROM app_user WHERE id=$1", [userId]);
  await closePools();
});

test("une clé API valide traverse le hook d'identité avant la matrice RBAC", async () => {
  const res = await app.inject({ method: "GET", url: "/api/auth/me", headers: { "x-api-key": CLE } });
  assert.equal(res.statusCode, 200, res.body);
  assert.match(String(res.headers["ratelimit-limit"] ?? ""), /^\d+$/);
});

test("une clé d'API ne peut pas révoquer une session", async () => {
  const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { "x-api-key": CLE } });
  assert.equal(logout.statusCode, 403, logout.body);
});
test("le dépôt public de rectification n'est pas rejeté par le hook global", async () => {
  const res = await app.inject({ method: "POST", url: "/api/rectifications", payload: {} });
  assert.notEqual(res.statusCode, 401, res.body);
  assert.equal(res.statusCode, 400, res.body);
});

test("HEAD est une lecture publique sur les deux préfixes", async () => {
  for (const url of ["/api/health", "/api/stats", "/api/v1/health"]) {
    const res = await app.inject({ method: "HEAD", url });
    assert.equal(res.statusCode, 200, `${url} : ${res.body}`);
  }
});

test("CLEAR reste visible et les faits AMBER et RED sont absents des flux publics", async () => {
  assert.equal(evenementPublic({ tlp: "CLEAR", evidence: { tlp: "CLEAR" } }), true);
  assert.equal(evenementPublic({ tlp: "CLEAR" }), false, "sans déclaration TLP explicite, rien n'est public");
  assert.equal(evenementPublic({ tlp: "AMBER", evidence: JSON.stringify({ tlp: "CLEAR" }) }), false);
  assert.equal(evenementPublic({ tlp: "RED", evidence: JSON.stringify({ tlp: "RED" }) }), false);
  assert.match(evenementPublicSql("e"), /evidence->>'tlp'/);
  type IdentiteFlux = { id?: number; cle?: string; titre?: string };
  const champ = (objet: unknown, cle: string): unknown =>
    objet !== null && typeof objet === "object" && cle in objet
      ? (objet as Record<string, unknown>)[cle]
      : undefined;
  const nombre = (valeur: unknown): number | undefined => {
    const n = Number(valeur);
    return valeur !== null && valeur !== undefined && Number.isFinite(n) ? n : undefined;
  };
  const texte = (valeur: unknown): string | undefined => typeof valeur === "string" ? valeur : undefined;
  const liste = (valeur: unknown): unknown[] => Array.isArray(valeur) ? valeur : [];
  const identitesFlux = (url: string, donnees: unknown): IdentiteFlux[] => {
    if (url.startsWith("/api/events")) {
      return liste(donnees).map((e) => ({ id: nombre(champ(e, "id")), cle: texte(champ(e, "dedupKey")), titre: texte(champ(e, "title")) }));
    }
    if (url.startsWith("/api/alerts")) {
      return liste(donnees).map((a) => ({
        id: nombre(champ(a, "event_id") ?? champ(a, "eventId")),
        cle: texte(champ(a, "rule_id") ?? champ(a, "ruleId")),
        titre: texte(champ(a, "event_title") ?? champ(a, "eventTitle")),
      }));
    }
    if (url.startsWith("/api/map/timeline/events")) {
      return liste(champ(donnees, "events")).map((e) => ({ id: nombre(champ(e, "id")), titre: texte(champ(e, "title")) }));
    }
    return liste(champ(donnees, "attacks")).map((a) => ({ id: nombre(champ(a, "id")) }));
  };
  const ids: Record<string, number> = { CLEAR: clearId, AMBER: amberId, RED: redId };
  for (const url of ["/api/events?portee=toutes", "/api/alerts", "/api/map/timeline/events?bucket=all", "/api/live-map"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 200, `${url} : ${res.body}`);
    const identites = identitesFlux(url, res.json<unknown>());
    for (const tlp of ["CLEAR", "AMBER", "RED"]) {
      const visible = identites.some((i) =>
        i.id === ids[tlp] || i.cle === cleDedupTlp(tlp) || i.titre === marqueurTlp(tlp));
      assert.equal(visible, tlp === "CLEAR", `${url} : visibilité TLP:${tlp} incorrecte`);
    }
  }
   const invalide = await app.inject({ method: "GET", url: "/api/stream?sinceId=abc" });
   assert.equal(invalide.statusCode, 400, invalide.body);
 });

test("les flux hijackés portent les en-têtes de sécurité et no-store", async () => {
  const sse = Fastify({ logger: false });
  await installSecurityHeaders(sse);
  sse.get("/api/stream", (_req, reply) => {
    reply.header("X-Request-Id", "sse-test");
    reply.header("X-API-Version", "1.0.0");
    reply.hijack();
    ecrireEntetesSse(reply);
    reply.raw.end(": connected\n\n");
  });
  const res = await sse.inject({ method: "GET", url: "/api/stream" });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["content-type"] ?? ""), /text\/event-stream/);
  assert.match(String(res.headers["cache-control"] ?? ""), /no-store/);
  assert.equal(res.headers["x-request-id"], "sse-test");
  assert.equal(res.headers["x-api-version"], "1.0.0");
  assert.match(String(res.headers["permissions-policy"] ?? ""), /geolocation=\(\)/);
  await sse.close();
});

test("buildApp applique les en-têtes de sécurité de production", async () => {
  const api = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(api.statusCode, 200, api.body);
  assert.match(String(api.headers["cache-control"] ?? ""), /no-store/);
  assert.equal(api.headers["cross-origin-opener-policy"], "same-origin");
  assert.equal(api.headers["cross-origin-resource-policy"], "same-origin");
  assert.match(String(api.headers["permissions-policy"] ?? ""), /geolocation=\(\)/);

  const doc = await app.inject({ method: "GET", url: "/api/docs/" });
  assert.equal(doc.statusCode, 200, doc.body);
  assert.match(String(doc.headers["content-type"] ?? ""), /text\/html/);
  const csp = String(doc.headers["content-security-policy"] ?? "");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test("une écriture refusée ne consomme pas le quota d'une clé en lecture seule", async () => {
  const lectureSeule = generateApiKey();
  const cle = await query<{ id: number }>(
    `INSERT INTO api_key (name, key_hash, key_prefix, scope, quota, user_id)
     VALUES ($1,$2,$3,'read',1,$4) RETURNING id`,
    [`${TAG}-lecture-seule`, hashApiKey(lectureSeule), lectureSeule.slice(0, 8), userId],
  );
  const idCle = Number(cle.rows[0]!.id);
  try {
    const refuse = await app.inject({
      method: "POST", url: "/api/rectifications",
      headers: { "x-api-key": lectureSeule }, payload: {},
    });
    assert.equal(refuse.statusCode, 403, refuse.body);
    const etat = await query<{ used: string }>("SELECT used::text AS used FROM api_key WHERE id=$1", [idCle]);
    assert.equal(etat.rows[0]!.used, "0");
    // Le quota intact reste consommable par une lecture autorisée.
    const ok = await app.inject({ method: "GET", url: "/api/health", headers: { "x-api-key": lectureSeule } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(String(ok.headers["ratelimit-remaining"] ?? ""), "0");
  } finally {
    await query("DELETE FROM api_key WHERE id=$1", [idCle]);
  }
});
