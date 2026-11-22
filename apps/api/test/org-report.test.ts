/**
 * Ten-page organisation report: one test per observable behaviour.
 *
 * The fixtures are inserted in the isolated test database created by
 * `test/run.ts`; the production database is never touched.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { query } from "../src/db.js";
import orgReportRoute from "../src/routes/org-report.js";
import {
  buildOrgReport, countPdfPages, renderOrgReportPdf,
  REPORT_PAGE_COUNT, REPORT_PAGE_TITLES, type OrgReportInput,
} from "../src/report/org-report.js";
import {
  fetchOrgBatch, inputFromRow, loadOrgReportInput, loadReportIndex,
} from "../src/report/org-report-data.js";

const PREFIX = "org-report-test";
const GENERATED_AT = "2026-11-22T12:00:00.000Z";
const PERSONAL_NAME = "Marie Durand";

let naOrgId = 0;
let outsideOrgId = 0;

function fixtureInput(name: string, dept: string | null): OrgReportInput {
  return {
    org: {
      id: 42, name, kind: "entreprise", sector: "sante-social", city: "Bordeaux",
      dept, domain: "exemple-na.invalid", createdAt: "2026-01-01T00:00:00.000Z",
      status: "confirme", parentId: null,
    },
    generatedAt: GENERATED_AT,
    aliases: 2,
    events: {
      total: 3, regional: 2, exposure: 1,
      byFamily: [{ label: "ransomware", count: 3 }],
      byMonth: [{ label: "2026-11", count: 3 }],
      lastObservedAt: "2026-11-20T10:00:00.000Z",
    },
    assets: { total: 1, byKind: [{ label: "domain", count: 1 }] },
    sources: {
      total: 312, na: 280, gray: 11, used: 1,
      byFamily: [{ label: "ransomware", count: 1 }],
    },
    claims: 1,
    relations: { parents: 0, children: 1 },
    baseline: { orgs: 1_673_151, sources: 312, events: 26_394 },
  };
}

async function install(): Promise<void> {
  for (const [id, relevance] of [
    [`${PREFIX}-grey`, "context"],
    [`${PREFIX}-clear`, "reference"],
  ] as const) {
    await query(
      `INSERT INTO source (id, name, family, url, relevance, license, retain_raw)
       VALUES ($1, $2, 'ransomware', 'https://example.invalid/feed', $3, NULL, false)
       ON CONFLICT (id) DO NOTHING`,
      [id, `${PREFIX} ${relevance}`, relevance],
    );
  }
  const orgs = await query<{ id: number; slug: string }>(
    `INSERT INTO org (name, slug, kind, sector, city, dept, domain, status) VALUES
       ($1, $1, 'entreprise', 'sante-social', 'Bordeaux', '33', 'exemple-na.invalid', 'confirme'),
       ($2, $2, 'entreprise', NULL, 'Paris', '93', 'exemple-hors-na.invalid', 'confirme')
     ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id, slug`,
    [`${PREFIX}-na`, `${PREFIX}-outside`],
  );
  naOrgId = orgs.rows.find((r) => r.slug === `${PREFIX}-na`)?.id ?? 0;
  outsideOrgId = orgs.rows.find((r) => r.slug === `${PREFIX}-outside`)?.id ?? 0;

  for (const [suffix, orgId, source] of [
    ["na", naOrgId, `${PREFIX}-grey`],
    ["outside", outsideOrgId, `${PREFIX}-clear`],
  ] as const) {
    await query(
      `INSERT INTO event (dedup_key, family, assertion_type, title, summary, org_id,
                          severity, observed_at, collected_at, source_id, tlp, regional)
       VALUES ($1, 'ransomware', 'third_party_claim', $2, $3, $4, 4,
               '2026-11-20T10:00:00Z', '2026-11-20T12:00:00Z', $5, 'CLEAR', true)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [`${PREFIX}-event-${suffix}`, `Victime ${PERSONAL_NAME}`, `Contact ${PERSONAL_NAME} au 06...`, orgId, source],
    );
  }

  await query(
    `INSERT INTO asset (org_id, kind, value, status)
     SELECT $1, 'domain', 'profil-${PERSONAL_NAME}.invalid', 'active'
     WHERE NOT EXISTS (SELECT 1 FROM asset WHERE org_id=$1)`,
    [naOrgId],
  );
  await query(
    `INSERT INTO quarantine_raw (source, source_url, groupe, org_hint, claimed_at,
                                 extracted, raw_body, tlp, content_hash, status)
     VALUES ($1, 'https://example.invalid/claim', 'groupe-test', $2,
             '2026-11-20T10:00:00Z', '{}'::jsonb, $3, 'CLEAR', $4, 'pending')
     ON CONFLICT (source, content_hash) DO NOTHING`,
    [`${PREFIX}-grey`, `${PREFIX}-na`, `Signal privé sur ${PERSONAL_NAME}`, `${PREFIX}-claim-hash`],
  );
}

await install();

after(async () => {
  await query("DELETE FROM event WHERE dedup_key LIKE $1", [`${PREFIX}-%`]);
  await query("DELETE FROM asset WHERE org_id IN ($1, $2)", [naOrgId, outsideOrgId]);
  await query("DELETE FROM quarantine_raw WHERE content_hash LIKE $1", [`${PREFIX}-%`]);
  await query("DELETE FROM org WHERE slug LIKE $1", [`${PREFIX}-%`]);
  await query("DELETE FROM source WHERE id LIKE $1", [`${PREFIX}-%`]);
});

async function input(orgId: number): Promise<OrgReportInput> {
  const loaded = await loadOrgReportInput(orgId, GENERATED_AT);
  assert.ok(loaded, `organisation ${orgId} introuvable`);
  return loaded;
}

test("a report always has ten pages in the documented order", () => {
  const report = buildOrgReport(fixtureInput("Organisation test", "33"));
  assert.equal(report.pages.length, REPORT_PAGE_COUNT);
  assert.deepEqual(report.pages.map((page) => page.title), [...REPORT_PAGE_TITLES]);
  assert.ok(report.pages.every((page) => page.lines.length > 0));
});

test("a missing organisation has no report", async () => {
  assert.equal(await loadOrgReportInput(2_147_483_647, GENERATED_AT), null);
});

test("the PDF carries ten page objects and a matching page tree", async () => {
  const pdf = renderOrgReportPdf(buildOrgReport(await input(naOrgId)));
  assert.ok(pdf.subarray(0, 8).toString("latin1").startsWith("%PDF-1.4"));
  assert.equal(countPdfPages(pdf), 10);
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 10);
  assert.ok(pdf.toString("latin1").includes("/Encoding /WinAnsiEncoding"));
});

test("the report never contains a victim name or a claim excerpt", async () => {
  const report = buildOrgReport(await input(naOrgId));
  const text = report.pages.map((page) => page.lines.join("\n")).join("\n");
  assert.equal(text.includes(PERSONAL_NAME), false);
  assert.equal(text.includes("06..."), false);
  const pdf = renderOrgReportPdf(report).toString("latin1");
  assert.equal(pdf.includes(PERSONAL_NAME), false);
});

test("only Nouvelle-Aquitaine sources count in the regional total", async () => {
  const loaded = await input(naOrgId);
  assert.equal(loaded.sources.na, 1);
  assert.equal(loaded.sources.total >= 2, true);
  assert.equal(loaded.events.total, 1);
  const outside = await input(outsideOrgId);
  assert.equal(outside.events.total, 1);
  assert.equal(outside.sources.na, 1);
});

test("grey sources are kept, not filtered out", async () => {
  const loaded = await input(naOrgId);
  const inDb = await query<{ n: number }>("SELECT count(*)::int AS n FROM source WHERE relevance='context'");
  assert.equal(loaded.sources.gray, inDb.rows[0]?.n);
  assert.equal(loaded.sources.byFamily[0]?.label, "ransomware");
});

test("the bulk path produces the same ten pages as the on-demand path", async () => {
  const index = await loadReportIndex();
  const rows = await fetchOrgBatch(naOrgId - 1, 1000);
  const row = rows.find((candidate) => candidate.id === naOrgId);
  assert.ok(row);
  const bulk = buildOrgReport(inputFromRow(row, index, GENERATED_AT));
  const direct = buildOrgReport(await input(naOrgId));
  assert.deepEqual(bulk.pages.map((page) => page.title), direct.pages.map((page) => page.title));
  assert.equal(bulk.pages.length, 10);
});

test("the HTTP route serves a downloadable ten-page PDF", async () => {
  const app = Fastify();
  await app.register(orgReportRoute, { prefix: "/api" });
  try {
    const res = await app.inject({ method: "GET", url: `/api/orgs/${naOrgId}/report.pdf` });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-type"] ?? "", /application\/pdf/);
    assert.match(res.headers["content-disposition"] ?? "", /attachment/);
    assert.equal(res.headers["x-report-pages"], "10");
    assert.equal(countPdfPages(res.rawPayload), 10);
  } finally {
    await app.close();
  }
});

test("an unknown id returns 404 instead of an empty report", async () => {
  const app = Fastify();
  await app.register(orgReportRoute, { prefix: "/api" });
  try {
    const res = await app.inject({ method: "GET", url: "/api/orgs/2147483647/report.pdf" });
    assert.equal(res.statusCode, 404);
  } finally {
    await app.close();
  }
});
