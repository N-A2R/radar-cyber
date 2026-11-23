#!/usr/bin/env -S npx tsx
/**
 * Vérifie le critère de sortie du chantier « alias d'acteurs et de programmes
 * rançongiciel ».
 *
 * La base est créée de zéro depuis `db/init.sql` + toutes les migrations, puis
 * détruite. Aucune base existante n'est touchée.
 *
 * Usage : tsx scripts/verifie-actor-alias.mts
 */
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";

const CRITERE = `
SELECT count(*)::int AS canoniques_avec_au_moins_deux_alias
  FROM (
    SELECT canonique FROM actor_alias GROUP BY canonique HAVING count(*) >= 2
  ) AS groupes`;

const SANS_SOURCE = `
SELECT count(*)::int AS lignes_sans_source
  FROM actor_alias
 WHERE source IS NULL OR btrim(source) = ''
    OR source_url IS NULL OR btrim(source_url) = ''`;

const LOCKBIT = `
SELECT canonique, count(DISTINCT alias)::int AS graphies, array_agg(DISTINCT alias ORDER BY alias) AS alias
  FROM actor_alias
 WHERE alias_norm = 'lockbit'
 GROUP BY canonique`;

const db = await createTestDatabase();
// `db.ts` lit DATABASE_URL à l'import : on pointe la base de test avant de le
// charger. Cela résout aussi `pg` depuis apps/api, où pnpm l'installe.
process.env.DATABASE_URL = db.url;
const { query, closePools } = await import("../apps/api/src/db.js");
let exitCode = 0;
try {
	const critere = await query<{ canoniques_avec_au_moins_deux_alias: number }>(CRITERE);
	const sansSource = await query<{ lignes_sans_source: number }>(SANS_SOURCE);
	const lockbit = await query<{ canonique: string; graphies: number; alias: string[] }>(LOCKBIT);

	console.log("=== Critère : table actor_alias issue de MISP Galaxy ===");
	console.log(CRITERE.trim());
	console.log(JSON.stringify(critere.rows[0]));

	console.log("\n=== Aucune fusion sans source ===");
	console.log(SANS_SOURCE.trim());
	console.log(JSON.stringify(sansSource.rows[0]));

	console.log("\n=== LockBit, Lockbit3 et .LockBit ===");
	console.log(LOCKBIT.trim());
	for (const row of lockbit.rows) console.log(JSON.stringify(row));

	const count = critere.rows[0]?.canoniques_avec_au_moins_deux_alias ?? 0;
	const unsourced = sansSource.rows[0]?.lignes_sans_source ?? -1;
	if (count < 20) {
		console.error(`\nÉCHEC : ${count} canoniques avec >= 2 alias, attendu >= 20.`);
		exitCode = 1;
	}
	if (unsourced !== 0) {
		console.error(`\nÉCHEC : ${unsourced} lignes sans source.`);
		exitCode = 1;
	}
	if (lockbit.rows.length !== 1 || lockbit.rows[0]!.canonique !== "LockBit") {
		console.error("\nÉCHEC : les graphies LockBit ne partagent pas un canonique unique.");
		exitCode = 1;
	}
	console.log(`\nOBJECTIF : ${count} canoniques avec >= 2 alias / cible >= 20`);
} finally {
	await closePools().catch(() => {});
	await dropTestDatabase(db);
}
process.exit(exitCode);
