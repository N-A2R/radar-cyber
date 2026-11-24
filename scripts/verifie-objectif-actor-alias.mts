/**
 * Mesure reproductible de l'objectif « alias d'acteurs MISP Galaxy » et
 * vérification de sa déclaration dans le rapport.
 *
 *   pnpm verifie:objectif-actor-alias
 *
 * Base jetable recréée depuis db/init.sql + toutes les migrations, puis
 * détruite. Aucune donnée personnelle, aucun réseau, aucun service payant.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";

const RAPPORT = fileURLToPath(new URL("../docs/actor-alias-misp-galaxy.md", import.meta.url));
const CRITERE = `
SELECT count(*)::int AS canoniques_avec_au_moins_deux_alias
  FROM (
    SELECT canonique FROM actor_alias GROUP BY canonique HAVING count(*) >= 2
  ) AS groupes`;

const db = await createTestDatabase();
process.env.DATABASE_URL = db.url;
try {
	const { query, closePools } = await import("../apps/api/src/db.js");
	const {
		mesurerObjectifActorAlias,
		verifierDeclarationObjectifActorAlias,
	} = await import("../apps/api/src/ransomware/actor-alias.js");

	const { rows } = await query<{ canoniques_avec_au_moins_deux_alias: number }>(CRITERE);
	const objectif = mesurerObjectifActorAlias(rows[0]?.canoniques_avec_au_moins_deux_alias ?? 0);
	const declaree = verifierDeclarationObjectifActorAlias(readFileSync(RAPPORT, "utf8"), objectif.ligne);

	console.log(CRITERE.trim());
	console.log(JSON.stringify(rows[0]));
	console.log(objectif.ligne);
	console.log(`report declaration : ${declaree ? "ok" : "missing"}`);
	if (!objectif.atteint || !declaree) process.exitCode = 1;
	await closePools();
} finally {
	await dropTestDatabase(db);
}
