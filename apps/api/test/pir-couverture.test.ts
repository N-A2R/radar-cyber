/**
 * Couverture des priorités de renseignement : snapshot figé, critère du juge
 * exécuté mot pour mot et preuve que la mesure vient bien de la requête stockée.
 * Aucune donnée réelle : les références de signaux sont synthétiques.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { CRITERE_PIR, lireCouverturePir } from "../src/analyse/pir-couverture.js";
import { closePools, query } from "../src/db.js";

const SNAPSHOT = fileURLToPath(new URL("./fixtures/pir/couverture.json", import.meta.url));
const TAG = `pir${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

after(async () => {
	await query("DELETE FROM pir_signal WHERE reference LIKE $1", [`${TAG}%`]);
	await closePools();
});

function normaliser(ligne: {
	code: string;
	question: string;
	owner: string;
	rendu_le: Date | null;
	signaux_30d: number;
	statut: string;
}) {
	return {
		code: ligne.code,
		question: ligne.question,
		owner: ligne.owner,
		rendu_le: ligne.rendu_le instanceof Date ? ligne.rendu_le.toISOString() : null,
		signaux_30d: ligne.signaux_30d,
		statut: ligne.statut,
	};
}

test("au moins huit PIR, chacun avec un owner et une requête SQL de mesure", async () => {
	const total = await query<{ n: string }>("SELECT count(*)::text AS n FROM pir");
	assert.ok(Number(total.rows[0]?.n) >= 8, `table pir : ${total.rows[0]?.n} lignes`);

	const incomplets = await query<{ code: string }>(
		`SELECT code FROM pir
		  WHERE owner IS NULL OR btrim(owner) = ''
		     OR requete_sql IS NULL OR btrim(requete_sql) = ''`,
	);
	assert.deepEqual(incomplets.rows, [], "chaque PIR a un responsable et sa requête");

	const nonSelect = await query<{ code: string }>(
		"SELECT code FROM pir WHERE requete_sql !~* '^[[:space:]]*SELECT[[:space:]]'",
	);
	assert.deepEqual(nonSelect.rows, [], "les requêtes stockées sont des SELECT uniques");
});

test("snapshot : les questions rendues sans réponse restent visibles", async () => {
	const lignes = await lireCouverturePir();
	const attendu = JSON.parse(await readFile(SNAPSHOT, "utf8")) as unknown[];
	assert.deepEqual(lignes.map(normaliser), attendu, "couverture conforme au snapshot versionné");

	const sansReponse = lignes.filter((l) => l.rendu_le !== null && l.signaux_30d === 0);
	console.log(`questions rendues sans signal = ${sansReponse.length} / ${lignes.length}`);
	for (const ligne of sansReponse) console.log(`${ligne.code} [${ligne.owner}] ${ligne.question}`);
	assert.ok(sansReponse.length >= 8, "au moins huit questions sans réponse");
});

test("critère de sortie exécuté tel quel", async () => {
	const resultat = await query<{ count: string }>(CRITERE_PIR);
	console.log(CRITERE_PIR);
	console.log(`count = ${resultat.rows[0]?.count}`);
	assert.ok(Number(resultat.rows[0]?.count) >= 8);
});

test("la vue exécute la requête stockée et suit les nouveaux signaux", async () => {
	const code = "PIR-04";
	const reference = `${TAG}-01`;
	const lire = async () => (await lireCouverturePir()).find((l) => l.code === code);
	assert.equal((await lire())?.signaux_30d, 0);

	try {
		await query(
			`INSERT INTO pir_signal (pir_id, motif, observe_le, reference)
			 SELECT id, 'industrie', now(), $2 FROM pir WHERE code = $1`,
			[code, reference],
		);
		assert.equal((await lire())?.signaux_30d, 1);
		assert.equal((await lire())?.statut, "couvert");
	} finally {
		await query("DELETE FROM pir_signal WHERE reference = $1", [reference]);
	}

	const original = await query<{ requete_sql: string }>(
		"SELECT requete_sql FROM pir WHERE code = $1",
		[code],
	);
	try {
		await query("UPDATE pir SET requete_sql = 'SELECT 7::int AS nb' WHERE code = $1", [code]);
		assert.equal((await lire())?.signaux_30d, 7, "le chiffre vient de la requête stockée");
	} finally {
		await query("UPDATE pir SET requete_sql = $2 WHERE code = $1", [code, original.rows[0]!.requete_sql]);
	}
	assert.equal((await lire())?.signaux_30d, 0);
});
