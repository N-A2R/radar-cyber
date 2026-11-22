/**
 * Encrypted cold archive — one test per behaviour.
 *
 * Fixtures live in the disposable database from test/run.ts. The procedure is
 * run once in `before`, then each test inspects one observable guarantee:
 * scope, redaction, deterministic seal, passphrase, tamper, round trip and the
 * reproducible measurement command.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt } from "../src/coldarchive/cipher.js";
import {
  ARCHIVE_FILE,
  buildPayload,
  digest,
  readPayload,
  runColdArchiveProcedure,
  stableStringify,
  type ProcedureResult,
} from "../src/coldarchive/procedure.js";
import { containsPersonalData, redactText } from "../src/coldarchive/redact.js";
import { fetchArchiveEvents } from "../src/coldarchive/scope.js";
import { closePools, query } from "../src/db.js";

const TAG = `cold${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SOURCE = `${TAG}-grey-forum`;
const OBSERVED = "2026-11-20T10:00:00.000Z";
const SECRET = "Victim victim@example.fr 06 12 34 56 78 NIR 1 85 04 75 116 001 42";
const PASSPHRASE = "test-passphrase-only";
const SCRIPT = fileURLToPath(new URL("../../../scripts/measure-cold-archive.mts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

let directory: string;
let measureDirectory: string;
let result: ProcedureResult;
const ids: Record<string, number> = {};
const orgIds: number[] = [];

async function insertOrg(name: string, dept: string): Promise<number> {
  const { rows } = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'collectivite',$3) RETURNING id",
    [`${name} ${TAG}`, `${TAG}-${dept}-${orgIds.length}`, dept],
  );
  const id = rows[0]?.id;
  assert.ok(id !== undefined);
  orgIds.push(id);
  return id;
}

async function insertEvent(
  key: string,
  orgId: number,
  options: { regional?: boolean; tlp?: string; family?: string; title?: string } = {},
): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at,
                        collected_at, source_id, source_url, org_id, regional, tlp, evidence)
     VALUES ($1,$2,'ambient_signal',$3,$4,$5,$5,$6,$7,$8,$9,COALESCE($10, 'CLEAR'),'{"run_id":"1"}'::jsonb) RETURNING id`,
    [
      `${TAG}:${key}`,
      options.family ?? "cti",
      options.title ?? `Fact ${key} in Nouvelle-Aquitaine`,
      null,
      OBSERVED,
      SOURCE,
      `https://example.invalid/${TAG}/${key}`,
      orgId,
      options.regional ?? false,
      options.tlp ?? null,
    ],
  );
  const id = rows[0]?.id;
  assert.ok(id !== undefined);
  return id;
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "radar-cold-test-"));
  measureDirectory = await mkdtemp(join(tmpdir(), "radar-cold-measure-"));
  const naOrg = await insertOrg("Bordeaux", "33");
  const outsideOrg = await insertOrg("Paris", "75");

  await query(
    "INSERT INTO source (id, name, family, url, kind) VALUES ($1,$2,'cti',$3,'narrative')",
    [SOURCE, `Grey forum ${TAG}`, `https://example.invalid/${TAG}`],
  );

  ids.naByDept = await insertEvent("na-dept", naOrg);
  ids.naByFlag = await insertEvent("na-flag", outsideOrg, { regional: true, title: SECRET });
  ids.red = await insertEvent("red", naOrg, { tlp: "RED" });
  ids.amber = await insertEvent("amber", naOrg, { tlp: "AMBER" });
  ids.leaks = await insertEvent("leaks", naOrg, { family: "leaks" });
  ids.outside = await insertEvent("outside", outsideOrg);

  result = await runColdArchiveProcedure({ directory, passphrase: PASSPHRASE });
});

after(async () => {
  await query("DELETE FROM event WHERE source_id = $1", [SOURCE]);
  await query("DELETE FROM source WHERE id = $1", [SOURCE]);
  for (const id of orgIds) await query("DELETE FROM org WHERE id = $1", [id]);
  await closePools();
  for (const dir of [directory, measureDirectory]) {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

test("scope keeps NA facts from grey sources and drops out-of-scope facts", async () => {
  const rows = await fetchArchiveEvents();
  const present = rows.map((row) => row.id);
  assert.ok(present.includes(ids.naByDept));
  assert.ok(present.includes(ids.naByFlag));
  for (const key of ["red", "amber", "leaks", "outside"] as const) {
    assert.equal(present.includes(ids[key]), false, `${key} must stay out of the archive`);
  }
  const grey = rows.find((row) => row.id === ids.naByDept);
  assert.equal(grey?.sourceKind, "narrative");
  assert.equal(grey?.dept, "33");
});

test("personal data is stripped before anything reaches cold storage", async () => {
  const redacted = redactText(SECRET);
  assert.equal(redacted.redacted, true);
  assert.equal(containsPersonalData(redacted.text), false);
  assert.match(redacted.text, /\[email-redacted\]/);
  assert.match(redacted.text, /\[phone-redacted\]/);
  assert.match(redacted.text, /\[id-redacted\]/);

  const bytes = await readFile(join(directory, ARCHIVE_FILE));
  assert.equal(bytes.includes(Buffer.from("victim@example.fr")), false);
  const payload = readPayload(decrypt(bytes, PASSPHRASE));
  assert.equal(payload.records.some((record) => containsPersonalData(record.title)), false);
  assert.ok(payload.records.some((record) => record.title.includes("[email-redacted]")));
});

test("sealing is deterministic and its digest detects any change", async () => {
  const rows = await fetchArchiveEvents();
  const first = buildPayload(rows);
  const reversed = buildPayload([...rows].reverse());
  assert.equal(first.sha256, reversed.sha256);
  assert.equal(first.sha256, digest(first.records));

  const changed = buildPayload(rows.map((row) => ({ ...row, title: `${row.title}!` })));
  assert.notEqual(changed.sha256, first.sha256);
  assert.throws(
    () => readPayload(Buffer.from(stableStringify({ ...first, sha256: changed.sha256 }))),
    /digest mismatch/,
  );
});

test("a wrong passphrase cannot open the cold envelope", async () => {
  const bytes = await readFile(join(directory, ARCHIVE_FILE));
  assert.throws(() => decrypt(bytes, "not-the-passphrase"), /authentication failed/);
  assert.ok(decrypt(bytes, PASSPHRASE).length > 0);
});

test("a single flipped byte in the cold file is rejected", async () => {
  const bytes = Buffer.from(await readFile(join(directory, ARCHIVE_FILE)));
  bytes[bytes.length - 1] ^= 0x01;
  assert.throws(() => decrypt(bytes, PASSPHRASE), /authentication failed/);
});

test("the procedure restores every selected event from the encrypted file", async () => {
  assert.deepEqual(
    result.stages.map((stage) => stage.ok),
    [true, true, true, true, true, true],
  );
  assert.equal(result.selected, 2);
  assert.equal(result.restored, result.selected);
  assert.equal(result.sources, 1);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(await readdir(directory), [ARCHIVE_FILE]);
  const bytes = await readFile(join(directory, ARCHIVE_FILE));
  assert.equal(bytes.includes(Buffer.from("radar-cold-archive-payload")), false);
});

test("the measurement command prints the reproducible end-to-end figure", () => {
  const output = execFileSync(TSX, [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      RADAR_COLD_ARCHIVE_DIR: measureDirectory,
      RADAR_COLD_ARCHIVE_PASSPHRASE: PASSPHRASE,
    },
  });
  assert.match(
    output,
    /Cold archive: 6\/6 stages passed; 2\/2 NA events sealed, encrypted and restored \(100%\)/,
  );
});
