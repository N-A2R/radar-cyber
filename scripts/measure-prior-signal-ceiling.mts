/**
 * Reproducible ceiling audit for group-agnostic prior signals in the victim
 * forecast backtest. Every signal is computed at the cutoff from claims
 * strictly before it; none reads the group of the future claim.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     npm run measure:signal-ceiling -- --as-of=2026-11-22 \
 *     --json=bench/results/prior-signal-ceiling-2026-11-22.json
 *
 * Read only. Organisation ids, scope codes and dates only: no victim name,
 * claim description or evidence URL is read.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { naDepartmentCode } from "../apps/api/src/geo/na-departments.js";
import { NA_DEPARTMENTS } from "../apps/api/src/geo/commune-index.js";
import {
  TOP_N, buildCandidates, evaluateWindow, scoreCandidate, summariseBacktest,
  victimsInWindow, walkForwardCutoffs,
  type Candidate, type ClaimRecord, type EventRecord, type OrgMeta,
} from "../apps/api/src/prediction/victim-forecast.js";
import {
  compositeWaveCounts, compositeWaveKey, normaliseWaveKey, waveCountsAtCutoff,
  type CompositeWaveScope, type WaveSubject,
} from "../apps/api/src/prediction/sector-wave.js";
import {
  attachBrandFamilyClaims,
  brandFamilyBonus,
  type BrandClaim,
  type BrandOrganization,
} from "../apps/api/src/prediction/brand-family-precursors.js";
import type { SignalRecord } from "../apps/api/src/prediction/precursor-coverage.js";

type OrgRow = { id: number; name: string; sector: string | null; dept: string; secteurGroupe: string | null };
type ClaimRow = {
  orgId: number;
  publishedAt: string;
  groupName: string;
  sector: string | null;
  dept: string;
  secteurGroupe: string | null;
};
type EventRow = { orgId: number; validAt: string; sourceId: string };
type BrandClaimRow = { id: number; orgId: number | null; victim: string; publishedAt: string };
type AliasRow = { orgId: number; alias: string };

type Signal = {
  name: string;
  weight: number;
  scope: "grp" | "dep" | CompositeWaveScope | null;
  onlyNew: boolean;
  brand?: boolean;
};

/** Fixed list: no signal is selected from the measured hits. */
const SIGNALS: readonly Signal[] = [
  { name: "baseline", weight: 0, scope: null, onlyNew: false },
  { name: "groupe_365", weight: 30, scope: "grp", onlyNew: false },
  { name: "departement_365", weight: 10, scope: "dep", onlyNew: false },
  { name: "grp_dept_365", weight: 10, scope: "grp_dept", onlyNew: false },
  { name: "grp_secteur_dept_365", weight: 10, scope: "grp_secteur_dept", onlyNew: false },
  { name: "nouveaux_grp_dept_365", weight: 10, scope: "grp_dept", onlyNew: true },
  { name: "famille_marque", weight: 0, scope: null, onlyNew: false, brand: true },
];

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

function orgKey(org: OrgRow, scope: Signal["scope"]): string | null {
  if (scope === "grp") return normaliseWaveKey(org.secteurGroupe);
  if (scope === "dep") return normaliseWaveKey(org.dept);
  if (scope === null) return null;
  return compositeWaveKey(
    { sectorGroup: org.secteurGroupe, sector: org.sector, dept: org.dept },
    scope,
  );
}

function bonusByOrg(
  signal: Signal,
  orgRows: readonly OrgRow[],
  subjects: readonly WaveSubject[],
  cutoff: string,
  lookbackDays: number,
  brandAtCutoff: readonly SignalRecord[],
): Map<number, number> {
  const bonus = new Map<number, number>();
  if (signal.brand) {
    for (const org of orgRows) bonus.set(org.id, brandFamilyBonus(org.id, brandAtCutoff));
    return bonus;
  }
  if (signal.scope === null) return bonus;
  const counts =
    signal.scope === "grp"
      ? waveCountsAtCutoff(subjects, cutoff, "secteur_groupe", lookbackDays)
      : signal.scope === "dep"
        ? waveCountsAtCutoff(subjects, cutoff, "departement", lookbackDays)
        : compositeWaveCounts(subjects, cutoff, signal.scope, lookbackDays);
  for (const org of orgRows) {
    const key = orgKey(org, signal.scope);
    bonus.set(org.id, key === null ? 0 : signal.weight * Math.min(counts.get(key) ?? 0, 3));
  }
  return bonus;
}

function rankWithBonus(
  candidates: readonly Candidate[],
  bonus: ReadonlyMap<number, number>,
  onlyNew: boolean,
): number[] {
  return candidates
    .filter((candidate) => naDepartmentCode(candidate.dept) !== null)
    .filter((candidate) => !onlyNew || (candidate.priorClaims === 0 && candidate.recentEvents === 0))
    .map((candidate) => ({
      orgId: candidate.orgId,
      score: scoreCandidate(candidate) + (bonus.get(candidate.orgId) ?? 0),
    }))
    .sort((a, b) => b.score - a.score || a.orgId - b.orgId)
    .slice(0, TOP_N)
    .map((entry) => entry.orgId);
}

async function main(): Promise<void> {
  const asOf = arg("as-of") ?? new Date().toISOString().slice(0, 10);
  const jsonPath = arg("json");
  const lookbackDays = Number(arg("lookback") ?? 365);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) {
    throw new Error(`Invalid --as-of date: ${asOf}`);
  }
  if (!Number.isInteger(lookbackDays) || lookbackDays <= 0) {
    throw new Error(`Invalid --lookback: ${arg("lookback")}`);
  }

  const { rows: orgRows } = await query<OrgRow>(
    `SELECT id, name, sector, dept, secteur_groupe AS "secteurGroupe"
       FROM org WHERE dept = ANY($1::text[])`,
    [NA_DEPARTMENTS],
  );
  const { rows: claimRows } = await query<ClaimRow>(
    `SELECT c.org_id AS "orgId",
            to_char(c.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "publishedAt",
            c.group_name AS "groupName", o.sector, o.dept,
            o.secteur_groupe AS "secteurGroupe"
       FROM leak_claim c JOIN org o ON o.id = c.org_id
      WHERE c.na AND c.org_id IS NOT NULL AND c.published_at IS NOT NULL
        AND o.dept = ANY($1::text[])`,
    [NA_DEPARTMENTS],
  );
  const { rows: brandClaimRows } = await query<BrandClaimRow>(
    `SELECT id, org_id AS "orgId", victim,
            to_char(published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "publishedAt"
       FROM leak_claim
      WHERE published_at IS NOT NULL AND victim IS NOT NULL`,
  );
  const { rows: aliasRows } = await query<AliasRow>(
    `SELECT oa.org_id AS "orgId", oa.alias
       FROM org_alias oa JOIN org o ON o.id = oa.org_id
      WHERE o.dept = ANY($1::text[]) AND oa.alias IS NOT NULL AND oa.rejected_at IS NULL`,
    [NA_DEPARTMENTS],
  );
  const { rows: eventRows } = await query<EventRow>(
    `SELECT e.org_id AS "orgId",
            to_char(e.valid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "validAt",
            e.source_id AS "sourceId"
       FROM event e
      WHERE e.org_id IN (SELECT id FROM org WHERE dept = ANY($1::text[]))`,
    [NA_DEPARTMENTS],
  );

  const orgs: OrgMeta[] = orgRows.map((org) => ({
    orgId: org.id, name: "", sector: org.sector, dept: org.dept,
  }));
  const claims: ClaimRecord[] = claimRows.map((claim) => ({
    orgId: claim.orgId, publishedAt: claim.publishedAt, groupName: claim.groupName,
  }));
  const events: EventRecord[] = eventRows.map((event) => ({
    orgId: event.orgId, validAt: event.validAt, sourceId: event.sourceId,
  }));
  const subjects: WaveSubject[] = claimRows.map((claim) => ({
    orgId: claim.orgId, publishedAt: claim.publishedAt,
    sectorGroup: claim.secteurGroupe, sector: claim.sector, dept: claim.dept,
  }));
  const aliases = new Map<number, string[]>();
  for (const row of aliasRows) {
    const list = aliases.get(row.orgId) ?? [];
    list.push(row.alias);
    aliases.set(row.orgId, list);
  }
  const brandOrganizations: BrandOrganization[] = orgRows.map((org) => ({
    orgId: org.id,
    name: org.name,
    aliases: aliases.get(org.id) ?? [],
  }));
  const brandClaims: BrandClaim[] = brandClaimRows.map((row) => ({
    claimId: row.id,
    orgId: row.orgId,
    victim: row.victim,
    publishedAt: row.publishedAt,
  }));
  const brandAttachment = attachBrandFamilyClaims(brandClaims, brandOrganizations);

  const cutoffs = walkForwardCutoffs(asOf);
  const windows = cutoffs.map((cutoff) => ({
    cutoff,
    candidates: buildCandidates(orgs, claims, events, cutoff),
    actual: victimsInWindow(claims, cutoff),
  }));

  const perSignal = SIGNALS.map((signal) => {
    const results = windows.map(({ cutoff, candidates, actual }) => {
      const brandAtCutoff = signal.brand
        ? brandAttachment.attachments.filter((a) => a.observedAt < cutoff)
        : [];
      const bonus = bonusByOrg(signal, orgRows, subjects, cutoff, lookbackDays, brandAtCutoff);
      return evaluateWindow(cutoff, rankWithBonus(candidates, bonus, signal.onlyNew), actual);
    });
    const summary = summariseBacktest(results);
    return {
      name: signal.name,
      predictions: summary.predictions,
      hits: summary.hits,
      victims: summary.victims,
      hitOrgIds: results.flatMap((window) => window.hits),
    };
  });

  const maxHits = Math.max(...perSignal.map((signal) => signal.hits));
  console.log(`Prior-signal ceiling — ${cutoffs.length} windows ${cutoffs[0]} → ${cutoffs.at(-1)}`);
  console.log(`Lookback: ${lookbackDays} days; signals: ${SIGNALS.length} (fixed, group-agnostic, strictly prior)`);
  console.log(`Victims: ${perSignal[0]?.victims ?? 0}; predictions per signal: ${perSignal[0]?.predictions ?? 0}`);
  console.log(`Brand attachments: ${brandAttachment.attachments.length} (${brandAttachment.ambiguous} ambiguous keys skipped)`);
  for (const signal of perSignal) {
    console.log(`  ${signal.name.padEnd(22)} ${signal.hits}/${signal.predictions} hits`);
  }
  console.log(
    maxHits === 0
      ? "No fixed prior-only signal reaches a hit: the 1-hit target remains open."
      : `Best prior-only signal reaches ${maxHits} hit(s).`,
  );

  if (jsonPath) {
    writeFileSync(
      jsonPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          asOf,
          lookbackDays,
          windows: cutoffs.length,
          signals: SIGNALS.map((signal) => signal.name),
          perSignal,
          brandAttachments: brandAttachment.attachments.length,
          maxHits,
          caveat:
            "Every ranking uses only claims published strictly before the cutoff and no group label of the future claim. Brand-family signals use claim victim names (organisation names) only; organisation ids, scope codes and dates only otherwise.",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`\nMeasurement written to ${jsonPath}`);
  }
  await closePools();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await closePools().catch(() => {});
  process.exitCode = 1;
});
