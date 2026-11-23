/**
 * 3D live map — one test per observable behavior of the data source:
 * regional scope, activity window, gray sources, victim protection and the
 * SSE payload shape. Uses an ephemeral test database only.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import liveMapRoute from "../src/routes/live-map.js";
import { formatAttackEvent, type LiveAttack } from "../src/live/attacks.js";

const TAG = `live3d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const GRAY_SOURCE = `${TAG}-gray`;
const CLEAR_SOURCE = `${TAG}-clear`;
const ALLOWED_KEYS = [
  "id", "family", "assertionType", "severity", "observedAt",
  "lat", "lon", "orgId", "sourceId", "dept",
].sort();
const ago = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

let app: FastifyInstance;

type Snapshot = {
  capturedAt: string;
  windowDays: number;
  total: number;
  attacks: Record<string, unknown>[];
};

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url, statut, license)
     VALUES ($1,$2,'ransomware','https://example.invalid/gray','active',NULL),
            ($3,$4,'ransomware','https://example.invalid/clear','active','ODbL')`,
    [GRAY_SOURCE, `Gray unverified ${TAG}`, CLEAR_SOURCE, `Clear ${TAG}`],
  );
  const na = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, lat, lon)
     VALUES ($1,$2,'entreprise','33',44.84,-0.58) RETURNING id`,
    [`NA Org ${TAG}`, `na-org-${TAG}`],
  );
  const outside = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, lat, lon)
     VALUES ($1,$2,'entreprise','75',48.85,2.35) RETURNING id`,
    [`Outside Org ${TAG}`, `outside-org-${TAG}`],
  );
  const rows: [string, number, string, string, string, string | null][] = [
    // recent NA attack from a gray source; the title contains an identity that must never be exposed
    ["na-gray", na.rows[0]!.id, "third_party_claim", ago(2), GRAY_SOURCE, "CLEAR"],
    ["na-clear", na.rows[0]!.id, "confirmed_incident", ago(1), CLEAR_SOURCE, "CLEAR"],
    ["outside", outside.rows[0]!.id, "third_party_claim", ago(1), CLEAR_SOURCE, "CLEAR"],
    ["old", na.rows[0]!.id, "third_party_claim", ago(60), CLEAR_SOURCE, "CLEAR"],
    ["restricted", na.rows[0]!.id, "third_party_claim", ago(1), CLEAR_SOURCE, "RED"],
    ["noise", na.rows[0]!.id, "technical_indicator", ago(1), CLEAR_SOURCE, "CLEAR"],
  ];
  for (const [key, orgId, assertion, when, sourceId, tlp] of rows) {
    await query(
      `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at,
                          severity, source_id, org_id, tlp, evidence)
       VALUES ($1,'ransomware',$2,$3,$4,$5,4,$6,$7,$8,$9)`,
      [`${TAG}-${key}`, assertion, `Victim Jean Dupont ${key} 06 12 34 56 78`, "Résumé privé avec adresse", when,
        sourceId, orgId, tlp, JSON.stringify({ secret: "ne doit jamais sortir" })],
    );
  }
  app = Fastify();
  await app.register(liveMapRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM event WHERE dedup_key LIKE $1", [`${TAG}-%`]);
  await query("DELETE FROM org WHERE slug LIKE $1", [`%${TAG}`]);
  await query("DELETE FROM source WHERE id LIKE $1", [`${TAG}-%`]);
  await closePools();
});

test("snapshot keeps only recent Nouvelle-Aquitaine attack signals", async () => {
  const res = await app.inject({ method: "GET", url: "/api/live-map" });
  assert.equal(res.statusCode, 200);
  const body = res.json<Snapshot>();
  const sources = body.attacks.map((a) => String(a.sourceId)).sort();
  assert.deepEqual(sources, [CLEAR_SOURCE, GRAY_SOURCE].sort());
  assert.equal(body.total, 2);
  assert.equal(body.windowDays, 30);
  assert.match(body.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("snapshot never leaks victim text or source URL", async () => {
  const body = (await app.inject({ method: "GET", url: "/api/live-map" })).json<Snapshot>();
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes("Jean Dupont"));
  assert.ok(!raw.includes("06 12 34 56 78"));
  assert.ok(!raw.includes("ne doit jamais sortir"));
  assert.ok(!raw.includes("source_url"));
  for (const attack of body.attacks) {
    assert.deepEqual(Object.keys(attack).sort(), ALLOWED_KEYS);
  }
});

test("gray sources are accepted without a trust filter", async () => {
  const body = (await app.inject({ method: "GET", url: "/api/live-map" })).json<Snapshot>();
  const gray = body.attacks.find((a) => a.sourceId === GRAY_SOURCE);
  assert.ok(gray, "the attack from the gray source must be on the map");
  assert.equal(gray.sourceId, GRAY_SOURCE);
  assert.equal(gray.dept, "33");
});

test("SSE payload carries the same whitelist and no free text", () => {
  const attack: LiveAttack = {
    id: "42", family: "ransomware", assertionType: "third_party_claim", severity: 4,
    observedAt: "2026-11-22T10:00:00.000Z", lat: 44.84, lon: -0.58,
    orgId: 7, sourceId: GRAY_SOURCE, dept: "33",
  };
  const frame = formatAttackEvent(attack);
  assert.match(frame, /^event: attack\ndata: /);
  const data = JSON.parse(frame.slice(frame.indexOf("{"))) as Record<string, unknown>;
  assert.deepEqual(Object.keys(data).sort(), ALLOWED_KEYS);
  assert.ok(!frame.includes("Jean Dupont"));
});
