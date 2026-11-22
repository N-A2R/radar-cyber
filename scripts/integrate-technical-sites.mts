/**
 * Integrate the NA technical-source catalogue and its organization-level
 * claims into the working database.
 *
 * Sources are public CVE, PoC, NVD, Exploit-DB and GitHub endpoints scoped to
 * a Nouvelle-Aquitaine anchor. Each URL is probed once before registration;
 * only 2xx/3xx responses are integrated. Claims carry organization names only
 * and are attached solely when the referential confirms the same name and NA
 * department. Idempotent: rerunning never duplicates a source or a claim.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/integrate-technical-sites.mts \
 *     --json=bench/results/technical-sites-integration-2026-11-21.json
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, ingestQuery, query } from "../apps/api/src/db.js";
import {
  matchesNaOrganization,
  parseNaClaim,
  parseTechnicalSite,
  type NaClaim,
  type TechnicalSite,
} from "../apps/api/src/technical/catalog.js";
import { CLAIM_SOURCE, SOURCE_ID_PREFIX } from "../apps/api/src/technical/measure.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCES_FILE = `${ROOT}bench/corpus/technical-sites-na.jsonl`;
const CLAIMS_FILE = `${ROOT}bench/corpus/na-org-claims.jsonl`;
const USER_AGENT = "radar-cyber-technical-sites/1.0 (public endpoints; no personal data)";

function readJsonl(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as unknown);
}

/** A source already probed in a previous run keeps its recorded evidence. */
async function previouslyVerified(id: string): Promise<number | null> {
  const found = await query<{ status: number | null }>(
    `SELECT (parser->>'httpStatus')::int AS status
       FROM source WHERE id = $1 AND region = 'nouvelle-aquitaine'`,
    [id],
  );
  const status = found.rows[0]?.status ?? null;
  return status !== null && status >= 200 && status < 400 ? status : null;
}

/**
 * Bounded GET with a small retry for transient gateway and rate-limit codes.
 * The response body is never downloaded past the status line.
 */
async function probe(url: string): Promise<number> {
  let status = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Range: "bytes=0-1023" },
        redirect: "follow",
        signal: controller.signal,
      });
      status = response.status;
      try {
        await response.body?.cancel();
      } catch {
        // The status is already known; a cancelled stream is not a failure.
      }
    } catch {
      status = 0;
    } finally {
      clearTimeout(timer);
    }
    if (status >= 200 && status < 400) return status;
    if (attempt === 2 || ![0, 429, 502, 503, 504].includes(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  return status;
}

async function registerSource(site: TechnicalSite, status: number): Promise<boolean> {
  const result = await ingestQuery(
    `INSERT INTO source
       (id, name, family, url, license, retain_raw, enabled, kind, format,
        parser, interval_sec, description, region, department)
     VALUES ($1, $2, 'vuln', $3, 'public', false, true, 'indicator', $4,
             $5, 86400, $6, 'nouvelle-aquitaine', $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      site.id, site.name, site.url, site.format,
      JSON.stringify({
        kind: site.kind,
        naAnchor: site.naAnchor,
        verifiedAt: new Date().toISOString(),
        httpStatus: status,
      }),
      `${site.kind} endpoint for ${site.naAnchor}`,
      site.department,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

async function registerClaim(claim: NaClaim): Promise<"inserted" | "exists" | "rejected"> {
  const found = await query<{ id: number; name: string; department: string | null }>(
    "SELECT id, name, dept AS department FROM org WHERE id = $1",
    [claim.orgId],
  );
  const org = found.rows[0];
  if (!org || !matchesNaOrganization(claim, org)) return "rejected";

  const fingerprint = createHash("sha256")
    .update(`${claim.source}|${claim.groupName}|${claim.orgId}|${claim.publishedAt}`)
    .digest("hex")
    .slice(0, 32);
  const result = await ingestQuery(
    `INSERT INTO leak_claim
       (fingerprint, source, site_slug, group_name, victim, published_at,
        evidence_url, org_id, na, na_motif)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
     ON CONFLICT (fingerprint) DO NOTHING`,
    [
      fingerprint, claim.source, claim.id, claim.groupName, org.name,
      claim.publishedAt, claim.evidenceUrl, claim.orgId, claim.naMotif,
    ],
  );
  return (result.rowCount ?? 0) > 0 ? "inserted" : "exists";
}

const argv = process.argv.slice(2);
const output = argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `${ROOT}bench/results/technical-sites-integration-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const sites = readJsonl(SOURCES_FILE).map(parseTechnicalSite).filter((site) => site !== null);
  const claims = readJsonl(CLAIMS_FILE).map(parseNaClaim).filter((claim) => claim !== null);
  if (sites.length === 0 || claims.length === 0) throw new Error("empty technical corpus");

  const verified: { id: string; status: number; via: "live" | "database" }[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (let index = 0; index < sites.length; index += 4) {
    const batch = sites.slice(index, index + 4);
    const prior = await Promise.all(batch.map((site) => previouslyVerified(site.id)));
    const statuses = await Promise.all(
      batch.filter((_, offset) => prior[offset] === null).map((site) => probe(site.url)),
    );
    let probed = 0;
    for (let offset = 0; offset < batch.length; offset += 1) {
      const site = batch[offset]!;
      const status = prior[offset] ?? statuses[probed++]!;
      if (status >= 200 && status < 400) {
        await registerSource(site, status);
        verified.push({ id: site.id, status, via: prior[offset] === null ? "live" : "database" });
      } else {
        skipped.push({ id: site.id, reason: `http ${status}` });
      }
    }
  }

  let inserted = 0;
  let existing = 0;
  const rejected: string[] = [];
  for (const claim of claims) {
    const outcome = await registerClaim(claim);
    if (outcome === "inserted") inserted += 1;
    else if (outcome === "exists") existing += 1;
    else rejected.push(claim.id);
  }

  const report = {
    command: "tsx scripts/integrate-technical-sites.mts",
    scope: "nouvelle-aquitaine",
    sourcePrefix: SOURCE_ID_PREFIX,
    claimSource: CLAIM_SOURCE,
    constraints: {
      graySources: true,
      personalData: false,
      paidServices: false,
    },
    sources: {
      inCorpus: sites.length,
      verified: verified.length,
      skipped,
      byKind: Object.fromEntries(
        ["cve", "poc", "nvd", "exploit_db", "github"].map((kind) => [
          kind,
          sites.filter((site) => site.kind === kind).length,
        ]),
      ),
    },
    claims: { inCorpus: claims.length, inserted, existing, rejected },
    verified,
    integratedAt: new Date().toISOString(),
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Technical sources verified: ${verified.length}/${sites.length}; ` +
      `NA claims attached: ${inserted} (existing ${existing}, rejected ${rejected.length}) -> ${output}`,
  );
} finally {
  await closePools();
}
