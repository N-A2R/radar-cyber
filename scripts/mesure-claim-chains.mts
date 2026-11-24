/**
 * Mesure reproductible des affirmations répétées sans source primaire.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-claim-chains.mts \
 *     --json=bench/results/claim-chain-2026-11-23.json
 *
 * Écrit `claim_chain` depuis `leak_claim` via `refresh_claim_chains()`, exécute
 * le critère du chantier tel quel, puis publie un rapport sans nom de victime,
 * sans URL et sans donnée personnelle. Aucun appel réseau.
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { closePools, query } = await import("../apps/api/src/db.js");
const {
  projectClaimChains,
  summarizeClaimChains,
  RUMEUR_AGE_JOURS,
  RUMEUR_REPETITIONS,
} = await import("../apps/api/src/analyse/claim-chains.js");

const JSON_PATH = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
  ?? "bench/results/claim-chain-2026-11-23.json";
const CRITERE = `SELECT count(*) FROM claim_chain WHERE repetitions>=3 AND primary_source_count=0 AND first_seen_at IS NOT NULL >=30;`;

async function main(): Promise<void> {
  const refreshed = await query<{ refresh_claim_chains: string }>("SELECT public.refresh_claim_chains()");
  const criterion = await query<{ count: string }>(CRITERE);
  const count = Number(criterion.rows[0]!.count);

  const rows = await query<{
    claim_key: string;
    repetitions: number;
    primary_source_count: number;
    source_count: number;
    group_count: number;
    first_seen_at: Date | string | null;
    last_seen_at: Date | string | null;
  }>(`SELECT claim_key, repetitions, primary_source_count, source_count, group_count,
               first_seen_at, last_seen_at
          FROM claim_chain ORDER BY claim_key`);
  const scale = await query<{ claims: string }>("SELECT count(*)::text AS claims FROM leak_claim");

  const summary = summarizeClaimChains(rows.rows);
  if (summary.rumeurs !== count) {
    throw new Error(`critère ${count} ≠ projection ${summary.rumeurs}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    method: {
      definition: "same victim asserted at least three times by at least two distinct sources",
      primarySource: "a claim linked to a confirmed public event (document de première main)",
      minimumAgeDays: RUMEUR_AGE_JOURS,
      minimumRepetitions: RUMEUR_REPETITIONS,
      criterion: CRITERE,
      privacy: "SHA-256 victim fingerprints, counts and dates only; no title, name or URL",
    },
    dataset: { claims: Number(scale.rows[0]!.claims), chains: refreshed.rows[0]!.refresh_claim_chains },
    criterion: count,
    summary,
    chains: projectClaimChains(rows.rows),
  };
  writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(CRITERE);
  console.log(` count`);
  console.log(`-------`);
  console.log(`   ${count}`);
  console.log(`Chaînes écrites : ${report.dataset.chains} (revendications : ${report.dataset.claims})`);
  console.log(`Rapport : ${JSON_PATH}`);
  if (count === 0) process.exitCode = 1;
}

const isMain = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closePools();
  }
}
