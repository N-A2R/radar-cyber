/**
 * Builds and measures the digital provider map for Nouvelle-Aquitaine.
 *
 * Usage:
 *   apps/api/node_modules/.bin/tsx scripts/provider-concentration.mts --collect
 *   apps/api/node_modules/.bin/tsx scripts/provider-concentration.mts
 *
 * `--collect` refreshes `provider_domain` from public DNS-over-HTTPS queries
 * (Cloudflare, no key, no paid service). It is bounded in time so a single
 * command never exceeds the 60-second limit. Without `--collect`, the command
 * is read-only and prints the measured concentration from `provider_domain`
 * (falling back to the DNS snapshots already in the database when the table
 * has not been populated yet).
 *
 * Only institutional domains, public NS/MX hosts and organization ids are
 * read. Organization names are never loaded into the report.
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  buildProviderConcentration,
  NA_DEPARTMENTS,
  isNaDepartment,
  type OrganizationRef,
  type ProviderObservation,
} from "../apps/api/src/analyse/provider-concentration.js";
import { mxHost } from "../apps/api/src/dns/historique.js";
import type { DnsProvider } from "../apps/api/src/dns/historique.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const args = process.argv.slice(2);
const collect = args.includes("--collect");
const output = args.find((a) => a.startsWith("--out="))?.slice(6);
const seconds = Number(args.find((a) => a.startsWith("--seconds="))?.slice(10) ?? 45);
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 55) {
  throw new Error("--seconds must be between 1 and 55");
}
const url =
  process.env.RADAR_MESURE_DB_URL ??
  process.env.DATABASE_URL ??
  "postgres://radar:radar@localhost:5433/radar";

type ObservationRow = {
  domain: string;
  orgIds: number[] | null;
  ns: string[] | null;
  mx: string[] | null;
  errors: string[] | null;
  observedAt: string;
};

type TrackedDomain = { domain: string; orgIds: number[] };

const DNS_ENDPOINT = "https://cloudflare-dns.com/dns-query";

/** Latest stored DNS observation, used when the map has not been collected. */
const LATEST_SNAPSHOTS = `
  WITH latest AS (
    SELECT DISTINCT ON (s.domain)
           s.domain, s.ns, s.mx, s.errors, s.observed_at
      FROM dns_snapshot s
     ORDER BY s.domain, s.observed_at DESC, s.id DESC
  )
  SELECT d.domain, d.org_ids AS "orgIds", l.ns, l.mx, l.errors,
         l.observed_at::text AS "observedAt"
    FROM dns_domaine d
    JOIN latest l ON l.domain = d.domain
   WHERE cardinality(d.org_ids) > 0
     AND (cardinality(l.ns) > 0 OR cardinality(l.mx) > 0 OR cardinality(l.errors) > 0)
   ORDER BY d.domain`;

const STORED_OBSERVATIONS = `
  SELECT domain, org_ids AS "orgIds", ns, mx, errors,
         observed_at::text AS "observedAt"
    FROM provider_domain
   ORDER BY domain`;

function toObservations(rows: ObservationRow[]): ProviderObservation[] {
  return rows.map((row) => ({
    domain: row.domain,
    orgIds: row.orgIds ?? [],
    ns: row.ns ?? [],
    mx: row.mx ?? [],
    errors: row.errors ?? [],
    observedAt: row.observedAt,
  }));
}

function stateOf(errors: readonly string[]): "ok" | "partiel" | "erreur" {
  const nsFailed = errors.some((e) => e.startsWith("doh:NS:"));
  const mxFailed = errors.some((e) => e.startsWith("doh:MX:"));
  if (nsFailed && mxFailed) return "erreur";
  if (nsFailed || mxFailed) return "partiel";
  return "ok";
}

function host(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

async function doh(name: string, type: "NS" | "MX"): Promise<string[]> {
  const response = await fetch(`${DNS_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as { Status: number; Answer?: Array<{ data: string }> };
  // NXDOMAIN is a valid answer: the domain simply has no record of this type.
  if (data.Status !== 0 && data.Status !== 3) throw new Error(`DNS status ${data.Status}`);
  return (data.Answer ?? []).map((answer) => answer.data);
}

/** Reads NS and MX for one domain; a failure is recorded, never guessed. */
async function observe(domain: string): Promise<ProviderObservation> {
  const errors: string[] = [];
  let ns: string[] = [];
  let mx: string[] = [];
  try {
    ns = [...new Set((await doh(domain, "NS")).map(host).filter(Boolean))].sort();
  } catch (error) {
    errors.push(`doh:NS: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    mx = [
      ...new Set((await doh(domain, "MX")).map(mxHost).filter((h): h is string => h !== null)),
    ].sort();
  } catch (error) {
    errors.push(`doh:MX: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { domain, orgIds: [], ns, mx, errors, observedAt: new Date().toISOString() };
}

async function persist(client: import("pg").PoolClient | import("pg").Client, rows: readonly ProviderObservation[]): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO provider_domain
         (domain, org_ids, ns, mx, observed_at, last_state, errors)
       VALUES ($1, $2::int[], $3::text[], $4::text[], $5, $6, $7::text[])
       ON CONFLICT (domain) DO UPDATE SET
         org_ids = EXCLUDED.org_ids,
         ns = EXCLUDED.ns,
         mx = EXCLUDED.mx,
         observed_at = EXCLUDED.observed_at,
         last_state = EXCLUDED.last_state,
         errors = EXCLUDED.errors`,
      [row.domain, row.orgIds, row.ns, row.mx, row.observedAt, stateOf(row.errors), row.errors],
    );
  }
}

async function collectDomains(client: import("pg").Client, deadline: number): Promise<number> {
  const domainsResult = await client.query<TrackedDomain>(
    `SELECT domain, org_ids AS "orgIds" FROM dns_domaine ORDER BY domain`,
  );
  // Sequential: a pg Client queues queries, and parallel calls are deprecated.
  const organizationsResult = await client.query<OrganizationRef>(
    `SELECT id, dept, lat, lon FROM org
      WHERE id = ANY(ARRAY(SELECT unnest(org_ids) FROM dns_domaine))`,
  );
  const orgById = new Map(organizationsResult.rows.map((org) => [org.id, org]));
  const targets: TrackedDomain[] = domainsResult.rows
    .map((row) => ({
      domain: row.domain,
      orgIds: (row.orgIds ?? []).filter((id) => isNaDepartment(orgById.get(id)?.dept)),
    }))
    .filter((row) => row.orgIds.length > 0);
  const fresh = new Set(
    (
      await client.query<{ domain: string }>(
        `SELECT domain FROM provider_domain WHERE observed_at > now() - interval '1 day'`,
      )
    ).rows.map((row) => row.domain),
  );
  const pending = targets.filter((row) => !fresh.has(row.domain));
  const collected: ProviderObservation[] = [];
  let cursor = 0;
  const workers = Array.from({ length: 16 }, async () => {
    while (Date.now() < deadline && cursor < pending.length) {
      const target = pending[cursor++]!;
      const observation = await observe(target.domain);
      observation.orgIds = target.orgIds;
      collected.push(observation);
    }
  });
  await Promise.all(workers);
  await persist(client, collected);
  return collected.length;
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("SET statement_timeout = '45000'");
    if (collect) {
      const count = await collectDomains(client, Date.now() + seconds * 1000);
      console.log(`DNS collection: ${count} domains refreshed (budget ${seconds}s)`);
    }

    const stored = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM provider_domain");
    const usingStored = Number(stored.rows[0]?.n ?? 0) > 0;
    const observations = toObservations(
      (await client.query<ObservationRow>(usingStored ? STORED_OBSERVATIONS : LATEST_SNAPSHOTS)).rows,
    );
    // Sequential queries: one pg Client must not be used concurrently.
    const organizations = await client.query<OrganizationRef>(
      `SELECT id, dept, lat, lon FROM org
        WHERE id = ANY(ARRAY(SELECT unnest(org_ids) FROM dns_domaine))`,
    );
    const catalogue = await client.query<DnsProvider>(
      "SELECT suffix, name, category, mode FROM dns_fournisseur",
    );
    // Planner estimate: a full count over the 1.6M-row org table is too slow.
    const size = await client.query<{ n: string }>(
      `SELECT reltuples::bigint::text AS n FROM pg_class
        WHERE relname = 'org' AND relkind = 'r'`,
    );

    const report = buildProviderConcentration({
      observations,
      organizations: organizations.rows,
      catalogue: catalogue.rows,
      totalOrganizations: Number(size.rows[0]?.n ?? 0),
    });

    if (output) {
      const path = fileURLToPath(new URL(`../${output}`, import.meta.url));
      writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`report written to ${output}`);
    }

    const { totals, concentration } = report;
    const top = concentration.topProvider;
    console.log(
      `provider concentration (Nouvelle-Aquitaine): ` +
        `${totals.organizationsAttributed} organizations attributed across ` +
        `${totals.domainsObserved} observed domains and ${totals.providers} providers ` +
        `(source: ${usingStored ? "provider_domain" : "dns_snapshot"})`,
    );
    console.log(
      `top provider: ${top?.name ?? "none"} — ${top?.organizations ?? 0} organizations ` +
        `(${Math.round((top?.share ?? 0) * 1000) / 10}% of attributed organizations)`,
    );
    console.log(
      `top-5 coverage: ${Math.round(concentration.top5Coverage * 1000) / 10}%; ` +
        `${concentration.organizationsUsingMultipleProviders} organizations use several providers`,
    );
    console.log(
      `scope: ${NA_DEPARTMENTS.length} departments, ` +
        `${totals.organizations} referential organizations (planner estimate)`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
