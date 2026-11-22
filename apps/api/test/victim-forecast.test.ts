/**
 * One behavior per test for the deterministic next-victim forecast.
 * Fixtures are organisation-level only: no victim names or personal details.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  buildCandidates,
  evaluateWindow,
  rankCandidates,
  scoreCandidate,
  summariseBacktest,
  victimsInWindow,
  walkForwardCutoffs,
  type Candidate,
  type ClaimRecord,
  type EventRecord,
  type OrgMeta,
} from "../src/prediction/victim-forecast.js";

const CUTOFF = "2026-06-01";

function org(orgId: number, sector: string | null = "commerce", dept = "33"): OrgMeta {
  return { orgId, name: `Organisation ${orgId}`, sector, dept };
}

function claim(orgId: number, publishedAt: string, groupName = "group-a"): ClaimRecord {
  return { orgId, publishedAt, groupName };
}

function event(orgId: number, validAt: string, sourceId = "ransomlook"): EventRecord {
  return { orgId, validAt, sourceId };
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    ...org(1),
    priorClaims: 0,
    priorGroups: 0,
    daysSinceLastClaim: null,
    sectorClaims: 0,
    deptClaims: 0,
    recentEvents: 0,
    eventSources: 0,
    daysSinceLastEvent: null,
    ...overrides,
  };
}

test("walk-forward cutoffs cover six non-overlapping 30-day windows", () => {
  const cutoffs = walkForwardCutoffs("2026-11-22");
  assert.equal(cutoffs.length, 6);
  assert.equal(cutoffs[0], "2026-05-26");
  assert.equal(cutoffs[5], "2026-10-23");
  assert.equal(addDays(cutoffs[5]!, 30), "2026-11-22");
  for (let i = 1; i < cutoffs.length; i++) {
    assert.equal(addDays(cutoffs[i - 1]!, 30), cutoffs[i]);
  }
});

test("features use only facts strictly before the cutoff", () => {
  const candidates = buildCandidates(
    [org(1)],
    [claim(1, "2026-05-31"), claim(1, CUTOFF), claim(1, "2026-06-30")],
    [event(1, "2026-05-30"), event(1, CUTOFF)],
    CUTOFF,
  );
  assert.equal(candidates[0]!.priorClaims, 1);
  assert.equal(candidates[0]!.recentEvents, 1);
  assert.equal(candidates[0]!.daysSinceLastClaim, 1);
});

test("sector and department base rates count earlier victims only", () => {
  const candidates = buildCandidates(
    [org(1), org(2, "commerce", "17"), org(3, "sante", "33")],
    [claim(2, "2026-05-20", "g1"), claim(3, "2026-05-21", "g2"), claim(3, "2026-06-15", "g3")],
    [],
    CUTOFF,
  );
  const first = candidates.find((c) => c.orgId === 1)!;
  assert.equal(first.sectorClaims, 1);
  assert.equal(first.deptClaims, 1);
});

test("distinct claim groups are counted once per organisation", () => {
  const candidates = buildCandidates(
    [org(1)],
    [claim(1, "2026-05-01", "Qilin"), claim(1, "2026-05-20", "qilin"), claim(1, "2026-05-25", "LockBit")],
    [],
    CUTOFF,
  );
  assert.equal(candidates[0]!.priorGroups, 2);
});

test("score caps a single repeated signal", () => {
  const noisy = scoreCandidate(candidate({ priorClaims: 50, recentEvents: 50 }));
  const capped = scoreCandidate(candidate({ priorClaims: 3, recentEvents: 5 }));
  assert.ok(noisy <= capped + 20, "unbounded counts must not dominate the ranking");
});

test("score rewards a recent claim over an old one", () => {
  const recent = scoreCandidate(candidate({ priorClaims: 1, daysSinceLastClaim: 2 }));
  const old = scoreCandidate(candidate({ priorClaims: 1, daysSinceLastClaim: 400 }));
  assert.ok(recent > old);
});

test("ranking returns exactly ten entries in deterministic order", () => {
  const entries = rankCandidates(
    Array.from({ length: 12 }, (_, i) => candidate({ ...org(i + 1), priorClaims: i === 0 ? 2 : 0 })),
  );
  assert.equal(entries.length, 10);
  assert.equal(entries[0]!.orgId, 1);
  assert.deepEqual(
    entries.slice(1).map((e) => e.orgId),
    [2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
});

test("ranking rejects organisations outside Nouvelle-Aquitaine", () => {
  const entries = rankCandidates([candidate({ ...org(1, "commerce", "75"), priorClaims: 9 })], 10);
  assert.equal(entries.length, 0);
});

test("window victims are deduplicated and boundaries are respected", () => {
  const actual = victimsInWindow(
    [claim(1, CUTOFF), claim(1, "2026-06-20"), claim(2, "2026-06-30"), claim(3, "2026-07-01")],
    CUTOFF,
  );
  assert.deepEqual(actual, [1, 2]);
});

test("a window without victims reports null recall, not zero", () => {
  const result = evaluateWindow(CUTOFF, [1, 2], []);
  assert.equal(result.precision, 0);
  assert.equal(result.recall, null);
  assert.equal(result.horizonEnd, "2026-07-01");
});

test("backtest micro-averages hits across windows", () => {
  const result = summariseBacktest([
    evaluateWindow("2026-05-01", [1, 2, 3], [1, 9]),
    evaluateWindow("2026-06-01", [4, 5, 6], [4, 5]),
  ]);
  assert.equal(result.predictions, 6);
  assert.equal(result.victims, 4);
  assert.equal(result.hits, 3);
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 0.75);
  assert.ok(result.recallInterval![0] > 0);
});
