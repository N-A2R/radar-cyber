#!/usr/bin/env -S npx tsx
/**
 * Seal one evidence-backed decision per raw typosquat alarm.
 * Reads the committed scan batches and a grey-source host snapshot, so the
 * 853/853 measurement replays offline without touching the database.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { confirmerAlertes, type AlerteConfirmation } from "../apps/api/src/detect/typosquat-confirmations.js";

const DEFAULT_DIR = "bench/results/typosquat-top1000";
const DEFAULT_FEED = "bench/corpus/openphish-hosts-2026-11-24.txt";
const DEFAULT_JSON = "bench/results/typosquat-confirmations.json";

function usage(): never {
  console.log(`Usage: tsx scripts/typosquat-confirmations.mts [--dir=${DEFAULT_DIR}] [--feed=${DEFAULT_FEED}] [--json=${DEFAULT_JSON}]`);
  process.exit(0);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) usage();

function option(name: string, fallback: string): string {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? (found.slice(name.length + 3) || fallback) : fallback;
}

const dir = option("dir", DEFAULT_DIR);
const feedFile = option("feed", DEFAULT_FEED);
const jsonFile = option("json", DEFAULT_JSON);

const files = (await readdir(dir)).filter((f) => /^batch-\d{4}\.json$/.test(f)).sort();
if (files.length === 0) throw new Error(`no scan batches in ${dir}`);

const alertes: AlerteConfirmation[] = [];
for (const file of files) {
  const batch = JSON.parse(await readFile(`${dir}/${file}`, "utf8")) as { activeList?: AlerteConfirmation[] };
  for (const entry of batch.activeList ?? []) {
    if (entry.similarity >= 0.8) alertes.push(entry);
  }
}

const flux = (await readFile(feedFile, "utf8"))
  .split(/\r?\n/)
  .map((line) => line.trim().toLowerCase().replace(/^www\./, ""))
  .filter(Boolean);
const resultat = confirmerAlertes(alertes, new Set(flux));

const payload = {
  date: "2026-11-24",
  lots: files,
  flux: { source: "OpenPhish (instantané public)", fichier: feedFile, hotes: flux.length },
  ...resultat,
};
await writeFile(jsonFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  `${resultat.confirmes}/${resultat.candidats} candidats confirmés avec preuve — ` +
  `${resultat.usurpations} usurpation(s), ${resultat.benignes} classement(s) négatif(s) — ${jsonFile}`,
);
