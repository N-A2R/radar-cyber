#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of the encrypted cold archive procedure.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-cold-archive.mts
 *
 * Optional: RADAR_COLD_ARCHIVE_DIR, RADAR_COLD_ARCHIVE_PASSPHRASE.
 * A passphrase generated for one run is ephemeral; the published figure is
 * the digest of the canonical plaintext, not of the random envelope.
 */
import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runColdArchiveProcedure } from "../apps/api/src/coldarchive/procedure.js";
import { closePools } from "../apps/api/src/db.js";

async function main(): Promise<void> {
  const directory =
    process.env.RADAR_COLD_ARCHIVE_DIR ?? (await mkdtemp(join(tmpdir(), "radar-cold-")));
  const passphrase =
    process.env.RADAR_COLD_ARCHIVE_PASSPHRASE ?? randomBytes(24).toString("hex");
  const result = await runColdArchiveProcedure({ directory, passphrase });
  const passed = result.stages.filter((stage) => stage.ok).length;
  const percent =
    result.selected === 0 ? 0 : Math.round((result.restored / result.selected) * 100);

  console.log(
    `Cold archive: ${passed}/${result.stages.length} stages passed; ` +
      `${result.restored}/${result.selected} NA events sealed, encrypted and restored (${percent}%); ` +
      `sources=${result.sources}; sha256=${result.sha256}; scope=Nouvelle-Aquitaine`,
  );
  console.log(
    JSON.stringify({
      passed,
      stages: result.stages,
      selected: result.selected,
      restored: result.restored,
      sources: result.sources,
      sha256: result.sha256,
      file: result.file,
      plaintextBytes: result.plaintextBytes,
      encryptedBytes: result.encryptedBytes,
    }),
  );
}

try {
  await main();
} finally {
  await closePools();
}
