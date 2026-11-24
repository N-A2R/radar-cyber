/**
 * Vérification reproductible de l'objectif « qualification ANSSI prouvée ».
 * Base jetable depuis db/init.sql + migrations : aucun réseau, aucune donnée réelle.
 *
 *   pnpm verifie:prestataires-qualifies
 *
 * Imprime le critère du juge externe tel quel, sa sortie brute, puis le nombre
 * de fiches du dossier Nouvelle-Aquitaine et les métadonnées de l'extrait daté.
 */
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";

const CRITERE =
  "SELECT count(*) FROM prestataire_qualifie WHERE reference_anssi IS NULL OR qualifie_le IS NULL OR validite_fin IS NULL OR (validite_fin<current_date AND active);";

let db: Awaited<ReturnType<typeof createTestDatabase>> | null = null;
try {
  db = await createTestDatabase();
  process.env.DATABASE_URL = db.url;
  const { query, closePools } = await import("../apps/api/src/db.js");

  const critique = await query<{ count: string }>(CRITERE);
  const invalides = Number(critique.rows[0]?.count ?? -1);
  console.log(`${CRITERE}`);
  console.log(`${invalides}`);

  const recensement = await query<{ n: string; extrait_le: string; sha256: string }>(`
    SELECT count(*)::text AS n,
           min(e.extrait_le::text) AS extrait_le,
           min(e.sha256_fichier) AS sha256
      FROM prestataire_qualifie p
      JOIN anssi_extrait e ON e.id = p.extrait_id
     WHERE p.region = 'Nouvelle-Aquitaine'
  `);
  const total = Number(recensement.rows[0]?.n ?? 0);
  console.log(`fiches Nouvelle-Aquitaine : ${total}`);
  console.log(`extrait daté : ${recensement.rows[0]?.extrait_le} — SHA-256 ${recensement.rows[0]?.sha256}`);

  const reussi = invalides === 0 && total === 20;
  console.log(
    `OBJECTIF : ${reussi ? "atteint" : "partiel"} — ${invalides} / 0 fiche invalide ; ${total} / 20 prestataires recensés`,
  );
  if (!reussi) process.exitCode = 1;
  await closePools();
} finally {
  if (db) await dropTestDatabase(db);
}
