#!/usr/bin/env -S npx tsx
/**
 * Découverte d'actifs (DNS + certificats) et rapport de confiance des sources.
 *
 * Usage :
 *   pnpm exec tsx scripts/discover-assets.mts [--apply] [--limit=N] [--org=slug] [--report=fichier]
 *
 *   --apply            écrit les actifs découverts dans `asset` (défaut : dry-run) ;
 *   --limit=N          limite le nombre d'orgs traitées ;
 *   --org=slug         ne traite qu'une org ;
 *   --report=fichier   écrit le rapport de confiance en Markdown.
 *
 * Cadence : une requête par seconde et par source externe (DoH, crt.sh).
 * Sans --apply, aucune écriture en base.
 */
import { writeFile } from "node:fs/promises";
import { closePools, query } from "../apps/api/src/db.js";
import { discoverAssets } from "../apps/api/src/assets/discover.js";
import { renderSourceReport, sourceHealth } from "../apps/api/src/assets/report.js";

const log = (msg: string): void => console.log(`[assets] ${msg}`);

function usage(): never {
  console.error(
    "usage : pnpm exec tsx scripts/discover-assets.mts [--apply] [--limit=N] [--org=slug] [--report=fichier]",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) usage();

const apply = args.includes("--apply");

let limit: number | undefined;
const limitArg = args.find((a) => a.startsWith("--limit="));
if (limitArg) {
  const raw = limitArg.slice("--limit=".length);
  limit = Number(raw);
  if (!Number.isInteger(limit) || limit <= 0) {
    console.error(`--limit invalide : « ${raw} » (entier positif attendu)`);
    process.exit(1);
  }
}

let slug: string | undefined;
const orgArg = args.find((a) => a.startsWith("--org="));
if (orgArg) slug = orgArg.slice("--org=".length).trim() || undefined;

let reportPath: string | undefined;
const reportArg = args.find((a) => a.startsWith("--report="));
if (reportArg) reportPath = reportArg.slice("--report=".length).trim() || undefined;

async function countAssets(): Promise<number> {
  const res = await query<{ n: number }>("SELECT count(*)::int AS n FROM asset");
  return Number(res.rows[0]?.n ?? 0);
}

try {
  const before = await countAssets();
  log(
    `découverte${apply ? "" : " (dry-run, aucune écriture)"}` +
      `${limit !== undefined ? ` — limite ${limit}` : ""}${slug ? ` — org ${slug}` : ""}`,
  );

  const summary = await discoverAssets({ limit, slug, apply, log });
  const after = await countAssets();

  log(`orgs traitées : ${summary.orgs}`);
  log(
    `candidats : ${summary.candidates} · nouveaux : ${summary.inserted} · déjà connus : ${summary.alreadyKnown}`,
  );
  log(`assets en base : ${before} → ${after} (+${after - before})`);
  for (const [source, stat] of Object.entries(summary.bySource)) {
    const taux = stat.calls > 0 ? `, ${Math.round((stat.errors / stat.calls) * 100)} % d'erreur` : "";
    log(`source ${source} : ${stat.calls} requête(s)${taux}, ${stat.items} élément(s)`);
  }
  if (!apply) log("aucune écriture en base (ajouter --apply pour appliquer)");

  const report = renderSourceReport(await sourceHealth());
  if (reportPath) {
    await writeFile(reportPath, report.endsWith("\n") ? report : `${report}\n`);
    log(`rapport de confiance écrit : ${reportPath}`);
  } else {
    console.log(report);
  }
} finally {
  await closePools();
}
