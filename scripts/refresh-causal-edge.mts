/**
 * Reconstruit les chemins fournisseur → victime datés depuis les tables
 * vivantes, puis affiche la sortie brute du critère du vérificateur.
 *
 *   tsx scripts/refresh-causal-edge.mts            # base de mesure (:5433)
 *   DATABASE_URL=... tsx scripts/refresh-causal-edge.mts
 *
 * L'instantané versionné par la migration 227 n'est jamais écrasé.
 */
import { createRequire } from "node:module";

import { JUDGE_SQL, refreshCausalEdges } from "../apps/api/src/graph/causal-edge-store.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const connectionString =
  process.env.RADAR_MESURE_DB_URL ??
  process.env.DATABASE_URL ??
  "postgres://radar:radar@localhost:5433/radar";

const client = new Client({ connectionString });
await client.connect();
try {
  const report = await refreshCausalEdges(client);
  console.log(`observations : ${report.observed}`);
  console.log(`insérées     : ${report.inserted}`);
  console.log(`rejetées     : ${report.rejected}`);
  console.log(`${JUDGE_SQL};`);
  console.log(report.judgeCount);
} finally {
  await client.end();
}
