/**
 * Reproducible SIREN verification rate for Nouvelle-Aquitaine.
 *
 * Read-only: SELECTs on the local PostgreSQL database plus the versioned open
 * register snapshot in db/data/entreprises-na.json. No network calls, no paid
 * service, no personal data, no writes.
 *
 * Usage:
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/audit-siren.mts
 *   ... --json=bench/results/siren-verifie.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { closePools, query } from "../apps/api/src/db.js";
import {
  auditHomonymGroup,
  formatRate,
  groupByIdentity,
  identityKey,
  legalName,
  verifiedRate,
  type SirenCandidate,
  type SirenIdentityRow,
} from "../apps/api/src/siren/audit.js";

const DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

interface Options {
  jsonFile: string | null;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { jsonFile: null };
  for (const arg of argv) {
    if (arg.startsWith("--json=")) options.jsonFile = resolve(arg.slice("--json=".length));
  }
  return options;
}

interface BaseRow {
  organizations: number;
  sources: number;
  events: number;
}

interface FormatRow {
  total: number;
  formatted: number;
}

interface RegisterEntry {
  siren: string;
  nom: string;
  siege: { commune: string | null; departement: string | null } | null;
}

function registerKeys(): Set<string> {
  const file = new URL("../db/data/entreprises-na.json", import.meta.url);
  const data = JSON.parse(readFileSync(file, "utf8")) as { entreprises: RegisterEntry[] };
  return new Set(
    data.entreprises
      .filter((entry) => /^\d{9}$/.test(entry.siren))
      .map((entry) =>
        `${identityKey(legalName(entry.nom), entry.siege?.commune, entry.siege?.departement)}|${entry.siren}`,
      ),
  );
}

async function measure(): Promise<Record<string, unknown>> {
  const base = await query<BaseRow>(`
    SELECT (SELECT count(*)::int FROM org) AS organizations,
           (SELECT count(*)::int FROM source) AS sources,
           (SELECT count(*)::int FROM event) AS events
  `);

  const format = await query<FormatRow>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE siren ~ '^[0-9]{9}$')::int AS formatted
       FROM org WHERE dept = ANY($1::text[]) AND siren IS NOT NULL`,
    [DEPARTMENTS],
  );

  const luhn = await query<{ bad: number }>(
    `WITH formatted AS (
       SELECT id, siren FROM org
        WHERE dept = ANY($1::text[]) AND siren IS NOT NULL AND siren ~ '^[0-9]{9}$'
     ), digits AS (
       SELECT id, i, substring(siren FROM i FOR 1)::int AS digit
         FROM formatted CROSS JOIN generate_series(1, 9) i
     ), sums AS (
       SELECT id, sum(CASE WHEN i % 2 = 0
                             THEN CASE WHEN digit * 2 > 9 THEN digit * 2 - 9 ELSE digit * 2 END
                             ELSE digit END) AS total
         FROM digits GROUP BY id
     )
     SELECT count(*) FILTER (WHERE total % 10 <> 0)::int AS bad FROM sums`,
    [DEPARTMENTS],
  );

  const rows = await query<SirenIdentityRow>(
    `SELECT id, siren, name_norm AS name, city, dept
       FROM org
      WHERE dept = ANY($1::text[]) AND siren IS NOT NULL AND name_norm IS NOT NULL`,
    [DEPARTMENTS],
  );
  const groups = groupByIdentity(rows.rows).filter(
    (group) => new Set(group.members.map((member) => member.siren)).size > 1,
  );

  const proofs = await query<{ id: number; valeur: string }>(
    `SELECT org_id::int AS id, valeur FROM org_enrichissement
      WHERE champ = 'siren' AND confiance >= 0.9 AND valeur ~ '^[0-9]{9}$'`,
  );

  const corroborations = registerKeys();
  const proofValues = new Map(proofs.rows.map((row) => [row.id, row.valeur]));
  let ambiguous = 0;
  let ambiguousWithoutCorroboration = 0;

  for (const group of groups) {
    const identity = group.identity;
    const members: SirenCandidate[] = group.members.map(({ id, siren }) => ({
      id,
      siren,
      registerMatch: corroborations.has(`${identity}|${siren}`),
      proofMatch: proofValues.get(id) === siren,
    }));
    for (const verdict of auditHomonymGroup({ identity, members }).values()) {
      if (verdict === "ambiguous") ambiguous++;
    }
    const unverified = members.map((member) => ({ ...member, registerMatch: false, proofMatch: false }));
    for (const verdict of auditHomonymGroup({ identity, members: unverified }).values()) {
      if (verdict === "ambiguous") ambiguousWithoutCorroboration++;
    }
  }

  const total = format.rows[0].total;
  const invalid = total - format.rows[0].formatted + luhn.rows[0].bad;
  const rate = verifiedRate({ totalWithSiren: total, invalid, ambiguous });
  const baseline = verifiedRate({
    totalWithSiren: total,
    invalid,
    ambiguous: ambiguousWithoutCorroboration,
  });

  return {
    generatedAt: new Date().toISOString(),
    scope: { region: "Nouvelle-Aquitaine", departments: DEPARTMENTS },
    base: base.rows[0],
    metric: {
      organizationsWithSiren: total,
      structurallyInvalid: invalid,
      homonymGroups: groups.length,
      ambiguous,
      verified: total - invalid - ambiguous,
      verifiedWithoutCorroboration: total - invalid - ambiguousWithoutCorroboration,
      rate,
      ratePercent: formatRate(rate),
      rateWithoutCorroborationPercent: formatRate(baseline),
    },
    method:
      "SIREN verified = 9 digits + INSEE Luhn + identity group without a competing SIREN, or resolved by an independent register snapshot / traceable proof",
    command:
      "DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/audit-siren.mts --json=bench/results/siren-verifie.json",
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await measure();
  if (options.jsonFile) {
    mkdirSync(dirname(options.jsonFile), { recursive: true });
    writeFileSync(options.jsonFile, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePools());
