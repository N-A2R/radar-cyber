#!/usr/bin/env -S npx tsx
/**
 * Vérifie le recensement REC sans écrire : critère brut du juge, compteurs et
 * liste des opérateurs avec autorité à prévenir sous 24 heures.
 *
 *   pnpm verifie:rec
 */
import { closePools, query } from "../apps/api/src/db.js";
import {
  CRITERE_ORG_REC,
  compteursRec,
  listOperateursCritiques,
} from "../apps/api/src/rec/operateurs-critiques.js";

try {
  const critere = await query<{ count: string }>(CRITERE_ORG_REC);
  const valeur = Number(critere.rows[0]?.count ?? "-1");
  const compteurs = await compteursRec();
  const operateurs = await listOperateursCritiques();

  console.log(`CRITÈRE : ${CRITERE_ORG_REC}`);
  console.log(`RÉSULTAT : ${valeur}`);
  console.log(
    `Compteurs : ${compteurs.operateurs} opérateurs, ${compteurs.sansRec} sans fiche, ` +
      `${compteurs.sansSecteur} sans secteur, ${compteurs.fichesIncompletes} fiches incomplètes, ` +
      `${compteurs.sourcesNonDatees} sources nationales mal étiquetées.`,
  );
  for (const o of operateurs) {
    console.log(
      `- [${o.dept}] ${o.name} | ${o.secteurRec} | ${o.autoriteCompetente} | ` +
        `${o.notificationHeures} h | ${o.sourceDate} | ${o.sourcePortee} | ${o.sourceUrl}`,
    );
  }
  if (
    valeur !== 0 ||
    compteurs.sansRec !== 0 ||
    compteurs.sansSecteur !== 0 ||
    compteurs.fichesIncompletes !== 0 ||
    compteurs.sourcesNonDatees !== 0
  ) {
    process.exitCode = 1;
  }
} finally {
  await closePools();
}
