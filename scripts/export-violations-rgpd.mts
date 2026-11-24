#!/usr/bin/env -S npx tsx
/**
 * Écrit l'export mensuel du registre des violations sur disque, avec son
 * empreinte SHA-256 dans un fichier `.sha256` au format `sha256sum`.
 *
 *   pnpm export:violations-rgpd --mois=2026-11
 *   pnpm export:violations-rgpd --mois=2026-11 --out=/tmp/exports
 *   pnpm export:violations-rgpd --mois=2026-11 --out=/tmp/exports --check
 *
 * `--check` ne réécrit rien : il compare le fichier présent, son empreinte et
 * le nombre de lignes avec l'export recomputé depuis la base.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { construireExport, empreinteFichier, moisCourant, verifierMois } from "../apps/api/src/export/violations-rgpd.js";
import { closePools } from "../apps/api/src/db.js";

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const moisArg = args.find((a) => a.startsWith("--mois="));
const outArg = args.find((a) => a.startsWith("--out="));
const mois = verifierMois(moisArg ? moisArg.slice("--mois=".length) : moisCourant());
const dossier = outArg ? outArg.slice("--out=".length)
  : fileURLToPath(new URL("../exports/violations/", import.meta.url));

try {
  const exportMois = await construireExport(mois);
  const chemin = join(dossier, exportMois.fichier);
  const cheminEmpreinte = `${chemin}.sha256`;
  console.log(`fichier = ${chemin}`);
  console.log(`mois = ${exportMois.mois}`);
  console.log(`lignes = ${exportMois.lignes}`);
  console.log(`sha256 = ${exportMois.sha256}`);

  if (CHECK) {
    const contenu = readFileSync(chemin, "utf8");
    const empreinteLue = readFileSync(cheminEmpreinte, "utf8").trim().split(/\s+/)[0];
    const lignesFichier = contenu.split("\r\n").length - 2; // en-tête + CRLF final
    const ok = contenu === exportMois.corps
      && empreinteLue === exportMois.sha256
      && empreinteFichier(contenu) === exportMois.sha256
      && lignesFichier === exportMois.lignes;
    if (ok) {
      console.log("OK : fichier, nombre de lignes et empreinte SHA-256 conformes.");
    } else {
      console.error("ÉCHEC : le fichier sur disque ne correspond pas à l'export de la base.");
      process.exitCode = 1;
    }
  } else {
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, exportMois.corps, "utf8");
    writeFileSync(cheminEmpreinte, `${exportMois.sha256}  ${exportMois.fichier}\n`, "utf8");
    console.log(`écrit = ${cheminEmpreinte}`);
  }
} finally {
  await closePools();
}
