import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import sourcePrimaireRoute from "../src/routes/source-primaire.js";
import { REFUS_SOURCE_MANCANTE } from "../src/analyse/publication-decisions.js";

const TAG = `src${Date.now().toString(36)}`;
const PUBLIC_SOURCE = `${TAG}-public`;
const ONION_SOURCE = `${TAG}-onion`;
const PUBLIC_URL = `https://${TAG}.example.invalid/feed?token=secret`;
const SANITISED_URL = `https://${TAG}.example.invalid/feed`;
const ONION_URL = `onion:${TAG}.onion`;
const OLD_CLAIM = "2026-11-01T12:00:00.000Z";

let app: FastifyInstance;
let eventIds: number[] = [];
let orgIds: number[] = [];

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url, enabled) VALUES
       ($1,$2,'cti',$3,true), ($4,$5,'cti',$6,true)`,
    [PUBLIC_SOURCE, `Publique ${TAG}`, PUBLIC_URL, ONION_SOURCE, `Onion ${TAG}`, ONION_URL],
  );
  const orgs = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city, dept) VALUES
       ($1,$2,'entreprise','Bordeaux','33'), ($3,$4,'entreprise','Bordeaux','33') RETURNING id`,
    [`Organisation ${TAG} publique`, `org-${TAG}-public`, `Organisation ${TAG} onion`, `org-${TAG}-onion`],
  );
  orgIds = orgs.rows.map((row) => Number(row.id));
  const inserted = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, severity,
                        confidence, source_id, source_url, org_id, regional, evidence)
     VALUES ($1,'ransomware','third_party_claim',$2,$3,3,'A1',$4,$5,$6,false,$7::jsonb),
            ($8,'ransomware','third_party_claim',$9,$3,3,'B2',$10,$11,$12,false,$13::jsonb)
     RETURNING id`,
    [
      `${TAG}:public`, `Titre confidentiel ${TAG} public`, OLD_CLAIM, PUBLIC_SOURCE, PUBLIC_URL, orgIds[0],
      JSON.stringify({ group: "testgroup", org_hint: `${TAG}public.fr`, claimed_at: OLD_CLAIM, run_id: "1" }),
      `${TAG}:onion`, `Titre confidentiel ${TAG} onion`, ONION_SOURCE, ONION_URL, orgIds[1],
      JSON.stringify({ group: "testgroup", org_hint: `${TAG}onion.fr`, claimed_at: OLD_CLAIM, run_id: "1" }),
    ],
  );
  eventIds = inserted.rows.map((row) => Number(row.id));

  app = Fastify({ logger: false });
  await app.register(sourcePrimaireRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (eventIds.length > 0) await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [eventIds]);
  await query("DELETE FROM source WHERE id = ANY($1::text[])", [[PUBLIC_SOURCE, ONION_SOURCE]]);
  await closePools();
});

async function get() {
  return app.inject({ method: "GET", url: "/api/source-primaire" });
}

test("la route publie l'URL publique nettoyée et le nommage autorisé", async () => {
  const body = (await get()).json();
  const sourcee = body.decisions.find((item: { sourcePrimaire: string | null }) => item.sourcePrimaire === SANITISED_URL);
  assert.equal(sourcee?.nommer, true);
  assert.equal(sourcee?.motifRefus, null);
  assert.equal(body.verification.ok, true);
});

test("un incident dont la seule source est onion est anonymisé", async () => {
  const body = (await get()).json();
  const refuse = body.decisions.find((item: { verdict: string; motifRefus: string | null }) =>
    item.verdict === "after_delay" && item.motifRefus === REFUS_SOURCE_MANCANTE);
  assert.ok(refuse);
  assert.equal(refuse.nommer, false);
  assert.equal(refuse.sourcePrimaire, null);
  assert.equal(body.summary.nommesSansSource, 0);
});

test("la réponse ne contient ni titre, ni nom d'organisation, ni jeton d'URL", async () => {
  const res = await get();
  assert.equal(res.statusCode, 200);
  const raw = res.body;
  assert.equal(raw.includes(`Titre confidentiel ${TAG}`), false);
  assert.equal(raw.includes(`Organisation ${TAG}`), false);
  assert.equal(raw.includes("token=secret"), false);
});
