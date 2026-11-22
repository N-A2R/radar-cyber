/**
 * Vérifie l'objectif chiffré de la frise d'exposition (`fuite_timeline`).
 *
 *   pnpm verifie:fuite-timeline
 *
 * Crée une base de test isolée depuis `db/init.sql` + `db/migrate-*.sql`,
 * y applique `db/fixtures/fuite-timeline.sql` (trois fuites publiques
 * simulées, 24 organisations régionales), puis exécute le critère de sortie.
 *
 * La forme littérale du critère — `first_seen <> last_seen >= 20` — n'est pas
 * du SQL valide en PostgreSQL : deux opérateurs de comparaison ne s'enchaînent
 * pas. Le script imprime l'erreur brute, puis exécute la lecture correcte :
 * `SELECT count(*) ... WHERE first_seen <> last_seen`, à comparer au seuil 20.
 *
 * Aucune donnée de production n'est lue ni écrite ; la base est détruite.
 */
import { readFile } from "node:fs/promises";
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";

const FIXTURE = new URL("../db/fixtures/fuite-timeline.sql", import.meta.url);
const SEUIL = 20;

function titre(texte: string): void {
  console.log(`\n== ${texte} ==`);
}

const db = await createTestDatabase();
process.env.DATABASE_URL = db.url;
const { query, closePools } = await import("../apps/api/src/db.js");

let code = 1;
try {
  await query(await readFile(FIXTURE, "utf8"));

  titre("Jeu de test");
  const refs = await query<{ id: string; breach_date: string; orgs: string }>(
    `SELECT fr.id, fr.breach_date::text AS breach_date, count(fo.org_id)::text AS orgs
     FROM fuite_reference fr
     LEFT JOIN fuite_org fo ON fo.fuite_id = fr.id
     WHERE fr.source = 'fuite-publique-fixture'
     GROUP BY fr.id, fr.breach_date
     ORDER BY fr.breach_date`,
  );
  for (const r of refs.rows) {
    console.log(`${r.id}  ${r.breach_date}  orgs=${r.orgs}`);
  }
  console.log(`fuites publiques simulées : ${refs.rows.length}`);

  titre("Critère brut, forme littérale");
  const litteral = "SELECT count(*) FROM fuite_timeline WHERE first_seen <> last_seen >= 20";
  console.log(`SQL> ${litteral}`);
  try {
    const { rows } = await query<{ count: string }>(litteral);
    console.log(`count = ${rows[0]?.count}`);
  } catch (error) {
    console.log(`ERREUR: ${error instanceof Error ? error.message : String(error)}`);
  }

  titre("Critère corrigé (seuil appliqué au compte)");
  const corrige = "SELECT count(*) FROM fuite_timeline WHERE first_seen <> last_seen";
  console.log(`SQL> ${corrige}`);
  const { rows } = await query<{ count: string }>(corrige);
  const n = Number(rows[0]?.count ?? 0);
  console.log(` count\n-------\n${String(n).padStart(5)}\n(1 row)`);

  titre("Détail par source");
  const parSource = await query<{ source: string; couples: number; resurgences: number }>(
    `SELECT source,
            count(*)::int AS couples,
            count(*) FILTER (WHERE resurgences > 0)::int AS resurgences
     FROM fuite_timeline
     GROUP BY source
     ORDER BY source`,
  );
  for (const r of parSource.rows) {
    console.log(`${r.source}  couples=${r.couples}  avec_resurgence=${r.resurgences}`);
  }

  titre("Exemples (3 lignes)");
  const exemples = await query<{
    org_id: number;
    dept: string;
    source: string;
    first_seen: string;
    last_seen: string;
    episodes: number;
    resurgences: number;
  }>(
    `SELECT org_id, dept, source, first_seen::text, last_seen::text, episodes, resurgences
     FROM fuite_timeline
     WHERE first_seen <> last_seen
     ORDER BY org_id
     LIMIT 3`,
  );
  for (const r of exemples.rows) {
    console.log(
      `org_id=${r.org_id} dept=${r.dept} source=${r.source} first_seen=${r.first_seen} ` +
        `last_seen=${r.last_seen} episodes=${r.episodes} resurgences=${r.resurgences}`,
    );
  }

  titre("Objectif");
  if (n >= SEUIL) {
    console.log(`OBJECTIF : atteint — ${n} / ${SEUIL}`);
    code = 0;
  } else {
    console.log(`OBJECTIF : partiel — ${n} / ${SEUIL}`);
  }
} finally {
  await closePools().catch(() => {});
  await dropTestDatabase(db);
}
process.exit(code);
