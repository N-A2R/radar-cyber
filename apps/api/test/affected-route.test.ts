/**
 * GET /affected — one HTTP behaviour per test.
 *
 * The disposable test database from test/run.ts is seeded with a grey-source
 * event whose free text contains a fake victim identity. It must never appear
 * in the answer.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import affectedRoute from "../src/routes/affected.js";
import { sirenUnique } from "./helpers/siren.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `aff${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SIREN = sirenUnique("affected-route");
const SOURCE = `${TAG}-grey`;
const NA_SLUG = `${TAG}-na`;
const OUT_SLUG = `${TAG}-out`;
const SECRET = "Victime Jean Dupont 0601020304 victime@example.fr";
const PROOF_URL = `https://example.invalid/${TAG}/claim?token=secret#fragment`;
const OBSERVED = "2026-11-20T10:00:00.000Z";

let app: FastifyInstance;
let naId: number;
let outId: number;

before(async () => {
  await query(
    "INSERT INTO source (id, name, family, url) VALUES ($1,$2,'ransomware',$3)",
    [SOURCE, "RansomLook test", "https://example.invalid/ransomlook"],
  );
  const na = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, sector, city, dept, siren, entity_code, entity_source, geo_source)
     VALUES ($1,$2,'association','environment','Bordeaux','33','${SIREN}','SIRENE-TEST','sirene','sirene')
     RETURNING id`,
    [`Association Riveraine ${TAG}`, NA_SLUG],
  );
  const out = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept)
     VALUES ($1,$2,'entreprise','75') RETURNING id`,
    [`Organisation Hors Region ${TAG}`, OUT_SLUG],
  );
  naId = na.rows[0]!.id;
  outId = out.rows[0]!.id;
  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at,
                        source_id, source_url, evidence, org_id, regional, regional_motif)
     VALUES ($1,'ransomware','third_party_claim',$2,$3,$4,$5,COALESCE($6, 'https://example.invalid/event'),$7::jsonb || '{"run_id":"1"}'::jsonb,$8,true,'rattachement')`,
    [
      `${TAG}:claim`,
      SECRET,
      SECRET,
      OBSERVED,
      SOURCE,
      PROOF_URL,
      JSON.stringify({ raw_body: SECRET, group: "actor" }),
      naId,
    ],
  );
  app = Fastify({ logger: false });
  await app.register(affectedRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  // Le trigger `victim_alert_on_event` crée une alerte pour la revendication :
  // elle référence encore l'organisation supprimée si on ne la retire pas.
  await query("DELETE FROM alert WHERE org_id = ANY($1::int[])", [[naId, outId]]);
  await supprimerEvenementsArchivees("source_id = $1", [SOURCE]);
  await query("DELETE FROM org WHERE slug = ANY($1::text[])", [[NA_SLUG, OUT_SLUG]]);
  await query("DELETE FROM source WHERE id = $1", [SOURCE]);
  await closePools();
});

test("a Nouvelle-Aquitaine organization gets a report with evidence", async () => {
  const res = await app.inject({ method: "GET", url: `/api/affected?q=${naId}` });
  assert.equal(res.statusCode, 200);
  const body = res.json<{ scope: string; statements: Array<{ evidence: { reference: string } }>; summary: { statements: number; withEvidence: number } }>();
  assert.equal(body.scope, "nouvelle-aquitaine");
  assert.ok(body.statements.some((s) => s.evidence.reference.startsWith("event:")));
  assert.equal(body.summary.statements, body.summary.withEvidence);
});

test("a grey-source claim is visible and labelled unconfirmed", async () => {
  const res = await app.inject({ method: "GET", url: `/api/affected?q=${naId}` });
  const claim = res.json<{ statements: Array<{ id: string; evidence: { status: string; label: string } }> }>()
    .statements.find((s) => s.id.startsWith("event:"));
  assert.ok(claim);
  assert.equal(claim.evidence.status, "unverified-claim");
  assert.match(claim.evidence.label, /Grey$/);
});

test("level 4 returns the verbatim event payload", async () => {
  const res = await app.inject({ method: "GET", url: `/api/affected?q=${naId}` });
  assert.equal(res.statusCode, 200);
  const claim = res.json<{ statements: Array<{ id: string; raw?: { title: string | null; summary: string | null; sourceUrl: string | null; evidence: unknown } }> }>()
    .statements.find((s) => s.id.startsWith("event:"));
  assert.ok(claim?.raw);
  assert.equal(claim.raw.title, SECRET);
  assert.equal(claim.raw.summary, SECRET);
  assert.equal(claim.raw.sourceUrl, PROOF_URL);
  assert.match(JSON.stringify(claim.raw.evidence), /raw_body/);
  // Le libellé structuré reste dérivé du type d'assertion, jamais du titre.
  assert.ok(!res.json<{ statements: Array<{ value: string }> }>().statements.some((s) => s.value === SECRET));
});

test("the organization can also be found by name", async () => {
  const name = encodeURIComponent(`Association Riveraine ${TAG}`);
  const res = await app.inject({ method: "GET", url: `/api/affected?q=${name}` });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json<{ organization: { id: number } }>().organization.id, naId);
});

test("an organization outside Nouvelle-Aquitaine is refused", async () => {
  const res = await app.inject({ method: "GET", url: `/api/affected?q=${outId}` });
  assert.equal(res.statusCode, 403);
  assert.ok(res.body.includes("Nouvelle-Aquitaine"));
});

test("an unknown organization returns 404", async () => {
  const res = await app.inject({ method: "GET", url: `/api/affected?q=inconnu-${TAG}` });
  assert.equal(res.statusCode, 404);
});

test("an empty query returns 400", async () => {
  const res = await app.inject({ method: "GET", url: "/api/affected?q=" });
  assert.equal(res.statusCode, 400);
});
