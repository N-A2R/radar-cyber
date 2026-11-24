import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import { corroborateNAIncidents, loadCorroborationEvents } from "../src/analyse/incident-corroboration.js";
import { publicationVerdicts } from "../src/analyse/incident-corroboration-48h.js";
import { buildPublicationJournal, verifyPublicationJournal } from "../src/analyse/publication-decisions.js";
import { enregistrerDecisionsPublication } from "../src/journal/publication.js";
import publicationDecisionsRoute from "../src/routes/publication-decisions.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `publi${Date.now().toString(36)}`;
const SOURCES = [`${TAG}-a`, `${TAG}-b`];
const OLD_CLAIM = "2026-11-01T12:00:00.000Z";

function hash(victim: string): string {
  return createHash("sha256").update(`${victim} fr|testgroup`).digest("hex").slice(0, 12);
}

let app: FastifyInstance;
let eventIds: number[] = [];
let orgId: number;

before(async () => {
  for (const sourceId of SOURCES) {
    await query(
      "INSERT INTO source (id, name, family, url, enabled) VALUES ($1,$2,'cti',$3,true)",
      [sourceId, `Source ${sourceId}`, `https://${sourceId}.example.invalid/feed`],
    );
  }
  const org = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, city, dept) VALUES ($1,$2,'entreprise','Bordeaux','33') RETURNING id",
    [`Organisation ${TAG}`, `org-${TAG}`],
  );
  orgId = Number(org.rows[0].id);

  const claimAt = new Date().toISOString();
  const inserted = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, severity,
                        confidence, source_id, source_url, org_id, regional, evidence)
     VALUES ($1,'ransomware','third_party_claim',$2,$3,3,'A1',$4,$5,$6,false,$7::jsonb),
            ($8,'ransomware','third_party_claim',$2,$3,3,'B2',$9,$10,$6,false,$7::jsonb),
            ($11,'ransomware','third_party_claim',$12,$13,3,'A1',$4,$5,$6,false,$14::jsonb),
            ($15,'ransomware','third_party_claim',$16,$17,3,'A1',$4,$5,$6,false,$18::jsonb)
     RETURNING id`,
    [
      `${TAG}:1`, `Incident confidentiel ${TAG}`, claimAt, SOURCES[0], `https://${SOURCES[0]}.example.invalid/v`, orgId,
      JSON.stringify({ group: "testgroup", org_hint: `${TAG}.fr`, claimed_at: claimAt, run_id: "1" }),
      `${TAG}:2`, SOURCES[1], `https://${SOURCES[1]}.example.invalid/v`,
      `${TAG}:3`, `Incident ancien ${TAG}`, OLD_CLAIM,
      JSON.stringify({ group: "testgroup", org_hint: `${TAG}old.fr`, claimed_at: OLD_CLAIM, run_id: "1" }),
      `${TAG}:4`, `Incident recent ${TAG}`, claimAt,
      JSON.stringify({ group: "testgroup", org_hint: `${TAG}recent.fr`, claimed_at: claimAt, run_id: "1" }),
    ],
  );
  eventIds = inserted.rows.map((row) => Number(row.id));

  app = Fastify({ logger: false });
  await app.register(publicationDecisionsRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (eventIds.length > 0) {
    await supprimerEvenementsArchivees("id = ANY($1::bigint[])", [eventIds]);
  }
  await query("DELETE FROM org WHERE id = $1", [orgId]);
  await query("DELETE FROM source WHERE id = ANY($1::text[])", [SOURCES]);
  await closePools();
});

test("the route returns one privacy-safe decision per incident", async () => {
  const res = await app.inject({ method: "GET", url: "/api/publication-decisions" });
  assert.equal(res.statusCode, 200);
  const body = res.json();

  const byHash = new Map<string, { verdict: string; nommer: boolean; motifRefus: string | null }>(
    body.decisions.map((item: { victimHash: string; verdict: string; nommer: boolean; motifRefus: string | null }) =>
      [item.victimHash, item]),
  );
  assert.equal(byHash.get(hash(TAG))?.verdict, "second_source");
  assert.equal(byHash.get(hash(TAG))?.nommer, true);
  assert.equal(byHash.get(hash(`${TAG}old`))?.verdict, "after_delay");
  assert.equal(byHash.get(hash(`${TAG}recent`))?.verdict, "pending");
  assert.equal(byHash.get(hash(`${TAG}recent`))?.motifRefus, "publication-risquee");
  assert.equal(body.verification.ok, true);
  assert.equal(body.chainHead, body.decisions.at(-1).hash);

  const raw = JSON.stringify(body);
  assert.equal(raw.includes(`Incident confidentiel ${TAG}`), false);
  assert.equal(raw.includes(`Organisation ${TAG}`), false);
  assert.equal(raw.includes(`Incident recent ${TAG}`), false);
});

test("the decisions are written once to the append-only journal", async () => {
  const generatedAt = new Date().toISOString();
  const report = corroborateNAIncidents(await loadCorroborationEvents());
  const journal = buildPublicationJournal(publicationVerdicts(report, generatedAt), generatedAt);
  assert.equal(verifyPublicationJournal(journal).ok, true);

  const first = await enregistrerDecisionsPublication(journal);
  const second = await enregistrerDecisionsPublication(journal);
  assert.ok(first.incidents >= 2);
  assert.equal(first.ecrits, first.incidents);
  assert.equal(first.lacunes, 0);
  assert.deepEqual(first.erreurs, []);
  assert.equal(second.ecrits, 0);
  assert.equal(second.dejaJournalises, first.incidents);

  const rows = await query<{ actor: string; summary: string; payload: { motifRefus: string | null; chainHead: string } }>(
    `SELECT actor, summary, payload FROM journal
      WHERE kind = 'publication.decided' AND payload->>'generatedAt' = $1`,
    [generatedAt],
  );
  assert.equal(rows.rows.length, first.incidents);
  assert.equal(rows.rows.every((row) => row.actor === "moteur:publication-regles@1"), true);
  assert.equal(rows.rows.every((row) => row.payload.chainHead === journal.chainHead), true);
  assert.equal(rows.rows.some((row) => row.payload.motifRefus === "publication-risquee"), true);
  assert.equal(rows.rows.some((row) => row.summary.includes("publication refusée")), true);
});
