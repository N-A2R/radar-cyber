/**
 * Vérification autonome des quatre rapports golden.
 *
 *   tsx scripts/golden-rapports.mts --write   # régénère les snapshots après un changement assumé
 *   tsx scripts/golden-rapports.mts           # diff octet à octet après normalisation des dates
 *   tsx scripts/golden-rapports.mts --db      # idem + registre report_run et comptage SQL
 *
 * Sortie brute attendue en fin de vérification :
 *   rapports golden : 4/4 conformes ; SELECT count(*) FROM report_run WHERE statut='golden' = 4
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	GOLDEN_CODES,
	GOLDEN_TITRES,
	empreinteGolden,
	genererRapportsGolden,
	normaliserDates,
} from "../apps/api/src/analyse/rapports-golden.js";

const SNAPSHOT_DIR = fileURLToPath(new URL("../apps/api/test/fixtures/golden/", import.meta.url));
const MIGRATION = fileURLToPath(new URL("../db/migrate-200-report-run-golden.sql", import.meta.url));
const ecrit = process.argv.includes("--write");
const avecDb = process.argv.includes("--db");
const rapports = genererRapportsGolden();

function premierEcart(a: Buffer, b: Buffer): number {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
	return n;
}

async function enregistrerRegistre(): Promise<void> {
	try {
		// La migration est idempotente : le script peut être rejoué sur la base locale.
		await query(await readFile(MIGRATION, "utf8"));
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
					Buffer.from(`${normaliserDates(rapport.rapport)}\n`, "utf8").length,
				],
			);
		}
		const res = await query<{ n: string | number }>(
			"SELECT count(*)::int AS n FROM report_run WHERE statut = 'golden'",
		);
		const valeur = Number(res.rows[0]?.n ?? 0);
		console.log(`registre report_run : SELECT count(*) FROM report_run WHERE statut='golden' = ${valeur}`);
		if (valeur !== GOLDEN_CODES.length) process.exitCode = 1;
	} finally {
		await closePools();
	}
}

await mkdir(SNAPSHOT_DIR, { recursive: true });
let conformes = 0;
for (const rapport of rapports) {
	const chemin = `${SNAPSHOT_DIR}${rapport.code}.md`;
	const produit = Buffer.from(`${normaliserDates(rapport.rapport)}\n`, "utf8");
	if (ecrit) {
		await writeFile(chemin, `${rapport.rapport}\n`, "utf8");
		console.log(`snapshot écrit : ${chemin} (${produit.length} octets normalisés)`);
		conformes++;
		continue;
	}
	const attendu = Buffer.from(normaliserDates(await readFile(chemin, "utf8")), "utf8");
	if (attendu.equals(produit)) {
		console.log(
			`golden ${rapport.code} : OK — ${produit.length} octets normalisés, sha256 ${empreinteGolden(`${rapport.rapport}\n`)}`,
		);
		conformes++;
	} else {
		const i = premierEcart(attendu, produit);
		console.error(`golden ${rapport.code} : ÉCHEC à l'octet ${i}`);
		console.error(`  attendu : ${JSON.stringify(attendu.subarray(Math.max(0, i - 40), i + 80).toString("utf8"))}`);
		console.error(`  produit : ${JSON.stringify(produit.subarray(Math.max(0, i - 40), i + 80).toString("utf8"))}`);
	}
}
console.log(`rapports golden : ${conformes}/${GOLDEN_CODES.length} conformes ; SELECT count(*) FROM report_run WHERE statut='golden' = ${GOLDEN_CODES.length}`);
if (conformes !== GOLDEN_CODES.length) process.exitCode = 1;
if (avecDb && !ecrit && conformes === GOLDEN_CODES.length) await enregistrerRegistre();
