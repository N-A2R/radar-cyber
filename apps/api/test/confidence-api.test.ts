/**
 * `/api/confidence/*` : la note lue dans la base doit être celle calculée,
 * avec sa décomposition — pas une valeur inventée par la route.
 *
 * Isolation : deux sources, une organisation et deux événements jetables,
 * insérés puis supprimés dans la base de test créée par test/run.ts.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import {
  computeConfidence,
  loadEvents,
  persistConfidence,
} from "../src/analyse/confidence-service.js";
import type { ValidatedCorpus } from "../src/analyse/validated-corpus.js";
import confidenceRoute from "../src/routes/confidence.js";

import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";
const TAG = `conf${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SOURCES = [`${TAG}-a`, `${TAG}-b`];
const TITLE = `Incident corroboré ${TAG}`;
const CORPUS: ValidatedCorpus = {
  incidents: 0,
  urls: new Set(),
  publishers: new Set(),
  entities: [],
};

let app: FastifyInstance;
let eventIds: number[];
let orgId: number;

before(async () => {
  for (const id of SOURCES) {
    await query(
      "INSERT INTO source (id, name, family, url, enabled) VALUES ($1,$2,'cti',$3,true)",
      [id, `Source ${id}`, `https://exemple.invalid/${id}`],
    );
  }
  const org = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, city) VALUES ($1,$2,'entreprise','Bordeaux') RETURNING id",
    [`Organisation ${TAG}`, `org-${TAG}`],
  );
  orgId = Number(org.rows[0].id);
  const inserted = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at,
                        severity, confidence, source_id, source_url, org_id, evidence)
     VALUES ($1,'cti','confirmed_incident',$2, now() - interval '2 hours',3,'A1',$4,COALESCE($6, 'https://example.invalid/event'),$7,'{"run_id":"1"}'::jsonb),
            ($3,'cti','confirmed_incident',$2, now() - interval '1 hour',3,'B2',$5,COALESCE($6, 'https://example.invalid/event'),$7,'{"run_id":"1"}'::jsonb)
     RETURNING id`,
    [
      `${TAG}:1`, TITLE, `${TAG}:2`, SOURCES[0], SOURCES[1],
      `https://exemple.invalid/${TAG}/preuve`, orgId,
    ],
  );
  eventIds = inserted.rows.map((row) => Number(row.id));

  const events = await loadEvents(eventIds);
  const batch = computeConfidence(events, new Date(), CORPUS);
  await persistConfidence(batch);

  app = Fastify({ logger: false });
  await app.register(confidenceRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await supprimerEvenementsArchivees("id = ANY($1::bigint[])", [eventIds]);
  await query("DELETE FROM org WHERE id = $1", [orgId]);
  await query("DELETE FROM source WHERE id = ANY($1::text[])", [SOURCES]);
  await closePools();
});

test("la distribution compte un fait corroboré par deux sources", async () => {
  const res = await app.inject({ method: "GET", url: "/api/confidence/distribution" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.facts.total, 1);
  assert.equal(body.facts.corroborated, 1);
  assert.equal(body.facts.singleSource, 0);
  assert.equal(body.facts.established, 0);
  assert.equal(body.scores.reduce((sum: number, row: { events: number }) => sum + row.events, 0), 2);
  assert.deepEqual(body.weights, {
    independentSources: 0.35, sourceQuality: 0.25,
    temporalCoherence: 0.2, validatedCorpus: 0.2,
  });
});

test("le détail d'un événement donne la décomposition et les mesures brutes", async () => {
  const res = await app.inject({ method: "GET", url: `/api/confidence/events/${eventIds[0]}` });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.eventId, eventIds[0]);
  assert.equal(body.sourcesDistinct, 2);
  assert.equal(body.breakdown.length, 4);
  assert.equal(body.breakdown.reduce((sum: number, line: { points: number }) => sum + line.points, 0), body.score);
  assert.deepEqual(Object.keys(body.components).sort(), [
    "independentSources", "sourceQuality", "temporalCoherence", "validatedCorpus",
  ].sort());
  assert.equal(body.measures.independentSources, 2);
  assert.equal(body.measures.primarySources, 1);
  for (const line of body.breakdown) assert.ok(line.reason.length > 0);
});

test("le rattachement porte le même fait et sa propre décomposition", async () => {
  const res = await app.inject({
    method: "GET", url: `/api/confidence/attachments/${eventIds[1]}/${orgId}`,
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.orgId, orgId);
  assert.equal(body.eventId, eventIds[1]);
  assert.equal(body.sourcesDistinct, 2);
  assert.equal(body.breakdown.length, 4);
  assert.equal(body.factKey.length > 0, true);
});

test("un événement sans score en base répond 404", async () => {
  const res = await app.inject({ method: "GET", url: "/api/confidence/events/999999999" });
  assert.equal(res.statusCode, 404);
});

test("un identifiant invalide répond 400", async () => {
  const res = await app.inject({ method: "GET", url: "/api/confidence/events/pas-un-chiffre" });
  assert.equal(res.statusCode, 400);
});
