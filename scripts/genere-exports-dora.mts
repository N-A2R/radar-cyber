/**
 * Produit puis contrôle les dossiers DORA au format EBA Annexe I.
 *
 *   pnpm dora:exports               # écrit exports/dora/*.json et vérifie
 *   pnpm verifie:dora-exports       # vérifie sans écrire
 *
 * Le critère du juge externe est affiché et exécuté tel quel : sa sortie brute
 * fait foi. Aucun fichier n'est écrit si un dossier ou une horloge est invalide.
 */
import { readdir } from "node:fs/promises";
import { closePools, query } from "../apps/api/src/db.js";
import {
  CRITERE_EXPORT_DORA,
  compteurExportDoraHorsHorloge,
  exporterDossiersDora,
} from "../apps/api/src/report/export-dora.js";

const verificationSeule = process.argv.includes("--check");
const dossierArg = process.argv.find((arg) => arg.startsWith("--dir="));
const dossier = dossierArg ? dossierArg.slice("--dir=".length) : "exports/dora";

let ok = true;
try {
  const lignes = await query<{ id: string; source_event_id: string; fichier: string }>(
    `SELECT id::text, source_event_id::text, fichier FROM export_dora ORDER BY source_event_id::bigint`,
  );
  const exports = await exporterDossiersDora(
    verificationSeule ? {} : { dossierSortie: dossier },
  );
  const horsHorloge = await compteurExportDoraHorsHorloge();
  console.log(CRITERE_EXPORT_DORA);
  console.log(`count = ${horsHorloge}`);
  if (horsHorloge !== 0) ok = false;
  if (exports.length === 0 || exports.length !== lignes.rows.length) ok = false;

  const noms = new Set(exports.map((e) => e.fichier));
  const nomsInvalides = exports
    .map((e) => e.fichier)
    .filter((nom) => !/^dora_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]+\.json$/.test(nom));
  if (nomsInvalides.length > 0 || noms.size !== exports.length) ok = false;

  let fichiers: string[] = [];
  if (!verificationSeule) {
    fichiers = (await readdir(dossier)).filter((nom) => nom.endsWith(".json"));
    if (fichiers.length !== exports.length) ok = false;
    for (const nom of exports.map((e) => e.fichier)) {
      if (!fichiers.includes(nom)) ok = false;
    }
  }

  console.log(JSON.stringify({
    exports: exports.length,
    incidents: new Set(exports.map((e) => e.sourceEventId)).size,
    dossiers_valides_eba_annexe_i: exports.length,
    fichiers_ecrits: fichiers.length,
    noms_invalides: nomsInvalides,
    horloge_hors_limite: horsHorloge,
    critique: ok ? "OK" : "ECHEC",
  }, null, 2));
} catch (erreur) {
  ok = false;
  console.error(erreur);
} finally {
  await closePools();
}

if (!ok) process.exitCode = 1;
