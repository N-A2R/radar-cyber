/**
 * Tests du moteur de détection (src/detect/engine.ts)
 * et des routes d'alertes (src/routes/alerts.ts).
 *
 * Isolation : chaque test crée des enregistrements jetables (préfixés TAG)
 * et les supprime dans un `finally`. Aucune donnée de production n'est
 * modifiée ; les règles de test sont retirées et le cache rechargé.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { query, closePools } from "../src/db.js";
import { loadRules, evaluateEvent, evaluateIndicator } from "../src/detect/engine.js";
import type { RuleMatch } from "../src/detect/engine.js";
import alertsRoute from "../src/routes/alerts.js";
import { hashSessionToken } from "../src/auth.js";

const TAG = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let seq = 0;
function next(): string {
  seq += 1;
  return `${TAG}-${seq}`;
}

type TestIds = {
  events: number[];
  orgs: number[];
  rules: string[];
  indicators: number[];
  alerts: number[];
  users: number[];
};

function newIds(): TestIds {
  return { events: [], orgs: [], rules: [], indicators: [], alerts: [], users: [] };
}

let cachedSourceId: string | null = null;
async function sourceId(): Promise<string> {
  if (cachedSourceId === null) {
    const r = await query<{ id: string }>("SELECT id FROM source ORDER BY id LIMIT 1");
    cachedSourceId = r.rows[0].id;
  }
  return cachedSourceId;
}

async function insertOrg(name: string, kind: string, dept: string | null = null): Promise<number> {
  const r = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,$3,$4) RETURNING id",
    [name, next(), kind, dept]
  );
  return r.rows[0].id;
}

type NewEvent = {
  family: string;
  assertionType: string;
  title: string;
  summary?: string | null;
  confidence?: string | null;
  severity?: number;
  orgId?: number | null;
};

async function insertEvent(e: NewEvent): Promise<number> {
  const r = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, summary, severity, confidence, source_id, org_id, evidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      next(),
      e.family,
      e.assertionType,
      e.title,
      e.summary ?? null,
      e.severity ?? 3,
      e.confidence ?? null,
      await sourceId(),
      e.orgId ?? null,
      "{}",
    ]
  );
  return r.rows[0].id;
}

async function insertRule(id: string, match: RuleMatch, severity = 4): Promise<void> {
  await query(
    `INSERT INTO detection_rule (id, name, description, severity, enabled, match, action)
     VALUES ($1,$2,NULL,$3,true,$4,'alert')`,
    [id, id, severity, JSON.stringify(match)]
  );
  // Le cache de règles est module-level : on le force après chaque écriture.
  await loadRules(true);
}

async function insertIndicator(type: string, value: string, confidence: string): Promise<number> {
  const r = await query<{ id: number }>(
    "INSERT INTO indicator (type, value, confidence) VALUES ($1,$2,$3) RETURNING id",
    [type, value, confidence]
  );
  return r.rows[0].id;
}

async function insertAlert(ruleId: string, severity = 4): Promise<number> {
  const r = await query<{ id: number }>(
    `INSERT INTO alert (rule_id, title, severity, status) VALUES ($1,$2,$3,'open') RETURNING id`,
    [ruleId, `Alerte ${ruleId}`, severity]
  );
  return r.rows[0].id;
}

async function createSession(role = "analyste"): Promise<{ token: string; userId: number }> {
  const u = await query<{ id: number }>(
    `INSERT INTO app_user (email, password_hash, role, display_name) VALUES ($1,'x',$2,'Test détect') RETURNING id`,
    [`${next()}@example.invalid`, role]
  );
  const token = `tok-${next()}`;
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(token), u.rows[0].id]
  );
  return { token, userId: u.rows[0].id };
}

async function countAlerts(where: string, params: unknown[]): Promise<number> {
  const r = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM alert WHERE ${where}`, params);
  return Number(r.rows[0].n);
}

async function alertStatus(id: number): Promise<string> {
  const r = await query<{ status: string }>("SELECT status FROM alert WHERE id=$1", [id]);
  return r.rows[0].status;
}

async function cleanup(ids: TestIds): Promise<void> {
  if (ids.alerts.length > 0) await query("DELETE FROM alert WHERE id = ANY($1::int[])", [ids.alerts]);
  if (ids.events.length > 0) await query("DELETE FROM alert WHERE event_id = ANY($1::bigint[])", [ids.events]);
  if (ids.indicators.length > 0) await query("DELETE FROM alert WHERE indicator_id = ANY($1::bigint[])", [ids.indicators]);
  if (ids.rules.length > 0) await query("DELETE FROM alert WHERE rule_id = ANY($1::text[])", [ids.rules]);
  if (ids.events.length > 0) await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [ids.events]);
  if (ids.orgs.length > 0) await query("DELETE FROM org WHERE id = ANY($1::int[])", [ids.orgs]);
  if (ids.indicators.length > 0) await query("DELETE FROM indicator WHERE id = ANY($1::bigint[])", [ids.indicators]);
  if (ids.rules.length > 0) await query("DELETE FROM detection_rule WHERE id = ANY($1::text[])", [ids.rules]);
  if (ids.users.length > 0) await query("DELETE FROM app_user WHERE id = ANY($1::int[])", [ids.users]);
  // Repousse l'état du cache vers la base (règles de test supprimées).
  await loadRules(true);
}

async function makeApp() {
  const app = Fastify({ logger: false });
  await app.register(alertsRoute, { prefix: "/api" });
  await app.ready();
  return app;
}

after(async () => {
  await closePools();
});

test("loadRules charge les règles actives", async () => {
  const rules = await loadRules();
  assert.ok(Array.isArray(rules));
  assert.ok(rules.length >= 7);
  assert.ok(rules.every((r) => r.enabled === true));
  const fresh = await loadRules(true);
  assert.equal(fresh.length, rules.length);
});

test("confiance : min_confidence 3 exclut C3/B2 et admet A2/A1", async () => {
  const ids = newIds();
  const ruleId = `test-conf-${TAG}`;
  ids.rules.push(ruleId);
  try {
    // Adaptation (seuil de confiance 65) : les événements acceptés sont
    // rattachés à une organisation géolocalisée en third_party_claim pour
    // franchir le seuil sans déclencher de règle de production (famille dédiée).
    await insertRule(ruleId, { family: "testconf", min_confidence: 3 });
    const org = await insertOrg(`Org confiance ${TAG}`, "collectivite", "33");
    ids.orgs.push(org);
    const c3 = await insertEvent({ family: "testconf", assertionType: "ambient_signal", title: "Confiance C3", confidence: "C3", orgId: org });
    const b2 = await insertEvent({ family: "testconf", assertionType: "ambient_signal", title: "Confiance B2", confidence: "B2", orgId: org });
    const a2 = await insertEvent({ family: "testconf", assertionType: "third_party_claim", title: "Confiance A2", confidence: "A2", orgId: org });
    const a1 = await insertEvent({ family: "testconf", assertionType: "third_party_claim", title: "Confiance A1", confidence: "A1", orgId: org });
    ids.events.push(c3, b2, a2, a1);

    assert.equal(await evaluateEvent(c3), 0, "C3 (rang 1) sous le seuil 3");
    assert.equal(await evaluateEvent(b2), 0, "B2 (rang 2) sous le seuil 3");
    assert.equal(await evaluateEvent(a2), 1, "A2 (rang 3) au seuil");
    assert.equal(await evaluateEvent(a1), 1, "A1 (rang 4) au-dessus du seuil");

    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, c3]), 0);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, b2]), 0);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, a2]), 1);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, a1]), 1);
  } finally {
    await cleanup(ids);
  }
});

test("famille : la règle ransomware matche un ransomware, pas un vuln", async () => {
  const ids = newIds();
  const ruleId = `test-fam-${TAG}`;
  ids.rules.push(ruleId);
  try {
    // Adaptation (seuil de confiance 65) : l'événement attendu reçoit une
    // source A1, un rattachement géolocalisé et reste ambient_signal pour
    // franchir le seuil sans activer la règle de production
    // ransomware-revendication (qui exige third_party_claim).
    await insertRule(ruleId, { family: "ransomware" });
    const org = await insertOrg(`Org famille ${TAG}`, "collectivite", "33");
    ids.orgs.push(org);
    const hit = await insertEvent({ family: "ransomware", assertionType: "ambient_signal", title: "Rançongiciel", confidence: "A1", orgId: org });
    const miss = await insertEvent({ family: "vuln", assertionType: "ambient_signal", title: "Vulnérabilité", confidence: "A1", orgId: org });
    ids.events.push(hit, miss);

    assert.equal(await evaluateEvent(hit), 1);
    assert.equal(await evaluateEvent(miss), 0);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, hit]), 1);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, miss]), 0);
  } finally {
    await cleanup(ids);
  }
});

test("assertion_type : la règle confirmed_incident matche, pas ambient_signal", async () => {
  const ids = newIds();
  const ruleId = `test-assert-${TAG}`;
  ids.rules.push(ruleId);
  try {
    // Adaptation (seuil de confiance 65) : l'incident confirmé est rattaché à
    // une organisation géolocalisée pour franchir le seuil ; la règle de
    // production incident-confirme peut aussi correspondre, d'où le >= 1.
    await insertRule(ruleId, { assertion_type: "confirmed_incident" });
    const org = await insertOrg(`Org assertion ${TAG}`, "collectivite", "33");
    ids.orgs.push(org);
    const hit = await insertEvent({ family: "testassert", assertionType: "confirmed_incident", title: "Incident confirmé", confidence: "A2", orgId: org });
    const miss = await insertEvent({ family: "testassert", assertionType: "ambient_signal", title: "Signal ambiant", confidence: "A2", orgId: org });
    ids.events.push(hit, miss);

    // La règle de production incident-confirme matche aussi hit : on vérifie notre règle.
    assert.ok((await evaluateEvent(hit)) >= 1);
    assert.equal(await evaluateEvent(miss), 0);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, hit]), 1);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, miss]), 0);
  } finally {
    await cleanup(ids);
  }
});

test("mots-clés : any matche sur le titre ou le summary", async () => {
  const ids = newIds();
  const ruleId = `test-kw-${TAG}`;
  ids.rules.push(ruleId);
  try {
    // Adaptation (seuil de confiance 65) : les événements qui doivent ouvrir
    // une alerte sont portés par une source A1 et une organisation géolocalisée
    // afin de dépasser le seuil sans modifier la sémantique des mots-clés.
    await insertRule(ruleId, { family: "phishing", keywords: { any: ["banque", "bank"] } });
    const org = await insertOrg(`Org mots-clés ${TAG}`, "collectivite", "33");
    ids.orgs.push(org);
    const titleHit = await insertEvent({ family: "phishing", assertionType: "ambient_signal", title: "CAMPAGNE DE PHISHING BANQUE", summary: "RAS", confidence: "A1", orgId: org });
    const summaryHit = await insertEvent({ family: "phishing", assertionType: "ambient_signal", title: "Phishing generique", summary: "Tentative de phishing sur une banque", confidence: "A1", orgId: org });
    const miss = await insertEvent({ family: "phishing", assertionType: "ambient_signal", title: "Phishing generique", summary: "Aucune cible", confidence: "A1", orgId: org });
    ids.events.push(titleHit, summaryHit, miss);

    assert.equal(await evaluateEvent(titleHit), 1);
    assert.equal(await evaluateEvent(summaryHit), 1);
    assert.equal(await evaluateEvent(miss), 0);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, titleHit]), 1);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, summaryHit]), 1);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, miss]), 0);
  } finally {
    await cleanup(ids);
  }
});

test("org_kind : la règle matche la nature d'organisation, pas une autre", async () => {
  const ids = newIds();
  const ruleId = `test-orgkind-${TAG}`;
  ids.rules.push(ruleId);
  try {
    // Adaptation (seuil de confiance 65) : la collectivité est géolocalisée et
    // l'événement porté par une source A1 pour franchir le seuil ; le critère
    // testé (nature d'organisation) reste inchangé.
    await insertRule(ruleId, { org_kind: "collectivite" });
    const col = await insertOrg(`Collectivité ${TAG}`, "collectivite", "33");
    const ent = await insertOrg(`Entreprise ${TAG}`, "entreprise", "33");
    ids.orgs.push(col, ent);
    const hit = await insertEvent({ family: "testorg", assertionType: "ambient_signal", title: "Cible collectivité", confidence: "A1", orgId: col });
    const miss = await insertEvent({ family: "testorg", assertionType: "ambient_signal", title: "Cible entreprise", confidence: "A1", orgId: ent });
    ids.events.push(hit, miss);

    assert.equal(await evaluateEvent(hit), 1);
    assert.equal(await evaluateEvent(miss), 0);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, hit]), 1);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, miss]), 0);
  } finally {
    await cleanup(ids);
  }
});

test("idempotence : evaluateEvent appelé deux fois ne crée qu'une alerte", async () => {
  const ids = newIds();
  const ruleId = `test-idem-${TAG}`;
  ids.rules.push(ruleId);
  try {
    // Adaptation (seuil de confiance 65) : l'événement est rattaché à une
    // organisation géolocalisée et porté par une source A1 pour franchir le
    // seuil ; l'idempotence (ON CONFLICT DO NOTHING) reste le comportement testé.
    await insertRule(ruleId, { family: "testidem" });
    const org = await insertOrg(`Org idempotence ${TAG}`, "collectivite", "33");
    ids.orgs.push(org);
    const ev = await insertEvent({ family: "testidem", assertionType: "ambient_signal", title: "Idempotence", confidence: "A1", orgId: org });
    ids.events.push(ev);

    const first = await evaluateEvent(ev);
    const second = await evaluateEvent(ev);
    assert.equal(first, 1);
    assert.equal(second, 0);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, ev]), 1);
    assert.equal(await countAlerts("event_id=$1", [ev]), 1);
  } finally {
    await cleanup(ids);
  }
});

test("evaluateIndicator : type + confiance, idempotent", async () => {
  const ids = newIds();
  const ruleId = `test-ind-${TAG}`;
  ids.rules.push(ruleId);
  try {
    await insertRule(ruleId, { indicator_type: "ip", min_confidence: 3 });
    const ip = await insertIndicator("ip", `${TAG}-ip-${next()}`, "A1");
    const low = await insertIndicator("ip", `${TAG}-low-${next()}`, "C3");
    const dom = await insertIndicator("domain", `${TAG}-dom-${next()}`, "A1");
    ids.indicators.push(ip, low, dom);

    assert.equal(await evaluateIndicator(ip), 1);
    assert.equal(await evaluateIndicator(ip), 0);
    assert.equal(await evaluateIndicator(low), 0);
    assert.equal(await evaluateIndicator(dom), 0);
    assert.equal(await countAlerts("rule_id=$1 AND indicator_id=$2", [ruleId, ip]), 1);
  } finally {
    await cleanup(ids);
  }
});

test("auth : lectures et écritures d'alertes exigent un jeton", async () => {
  const app = await makeApp();
  const ids = newIds();
  try {
    const ack = await app.inject({ method: "POST", url: "/api/alerts/1/ack" });
    assert.equal(ack.statusCode, 401);

    // Le contenu des alertes n'est plus public : un jeton est requis.
    const list = await app.inject({ method: "GET", url: "/api/alerts" });
    assert.equal(list.statusCode, 401);

    const stats = await app.inject({ method: "GET", url: "/api/alerts/stats" });
    assert.equal(stats.statusCode, 401);

    // Avec un jeton, la lecture repasse en 200.
    const { token, userId } = await createSession("lecteur");
    ids.users.push(userId);
    const authed = await app.inject({
      method: "GET",
      url: "/api/alerts",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(authed.statusCode, 200);
    assert.ok(Array.isArray(authed.json()));
  } finally {
    await cleanup(ids);
    await app.close();
  }
});

test("statuts : ack puis resolve avec un token valide", async () => {
  const app = await makeApp();
  const ids = newIds();
  try {
    const { token, userId } = await createSession("analyste");
    ids.users.push(userId);
    const alertId = await insertAlert(`test-ack-${TAG}`, 4);
    ids.alerts.push(alertId);

    const ack = await app.inject({
      method: "POST",
      url: `/api/alerts/${alertId}/ack`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(ack.statusCode, 200);
    assert.equal(ack.json().ok, true);
    assert.equal(await alertStatus(alertId), "ack");

    const resolve = await app.inject({
      method: "POST",
      url: `/api/alerts/${alertId}/resolve`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resolve.statusCode, 200);
    assert.equal(resolve.json().ok, true);
    assert.equal(await alertStatus(alertId), "resolved");

    // Le jeton reste requis pour l'écriture.
    const noauth = await app.inject({ method: "POST", url: `/api/alerts/${alertId}/ack` });
    assert.equal(noauth.statusCode, 401);
    assert.equal(await alertStatus(alertId), "resolved");
  } finally {
    await app.close();
    await cleanup(ids);
  }
});

test("stats : comptes cohérents avec la table alert", async () => {
  const app = await makeApp();
  const ids = newIds();
  try {
    const { token, userId } = await createSession("lecteur");
    ids.users.push(userId);
    const res = await app.inject({
      method: "GET",
      url: "/api/alerts/stats",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const rows = res.json() as { status: string; severity: number; count: string }[];
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length > 0);

    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
    assert.equal(total, await countAlerts("1=1", []));

    for (const r of rows) {
      assert.ok(["open", "ack", "resolved"].includes(r.status), `statut inattendu ${r.status}`);
      assert.ok(Number.isInteger(r.severity) && r.severity >= 1 && r.severity <= 5);
      assert.ok(Number.isInteger(Number(r.count)) && Number(r.count) > 0);
    }
  } finally {
    await app.close();
  }
});

test("filtres : status, severity et limit", async () => {
  const app = await makeApp();
  const ids = newIds();
  try {
    const { token, userId } = await createSession("analyste");
    ids.users.push(userId);
    const a5 = await insertAlert(`test-filter-${TAG}`, 5);
    const a3 = await insertAlert(`test-filter-${TAG}`, 3);
    ids.alerts.push(a5, a3);
    await app.inject({ method: "POST", url: `/api/alerts/${a5}/ack`, headers: { authorization: `Bearer ${token}` } });

    const byStatus = await app.inject({ method: "GET", url: "/api/alerts?status=ack&limit=500", headers: { authorization: `Bearer ${token}` } });
    assert.equal(byStatus.statusCode, 200);
    const ackRows = byStatus.json() as { id: number; status: string }[];
    assert.ok(ackRows.length >= 1);
    assert.ok(ackRows.every((r) => r.status === "ack"));
    assert.ok(ackRows.some((r) => r.id === a5));

    const bySeverity = await app.inject({ method: "GET", url: "/api/alerts?severity=5&limit=500", headers: { authorization: `Bearer ${token}` } });
    assert.equal(bySeverity.statusCode, 200);
    const sevRows = bySeverity.json() as { id: number; severity: number }[];
    assert.ok(sevRows.length >= 1);
    assert.ok(sevRows.every((r) => r.severity === 5));
    assert.ok(sevRows.some((r) => r.id === a5));

    const limited = await app.inject({ method: "GET", url: "/api/alerts?limit=1", headers: { authorization: `Bearer ${token}` } });
    assert.equal(limited.statusCode, 200);
    assert.equal((limited.json() as unknown[]).length, 1);
  } finally {
    await app.close();
    await cleanup(ids);
  }
});

test("seuil : au-dessus de 65, l'alerte est créée avec score et composantes tracés", async () => {
  const ids = newIds();
  const ruleId = `test-seuil-haut-${TAG}`;
  ids.rules.push(ruleId);
  try {
    await insertRule(ruleId, { family: "testseuilhaut" });
    const org = await insertOrg(`Org seuil haut ${TAG}`, "collectivite", "33");
    ids.orgs.push(org);
    // A2 + third_party_claim + org géolocalisée + 1 source = 71 >= 65.
    const ev = await insertEvent({ family: "testseuilhaut", assertionType: "third_party_claim", title: "Au-dessus du seuil", confidence: "A2", orgId: org });
    ids.events.push(ev);

    assert.equal(await evaluateEvent(ev), 1);
    assert.equal(await countAlerts("rule_id=$1 AND event_id=$2", [ruleId, ev]), 1);

    const r = await query<{ evidence: unknown }>(
      "SELECT evidence FROM alert WHERE rule_id=$1 AND event_id=$2",
      [ruleId, ev]
    );
    assert.equal(r.rows.length, 1);
    const evidence = typeof r.rows[0].evidence === "string" ? JSON.parse(r.rows[0].evidence) : r.rows[0].evidence as Record<string, unknown>;
    const confidence = evidence.confidence as Record<string, unknown>;
    assert.ok(confidence, "evidence.confidence manquant");
    assert.ok(Number(confidence.score) >= 65, `score attendu >= 65, obtenu ${String(confidence.score)}`);
    assert.equal(confidence.status, "verifie");
    assert.equal(confidence.threshold, 65);
    assert.equal(confidence.distinct_sources, 1);
    const components = confidence.components as Record<string, unknown>;
    assert.equal(typeof components.source_reliability, "number");
    assert.equal(typeof components.assertion_strength, "number");
    assert.equal(typeof components.attachment_quality, "number");
    assert.equal(typeof components.corroboration, "number");
  } finally {
    await cleanup(ids);
  }
});

test("seuil : sous 65, aucune alerte n'est créée mais l'événement reste consultable", async () => {
  const ids = newIds();
  const ruleId = `test-seuil-bas-${TAG}`;
  ids.rules.push(ruleId);
  try {
    await insertRule(ruleId, { family: "testseuilbas" });
    // C3 + ambient_signal + sans organisation = 21 < 65 : revendication non admise.
    const ev = await insertEvent({ family: "testseuilbas", assertionType: "ambient_signal", title: "Sous le seuil", confidence: "C3" });
    ids.events.push(ev);

    const first = await evaluateEvent(ev);
    const second = await evaluateEvent(ev);
    assert.equal(first, 0, "aucune alerte ne doit être ouverte sous le seuil");
    assert.equal(second, 0, "réévaluation idempotente : toujours aucune alerte");
    assert.equal(await countAlerts("event_id=$1", [ev]), 0);

    const stillThere = await query<{ id: number }>("SELECT id FROM event WHERE id=$1", [ev]);
    assert.equal(stillThere.rows.length, 1, "l'événement doit rester dans le fil");
  } finally {
    await cleanup(ids);
  }
});
