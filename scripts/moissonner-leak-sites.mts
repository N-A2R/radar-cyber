#!/usr/bin/env -S npx tsx
/**
 * Moissonne les sites de revendication rançongiciel et écrit les victimes NA.
 *
 *   tsx scripts/moissonner-leak-sites.mts                      # 60 sites, 2 dernières années
 *   tsx scripts/moissonner-leak-sites.mts --max-sites=80 --years=2024,2025,2026
 *   tsx scripts/moissonner-leak-sites.mts --no-write            # mesure sans écrire en base
 *
 * dans une autre base. Le rapport JSON est déposé dans `bench/results/`.
 * dans une autrebase. Le rapport JSON est déposé dans `bench/results/`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL = "postgres://radar:radar@localhost:5433/radar";

const { harvest, enregistrer } = await import("../apps/api/src/collectors/leak-sites.js");
const { closePools } = await import("../apps/api/src/db.js");

type Options = { maxSites: number; years: number[]; rapport: string; write: boolean };

function optionsDepuisArgv(argv: string[]): Options {
  const option = (nom: string): string | undefined => argv.find((a) => a.startsWith(`--${nom}=`))?.split("=")[1];
  const years = option("years")?.split(",").map(Number).filter((y) => Number.isInteger(y) && y > 2000);
  return {
    maxSites: Number(option("max-sites") ?? 60),
    years: years && years.length > 0 ? years : [],
    rapport: option("rapport") ?? fileURLToPath(new URL("../bench/results/leak-sites.json", import.meta.url)),
    write: !argv.includes("--no-write"),
  };
}

const opts = optionsDepuisArgv(process.argv.slice(2));
const rapport = await harvest({
  maxSites: opts.maxSites,
  ...(opts.years.length > 0 ? { years: opts.years } : {}),
});
mkdirSync(dirname(opts.rapport), { recursive: true });
writeFileSync(opts.rapport, `${JSON.stringify(rapport, null, 2)}\n`);

const ecrit = opts.write ? await enregistrer(rapport) : { sites: 0, claims: 0 };
const stats = rapport.stats;
console.log(`sites moissonnés avec succès : ${stats.sitesHarvested} (bloqués : ${stats.sitesBlocked})`);
console.log(`revendications collectées : ${stats.claims} (par source : ${JSON.stringify(stats.bySource)})`);
console.log(`revendications NA : ${stats.claimsNa} ; rattachées au référentiel : ${stats.claimsAttached}`);
console.log(`rapport : ${opts.rapport}`);
if (opts.write) console.log(`écriture base 5433 : ${ecrit.sites} sites, ${ecrit.claims} revendications`);
for (const site of rapport.sites.filter((s) => !s.ok)) {
  console.log(`site bloqué ${site.slug} : HTTP ${site.httpStatus} — ${site.error ?? "inconnu"}`);
}
await closePools();
