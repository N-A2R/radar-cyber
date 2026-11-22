/**
 * Provenance gate — one test per behaviour.
 *
 * The gate is pure: it re-evaluates a committed ledger with the custody rule.
 * The CLI tests prove the gate is blocking, and the measurement test proves
 * the ledger never carries a victim's title or other personal data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  evaluateProvenanceGate,
  PROVENANCE_SCOPE,
  REAL_STATE,
  type ProvenanceArtifact,
  type ProvenanceEntry,
} from "../src/custody/gate.js";
import { query } from "../src/db.js";

const SCRIPT = fileURLToPath(new URL("../../../scripts/provenance.mts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const OBSERVED = "2026-11-22T10:00:00.000Z";
const RECORDED = "2026-11-22T10:01:00.000Z";
const SOURCE = "source-provenance";
const PROOF_URL = "https://example.invalid/provenance";

function completeEntry(subject = "feed:provenance-ok"): ProvenanceEntry {
  return {
    event: {
      dedupKey: subject,
      family: "official_statement",
      title: null,
      sourceId: SOURCE,
      sourceUrl: PROOF_URL,
      observedAt: OBSERVED,
      collectedAt: OBSERVED,
      regional: true,
    },
    facts: [{
      kind: "event.admitted",
      actor: "collecteur:na-official-statements",
      summary: "",
      payload: { sourceId: SOURCE, sourceUrl: PROOF_URL },
      validAt: OBSERVED,
      recordedAt: RECORDED,
    }],
  };
}

function artifact(entries: ProvenanceEntry[]): ProvenanceArtifact {
  return {
    definition: "test ledger",
    scope: PROVENANCE_SCOPE,
    generatedAt: OBSERVED,
    organisations: REAL_STATE.organisations,
    sources: REAL_STATE.sources,
    events: REAL_STATE.events,
    regionalEvents: entries.length,
    complete: entries.length,
    withoutProvenance: 0,
    rate: 100,
    gaps: {},
    entries,
  };
}

function brokenEntry(subject: string, overrides: Partial<ProvenanceEntry["event"]> = {}): ProvenanceEntry {
  return { ...completeEntry(subject), event: { ...completeEntry(subject).event, ...overrides }, facts: [] };
}

function brokenArtifact(entry: ProvenanceEntry, gap: string): ProvenanceArtifact {
  return { ...artifact([entry]), complete: 0, withoutProvenance: 1, rate: 0, gaps: { [gap]: 1 } };
}

test("a complete ledger passes with zero facts without provenance", () => {
  const verdict = evaluateProvenanceGate(artifact([completeEntry()]));
  assert.equal(verdict.ok, true);
  assert.equal(verdict.checked, 1);
  assert.deepEqual(verdict.withoutProvenance, []);
  assert.deepEqual(verdict.reasons, []);
});

test("a fact without an admission entry blocks the gate and names the fact", () => {
  const verdict = evaluateProvenanceGate(brokenArtifact(brokenEntry("feed:no-admission"), "admission-fact-missing"));
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.withoutProvenance, ["feed:no-admission"]);
  assert.ok(verdict.reasons.includes("fact:admission-fact-missing"));
});

test("a fact outside Nouvelle-Aquitaine blocks the gate", () => {
  const entry = { ...completeEntry("feed:outside"), event: { ...completeEntry("feed:outside").event, regional: false } };
  const verdict = evaluateProvenanceGate(brokenArtifact(entry, "outside-nouvelle-aquitaine"));
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes("fact:outside-nouvelle-aquitaine"));
});

test("an empty ledger cannot pass the gate vacuously", () => {
  const verdict = evaluateProvenanceGate(artifact([]));
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes("empty-scope"));
});

test("a truncated ledger blocks the gate", () => {
  const verdict = evaluateProvenanceGate({ ...artifact([]), regionalEvents: 1 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes("ledger-truncated"));
});

test("a stale real-state context blocks the gate", () => {
  const verdict = evaluateProvenanceGate({ ...artifact([completeEntry()]), sources: REAL_STATE.sources - 1 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes("context-mismatch"));
});

test("a wrong scope blocks the gate", () => {
  const verdict = evaluateProvenanceGate({ ...artifact([completeEntry()]), scope: "global" });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes("wrong-scope"));
});

test("a tampered summary cannot hide behind a complete ledger", () => {
  const verdict = evaluateProvenanceGate({ ...artifact([completeEntry()]), withoutProvenance: 1 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes("summary-mismatch"));
});

test("victim text in the ledger blocks the gate", () => {
  const entry = completeEntry();
  entry.event.title = "Victim name 0601020304";
  const verdict = evaluateProvenanceGate(artifact([entry]));
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes("unsanitized-ledger"));
});

test("the check command exits 1 on an incomplete ledger and 0 on a complete one", () => {
  const dir = mkdtempSync(join(tmpdir(), "provenance-gate-"));
  try {
    const passPath = join(dir, "pass.json");
    const failPath = join(dir, "fail.json");
    writeFileSync(passPath, JSON.stringify(artifact([completeEntry()])));
    writeFileSync(failPath, JSON.stringify(brokenArtifact(brokenEntry("feed:no-admission"), "admission-fact-missing")));

    const pass = spawnSync(TSX, [SCRIPT, "check", `--json=${passPath}`], { encoding: "utf8" });
    assert.equal(pass.status, 0, pass.stderr);
    assert.match(pass.stdout, /Provenance gate PASS: 0\/1 /);

    const fail = spawnSync(TSX, [SCRIPT, "check", `--json=${failPath}`], { encoding: "utf8" });
    assert.equal(fail.status, 1, "the gate must block the build");
    assert.match(fail.stderr, /Provenance gate FAIL: 1\/1 /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the measured ledger carries no victim title or journal summary", async () => {
  const tag = `prov${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const secret = `Victim ${tag} 0601020304`;
  const sourceId = `${tag}-source`;
  const subject = `${tag}:subject`;
  const dir = mkdtempSync(join(tmpdir(), "provenance-measure-"));
  try {
    await query("INSERT INTO source (id, name, family, url) VALUES ($1,$2,'official_statement',$3)",
      [sourceId, `Source ${tag}`, PROOF_URL]);
    await query(
      `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, collected_at,
                          source_id, source_url, regional, regional_motif)
       VALUES ($1,'official_statement','ambient_signal',$2,$3,$4,$5,$6,true,'nouvelle-aquitaine')`,
      [subject, secret, OBSERVED, OBSERVED, sourceId, PROOF_URL],
    );
    const outputPath = join(dir, "ledger.json");
    execFileSync(TSX, [SCRIPT, "measure", `--json=${outputPath}`], { encoding: "utf8" });
    const raw = readFileSync(outputPath, "utf8");
    assert.equal(raw.includes(secret), false, "no victim title in the ledger");
    const ledger = JSON.parse(raw) as ProvenanceArtifact;
    assert.ok(ledger.entries.some((entry) => entry.event.dedupKey === subject));
    assert.ok(ledger.entries.every((entry) => entry.event.title === null));
    assert.ok(ledger.entries.every((entry) => entry.facts.every((fact) => fact.summary === "")));
  } finally {
    await query("DELETE FROM event WHERE source_id = $1", [sourceId]);
    await query("DELETE FROM source WHERE id = $1", [sourceId]);
    rmSync(dir, { recursive: true, force: true });
  }
});
