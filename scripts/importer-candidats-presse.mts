#!/usr/bin/env -S npx tsx
/**
 * Charge le corpus presse dans la file de revue (idempotent).
 * Usage : npx tsx scripts/importer-candidats-presse.mts [fichier.jsonl]
 */
import { readFileSync } from "node:fs";
import { importerCandidats } from "../apps/api/src/corpus/importer-presse.js";
import { closePools } from "../apps/api/src/db.js";

const fichier = process.argv[2] ?? "bench/corpus/articles-presse-na.jsonl";
const articles = readFileSync(fichier, "utf8")
  .split(/\r?\n/)
  .filter((ligne) => ligne.trim().length > 0)
  .map((ligne) => JSON.parse(ligne));

const resultat = await importerCandidats(articles);
console.log(JSON.stringify({ fichier, articles: articles.length, ...resultat }));
await closePools();
