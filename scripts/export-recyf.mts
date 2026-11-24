/**
 * Publie l'indice ReCyF-2.5 par collectivité et exporte un CSV daté.
 *
 *   npx tsx scripts/export-recyf.mts                # calcule, publie, exporte
 *   npx tsx scripts/export-recyf.mts --check        # vérifie le critère et le CSV
 *
 * Le CSV contient le score ET sa formule ; aucune donnée personnelle n'est
 * écrite (identifiant et nom d'organisation publique uniquement).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
  CRITERE_SQL,
  ENTETE_CSV_RECYF,
  FORMULE,
  METHODE_SHA256,
  REFERENTIEL,
  csvReCyF,
  nomFichierCsvReCyF,
  publierScoresReCyF,
} from "../apps/api/src/analyse/recyf.js";

const RESULTATS = fileURLToPath(new URL("../bench/results/", import.meta.url));
const CHECK = process.argv.includes("--check");
const COMPTE_COLLECTIVITES_SQL = `
  SELECT count(DISTINCT o.id)::text AS n
    FROM org o JOIN event e ON e.org_id = o.id
   WHERE o.kind = 'collectivite'
`;

function dernierCsv(): string | null {
  const fichiers = readdirSync(RESULTATS)
    .filter((nom) => /^export-recyf-\d{4}-\d{2}-\d{2}\.csv$/.test(nom))
    .sort();
  return fichiers.length === 0 ? null : join(RESULTATS, fichiers[fichiers.length - 1]);
}

async function main(): Promise<void> {
  const lot = new Date();
  let chemin: string;

  if (CHECK) {
    chemin = dernierCsv() ?? "";
    if (!chemin || !existsSync(chemin)) throw new Error("aucun CSV ReCyF daté trouvé dans bench/results");
  } else {
    const publication = await publierScoresReCyF(query, lot);
    mkdirSync(dirname(RESULTATS), { recursive: true });
    chemin = join(RESULTATS, nomFichierCsvReCyF(lot));
    writeFileSync(chemin, csvReCyF(publication.lignes, lot), "utf8");
    console.log(`COLLECTIVITES_SCOREEES: ${publication.collectivites}`);
  }

  const contenu = readFileSync(chemin, "utf8");
  const lignes = contenu.trimEnd().split("\n");
  const attendu = await query<{ n: string }>(COMPTE_COLLECTIVITES_SQL);
  const nombreAttendu = Number(attendu.rows[0]?.n ?? 0);
  const critere = await query<{ count: string }>(CRITERE_SQL);
  const incomplets = Number(critere.rows[0]?.count ?? -1);
  const coherence = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM org_score WHERE referentiel = $1 AND (methode_sha256 <> $2 OR formule <> $3)",
    [REFERENTIEL, METHODE_SHA256, FORMULE],
  );
  const coherenceOk = Number(coherence.rows[0]?.n ?? -1) === 0;

  const enteteOk = lignes[0] === ENTETE_CSV_RECYF.join(",");
  const lignesOk = lignes.length - 1 === nombreAttendu;
  const empreinteOk = contenu.includes(METHODE_SHA256) && contenu.includes(FORMULE);
  const scoreOk = lignes.slice(1).every((ligne) => /\bscore\b/.test(lignes[0] ?? "") && /,0?\.\d+|,1\.000000/.test(ligne));

  console.log(`CSV: ${chemin}`);
  console.log(`CSV_LIGNES: ${lignes.length - 1} / ${nombreAttendu}`);
  console.log(`CSV_ENTETE_FORMULE_EMPREINTE: ${enteteOk && empreinteOk && scoreOk}`);
  console.log(`CRITERE_SQL: ${CRITERE_SQL}`);
  console.log(`CRITERE_BRUT: count = ${incomplets}`);
  console.log(`REFERENTIEL: ${REFERENTIEL}`);
  console.log(`METHODE_COHERENTE: ${coherenceOk}`);

  if (!enteteOk || !lignesOk || !empreinteOk || !scoreOk || !coherenceOk || incomplets !== 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await closePools();
}
