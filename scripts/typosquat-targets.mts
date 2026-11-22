#!/usr/bin/env -S npx tsx
/**
 * Snapshot the top Nouvelle-Aquitaine organisations from the live referential.
 * The scan itself reads this snapshot, so a long-running migration cannot
 * interrupt a measurement batch.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import { loadTopTargets, TOP_TARGETS_SQL } from "../apps/api/src/detect/typosquat-top.js";

const path = process.argv[2] ?? "bench/results/typosquat-targets-na.json";
const top = Number(process.argv[3] ?? 1000);
if (!Number.isInteger(top) || top < 1) throw new Error("top must be a positive integer");

try {
  const targets = await loadTopTargets({ limit: top, offset: 0 });
  if (targets.length === 0) throw new Error("no Nouvelle-Aquitaine targets found");
  const payload = {
    date: new Date().toISOString().slice(0, 10),
    source: "postgres://radar:radar@localhost:5433/radar",
    query: TOP_TARGETS_SQL.trim(),
    scope: "Nouvelle-Aquitaine (depts 16,17,18,23,24,33,40,47,64,79,86,87)",
    count: targets.length,
    targets,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[targets] ${targets.length} organisations written to ${path}`);
} finally {
  await closePools();
}
