/**
 * Suite golden des rapports publiés : vidéo, organisation, hebdomadaire, vide.
 *
 * Chaque rapport généré est comparé octet à octet à son snapshot versionné,
 * après normalisation des seules dates. Un chiffre public qui bouge — même
 * d'une unité — fait donc échouer le test. Le registre `report_run` est tenu
 * à jour avec l'empreinte du rapport normalisé.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	GOLDEN_CODES,
	GOLDEN_TITRES,
	empreinteGolden,
	genererRapportsGolden,
	normaliserDates,
	type GoldenReport,
} from "../src/analyse/rapports-golden.js";
import { closePools, query } from "../src/db.js";

const SNAPSHOT_DIR = fileURLToPath(new URL("./fixtures/golden/", import.meta.url));
const rapports: GoldenReport[] = genererRapportsGolden();

function octetsNormalises(rapport: string): Buffer {
	return Buffer.from(normaliserDates(rapport), "utf8");
}

/** Le diff porte sur les octets : aucun champ de chiffre n'est toléré. */
function comparerSnapshot(code: string, produit: string, snapshot: string): void {
	const attendu = octetsNormalises(snapshot);
	const obtenu = octetsNormalises(produit);
	if (!attendu.equals(obtenu)) {
		const i = attendu.findIndex((octet, index) => octet !== obtenu[index]);
		throw new Error(
			`rapport golden ${code} : écart à l'octet ${i} (attendu ${JSON.stringify(attendu.subarray(Math.max(0, i - 30), i + 60).toString("utf8"))}, obtenu ${JSON.stringify(obtenu.subarray(Math.max(0, i - 30), i + 60).toString("utf8"))})`,
		);
	}
}

after(async () => {
	await closePools();
});

for (const rapport of rapports) {
	test(`golden ${rapport.code} : diff octet à octet après normalisation des dates`, async () => {
		const snapshot = await readFile(`${SNAPSHOT_DIR}${rapport.code}.md`, "utf8");
		comparerSnapshot(rapport.code, `${rapport.rapport}\n`, snapshot);
		assert.equal(octetsNormalises(`${rapport.rapport}\n`).length, octetsNormalises(snapshot).length);
	});
}

test("un écart d'un seul chiffre public fait échouer chaque snapshot", async () => {
	for (const rapport of rapports) {
		const snapshot = await readFile(`${SNAPSHOT_DIR}${rapport.code}.md`, "utf8");
		const normalise = normaliserDates(snapshot);
		const chiffre = /\d+/.exec(normalise);
		assert.ok(chiffre, `aucun chiffre public dans le rapport ${rapport.code}`);
		const index = chiffre.index;
		const modifie =
			normalise.slice(0, index) + (Number(chiffre[0]) + 1) + normalise.slice(index + chiffre[0].length);
		assert.throws(
			() => comparerSnapshot(rapport.code, modifie, snapshot),
			/écart à l'octet/,
			`un chiffre modifié dans ${rapport.code} doit faire échouer le snapshot`,
		);
	}
});

test("le registre report_run contient exactement quatre lignes golden à jour", async () => {
	assert.deepEqual(
		[...GOLDEN_CODES],
		["video", "org", "hebdo", "vide"],
		"les quatre rapports attendus sont figés",
	);
	for (const rapport of rapports) {
		await query(
			`INSERT INTO report_run (code, titre, statut, snapshot_sha256, octets_normalises, verifie_le)
			 VALUES ($1, $2, 'golden', $3, $4, now())
			 ON CONFLICT (code) WHERE statut = 'golden' DO UPDATE
			 SET titre = EXCLUDED.titre,
			     snapshot_sha256 = EXCLUDED.snapshot_sha256,
			     octets_normalises = EXCLUDED.octets_normalises,
			     verifie_le = EXCLUDED.verifie_le`,
			[
				rapport.code,
				GOLDEN_TITRES[rapport.code],
				empreinteGolden(`${rapport.rapport}\n`),
				octetsNormalises(`${rapport.rapport}\n`).length,
			],
		);
	}
	const lignes = await query<{ code: string; snapshot_sha256: string | null }>(
		"SELECT code, snapshot_sha256 FROM report_run WHERE statut = 'golden' ORDER BY code",
	);
	for (const rapport of rapports) {
		const ligne = lignes.rows.find((l) => l.code === rapport.code);
		assert.equal(ligne?.snapshot_sha256, empreinteGolden(`${rapport.rapport}\n`));
	}
	const count = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM report_run WHERE statut = 'golden'",
	);
	const valeur = count.rows[0]?.n ?? 0;
	console.log(`SELECT count(*) FROM report_run WHERE statut='golden' = ${valeur}`);
	assert.equal(valeur, 4);
});
