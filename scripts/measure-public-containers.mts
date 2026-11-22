/**
 * Reproducible measurement of publicly accessible containers exposing
 * Nouvelle-Aquitaine data.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:na-containers
 *   DATABASE_URL=... pnpm measure:na-containers --json=bench/results/na-public-containers.json
 *
 * The baseline comes from the live database, the container count from the
 * versioned redacted corpus. Nothing is downloaded and no personal data is
 * read or written.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import { loadCorpus } from "../apps/api/src/public-containers/corpus.js";
import { SQL, measurePublicContainers } from "../apps/api/src/public-containers/measure.js";

const argv = process.argv.slice(2);
const corpusPath = argv.find((a) => a.startsWith("--corpus="))?.slice(9) ??
  "db/data/na-public-containers.json";
const output = argv.find((a) => a.startsWith("--json="))?.slice(7) ??
  "bench/results/na-public-containers.json";

try {
  const corpus = loadCorpus(corpusPath);
  const measurement = await measurePublicContainers(corpus);
  const result = {
    command: "pnpm measure:na-containers",
    ...measurement,
    sql: SQL,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `NA public containers with NA data: ${measurement.count} ` +
      `(repositories=${measurement.byKind.repository}, gists=${measurement.byKind.gist}, ` +
      `buckets=${measurement.byKind.bucket}, scanned=${measurement.candidatesScanned}, ` +
      `orgs=${measurement.baseline.organizations}, sources=${measurement.baseline.sources}, ` +
      `events=${measurement.baseline.events}) -> ${output}`,
  );
} finally {
  await closePools();
}
