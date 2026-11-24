/**
 * Produit puis contrôle les rapports NIS2 datés d'un même incident.
 *
 *   pnpm nis2:rapports                 # écrit exports/nis2/*.md et vérifie
 *   pnpm verifie:nis2-rapports         # vérifie sans écrire
 *
 * Le critère du juge externe est affiché et exécuté tel quel : sa sortie brute
 * fait foi. Aucun fichier n'est écrit si un brouillon est incomplet.
 */
import { closePools, query } from "../apps/api/src/db.js";
import {
  CRITERE_BROUILLONS_NIS2,
  compteurBrouillonsIncomplets,
  exporterRapportsNis2,
  NIS2_SECTIONS,
} from "../apps/api/src/report/nis2-rapports.js";

const verificationSeule = process.argv.includes("--check");
const dossierArg = process.argv.find((arg) => arg.startsWith("--dir="));
const dossier = dossierArg ? dossierArg.slice("--dir=".length) : "exports/nis2";

let ok = true;
try {
  const incomplets = await compteurBrouillonsIncomplets();
  console.log(CRITERE_BROUILLONS_NIS2);
  console.log(`count = ${incomplets}`);
  if (incomplets !== 0) ok = false;

  if (!verificationSeule && incomplets === 0) {
    const exports = await exporterRapportsNis2({ dossierSortie: dossier });
    console.log(`exports écrits : ${exports.length} dans ${dossier}/`);
  }

  const lignes = await query<{
    source_event_id: string;
    regime: string;
    exporte_le: Date;
    sections: Record<string, unknown>;
    contenu: string;
  }>(
    `SELECT source_event_id::text, regime, exporte_le, sections, contenu
       FROM rapport_nis2_export
      ORDER BY exporte_le DESC, source_event_id::text, regime`,
  );
  const parIncident = new Map<string, Set<string>>();
  const sectionsManquantes: string[] = [];
  for (const ligne of lignes.rows) {
    const titre = `${ligne.source_event_id}/${ligne.regime}`;
    if (!parIncident.has(ligne.source_event_id)) parIncident.set(ligne.source_event_id, new Set());
    parIncident.get(ligne.source_event_id)!.add(ligne.regime);
    for (const cle of NIS2_SECTIONS) {
      if (typeof ligne.sections?.[cle] !== "string" || ligne.sections[cle].trim().length === 0) {
        sectionsManquantes.push(`${titre}:${cle}`);
      }
    }
    if (!/^# Rapport NIS2 /.test(ligne.contenu) || !ligne.contenu.includes("## 1.") ||
        !ligne.contenu.includes("## 2.") || !ligne.contenu.includes("## 3.")) {
      sectionsManquantes.push(`${titre}:contenu`);
    }
  }
  const incidentsComplets = [...parIncident.values()].filter(
    (regimes) => regimes.has("NIS2_72h") && regimes.has("NIS2_1mois"),
  ).length;

  if (lignes.rows.length === 0 || incidentsComplets === 0 || sectionsManquantes.length > 0) ok = false;
  console.log(JSON.stringify({
    exports: lignes.rows.length,
    incidents_avec_deux_rapports: incidentsComplets,
    sections_manquantes: sectionsManquantes,
    dates: lignes.rows.map((l) => new Date(l.exporte_le).toISOString()),
    critique: ok ? "OK" : "ECHEC",
  }, null, 2));
} finally {
  await closePools();
}

if (!ok) process.exitCode = 1;
