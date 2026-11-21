#!/usr/bin/env -S npx tsx
/**
 * Passe de revue rejouable sur la file des candidats presse.
 *
 * Ce n'est PAS une décision humaine : l'auteur est explicitement un agent et
 * la règle (signal d'incident sans signal de prévention) est écrite ci-dessous.
 * Elle sert à mesurer une passe complète sur les 56 candidats et à fournir un
 * taux de confirmation observé, reproductible. L'écran web, lui, enregistre
 * les décisions humaines avec `humain:<email>`.
 *
 * Usage : npx tsx scripts/passe-revue-presse.mts [--passe ID] [--auteur ID] [--dry-run] [--out fichier.json]
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { enregistrerDecisionPresse, type LigneFile } from "../apps/api/src/corpus/decision-presse.js";

const args = process.argv.slice(2);
function option(nom: string, defaut: string): string {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
}
const passe = option("--passe", `passe-${new Date().toISOString().slice(0, 10)}`);
const auteur = option("--auteur", "agent:regle-signaux@1");
const sec = args.includes("--dry-run");
const sortie = option("--out", "");

const enAttente = await query<LigneFile>(
  `SELECT * FROM presse_candidat WHERE etat = 'en_attente'
    ORDER BY score_confiance DESC, date_publication DESC NULLS LAST, cle`,
);

let traites = 0;
for (const ligne of enAttente.rows) {
  const signaux: string[] = Array.isArray(ligne.signaux) ? ligne.signaux as string[] : [];
  const incidents = signaux.filter((s) => s.startsWith("incident-")).length;
  const prevention = signaux.filter((s) => s.startsWith("contexte:")).length;
  const confirmer = incidents > 0 && prevention === 0;
  const raison = `${passe} — signaux: ${signaux.join(", ") || "aucun"}`;
  if (!sec) {
    await enregistrerDecisionPresse({
      cle: ligne.cle,
      decision: confirmer ? "confirmer" : "refuser",
      raison,
      auteur,
      passe,
    });
  }
  traites += 1;
}

const comptes = await query<{ decision: string; total: string }>(
  `SELECT decision, count(*)::text AS total FROM presse_candidat_decision
    WHERE passe = $1 GROUP BY decision`, [passe],
);
const parDecision: Record<string, number> = { confirmer: 0, refuser: 0, reclasser: 0 };
for (const row of comptes.rows) parDecision[row.decision] = Number(row.total);
const total = parDecision.confirmer + parDecision.refuser + parDecision.reclasser;

const mesure = {
  passe,
  auteur,
  regle: "confirmer si au moins un signal d'incident et aucun signal de prévention, sinon refuser",
  dryRun: sec,
  candidatsEnFile: enAttente.rows.length,
  traitesDansPasse: traites,
  decisionsEnregistrees: total,
  confirme: parDecision.confirmer,
  refuse: parDecision.refuser,
  reclasses: parDecision.reclasser,
  tauxConfirmation: total === 0 ? null : Math.round((parDecision.confirmer / total) * 1000) / 10,
};
console.log(JSON.stringify(mesure, null, 2));
if (sortie) writeFileSync(sortie, `${JSON.stringify(mesure, null, 2)}\n`);
await closePools();
