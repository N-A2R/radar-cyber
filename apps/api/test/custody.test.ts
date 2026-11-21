/**
 * Chain of custody — one test per behaviour.
 *
 * The pure rule, the backfill CLI, the official-statement writer and the
 * read-only HTTP endpoint are all exercised against the disposable test
 * database from test/run.ts. No victim data is ever written to the journal.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { evaluateCustody, type CustodyEvent, type CustodyFact } from "../src/custody/chain.js";
import { closePools, query } from "../src/db.js";
import { ensureSources, storeStatements } from "../src/communiques/store.js";
import { OFFICIAL_SOURCES } from "../src/communiques/model.js";
import custodyRoute from "../src/routes/custody.js";

const TAG = `cust${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SOURCE = `${TAG}-source`;
const BACKFILL_SUBJECT = `${TAG}:backfill`;
const HTTP_SUBJECT = `${TAG}:http`;
const SECRET = `Victim ${TAG} 0601020304`;
const PROOF_URL = `https://example.invalid/${TAG}/proof`;
const OBSERVED = "2026-11-20T10:00:00.000Z";
const SCRIPT = fileURLToPath(new URL("../../../scripts/backfill-custody.mts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

let app: FastifyInstance;

function event(subject: string, regional = true): CustodyEvent {
  return {
    dedupKey: subject,
    family: "official_statement",
    title: null,
    sourceId: SOURCE,
    sourceUrl: PROOF_URL,
    observedAt: OBSERVED,
    collectedAt: OBSERVED,
    regional,
  };
}

function fact(overrides: Partial<CustodyFact> = {}): CustodyFact {
  return {
    kind: "event.admitted",
    actor: "collecteur:na-official-statements",
    summary: "source: official statement admitted",
    payload: { sourceId: SOURCE, sourceUrl: PROOF_URL },
    validAt: OBSERVED,
    recordedAt: "2026-11-20T10:01:00.000Z",
    ...overrides,
  };
}

function runBackfill(subject: string, ...flags: string[]): { candidates: number; written: number } {
  const output = execFileSync(TSX, [SCRIPT, `--subject=${subject}`, ...flags], { encoding: "utf8" });
  return JSON.parse(output) as { candidates: number; written: number };
}

before(async () => {
  await query(
    "INSERT INTO source (id, name, family, url) VALUES ($1,$2,'official_statement',$3)",
    [SOURCE, `Source ${TAG}`, PROOF_URL],
  );
  for (const subject of [BACKFILL_SUBJECT, HTTP_SUBJECT]) {
    await query(
      `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at,
                          collected_at, source_id, source_url, regional, regional_motif)
       VALUES ($1,'official_statement','ambient_signal',$2,$3,$4,$5,$6,true,'nouvelle-aquitaine')`,
      [subject, SECRET, OBSERVED, OBSERVED, SOURCE, PROOF_URL],
    );
  }
  await query(
    `INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
     VALUES ('event.admitted',$1,$2,$3::jsonb,$4,$5)`,
    [
      HTTP_SUBJECT,
      "source: official statement admitted",
      JSON.stringify({ sourceId: SOURCE, sourceUrl: PROOF_URL }),
      "collecteur:na-official-statements",
      OBSERVED,
    ],
  );
  app = Fastify({ logger: false });
  await app.register(custodyRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM event WHERE source_id = $1", [SOURCE]);
  await query("DELETE FROM source WHERE id = $1", [SOURCE]);
  await closePools();
});

test("a source, an observation and a journal actor make a complete chain", () => {
  const chain = evaluateCustody(event(BACKFILL_SUBJECT), [fact()]);
  assert.equal(chain.complete, true);
  assert.deepEqual(chain.missing, []);
  assert.equal(chain.links[0]?.who, "collecteur:na-official-statements");
});

test("an event outside Nouvelle-Aquitaine is never a complete chain", () => {
  const chain = evaluateCustody(event(BACKFILL_SUBJECT, false), [fact()]);
  assert.equal(chain.complete, false);
  assert.ok(chain.missing.includes("outside-nouvelle-aquitaine"));
});

test("an admission without actor, clock or proof reports each gap", () => {
  const chain = evaluateCustody(event(BACKFILL_SUBJECT), [fact({ actor: "", recordedAt: null, payload: {} })]);
  assert.deepEqual(chain.missing, ["actor-missing", "recorded-at-missing", "proof-missing"]);
});

test("the backfill writes one admission fact and never repeats it", async () => {
  const dryRun = runBackfill(BACKFILL_SUBJECT);
  assert.equal(dryRun.candidates, 1);
  assert.equal(dryRun.written, 0, "dry run writes nothing");

  const applied = runBackfill(BACKFILL_SUBJECT, "--apply");
  assert.equal(applied.written, 1);
  const replay = runBackfill(BACKFILL_SUBJECT, "--apply");
  assert.equal(replay.candidates, 0, "replay finds nothing to repair");

  const { rows } = await query<{ actor: string; payload: Record<string, unknown> }>(
    "SELECT actor, payload FROM journal WHERE subject = $1 AND kind = 'event.admitted'",
    [BACKFILL_SUBJECT],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.actor, "backfill:custody@1");
  assert.equal(rows[0]?.payload.sourceId, SOURCE);
  assert.equal(JSON.stringify(rows[0]?.payload).includes(SECRET), false, "no victim data in the journal");
});

test("official statements write their admission fact at insert time", async () => {
  await ensureSources();
  const official = OFFICIAL_SOURCES.find((source) => source.id === "official-na-cd47-actualites")!;
  const url = `https://www.lotetgaronne.fr/actualites/${TAG}-custody`;
  const result = await storeStatements([{
    sourceId: official.id,
    department: official.department,
    departmentLabel: official.departmentLabel,
    officialDomain: official.officialDomain,
    title: SECRET,
    url,
    publishedAt: new Date(OBSERVED),
  }]);
  assert.equal(result.inserted, 1);
  const { rows } = await query<{ actor: string; payload: Record<string, unknown> }>(
    "SELECT actor, payload FROM journal WHERE payload->>'sourceUrl' = $1 AND actor = $2",
    [url, "collecteur:na-official-statements"],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.payload.sourceId, official.id);
  assert.equal(JSON.stringify(rows[0]?.payload).includes(SECRET), false);
});

test("the custody endpoint exposes who, what and when without the event title", async () => {
  const res = await app.inject({ method: "GET", url: `/api/custody?subject=${encodeURIComponent(HTTP_SUBJECT)}` });
  assert.equal(res.statusCode, 200);
  const body = res.json<{ complete: boolean; source: string; observedAt: string; links: unknown[] }>();
  assert.equal(body.complete, true);
  assert.equal(body.source, SOURCE);
  assert.equal(body.observedAt, OBSERVED);
  assert.equal(body.links.length, 1);
  assert.equal(res.body.includes(SECRET), false, "no victim data in the API response");
});

test("an unknown subject returns 404 and a missing subject returns 400", async () => {
  const unknown = await app.inject({ method: "GET", url: "/api/custody?subject=does-not-exist" });
  assert.equal(unknown.statusCode, 404);
  const missing = await app.inject({ method: "GET", url: "/api/custody" });
  assert.equal(missing.statusCode, 400);
});
