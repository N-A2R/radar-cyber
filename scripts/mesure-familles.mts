/**
 * Mesure des familles d'indices de la file de quarantaine — lecture seule.
 *
 * La question : la file (« 365 en attente », tous indices confondus) est-elle
 * homogène ? On prend donc les lignes en attente **avec un indice non vide**,
 * on classe chaque indice avec le classifieur pur, et on publie le résultat.
 *
 * Sécurité : l'URL de la base de test est imposée ici (port 5433), jamais
 * héritée de l'environnement, et la transaction est `READ ONLY`. Aucune
 * écriture en base, aucune donnée inventée.
 *
 *   apps/api/node_modules/.bin/tsx scripts/mesure-familles.mts
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FamilleIndice } from "../apps/api/src/match/famille-indice.js";

const BASE_TEST = "postgres://radar:radar@localhost:5433/radar";
process.env.DATABASE_URL = BASE_TEST;

const { withClient, closePools } = await import("../apps/api/src/db.js");
const { classifierIndice } = await import("../apps/api/src/match/famille-indice.js");

const FAMILLES: readonly FamilleIndice[] = ["domaine", "sigle", "nom", "vide"];
const SORTIE = fileURLToPath(new URL("../bench/results/familles-365.json", import.meta.url));

type Ligne = { id: number; org_hint: string };
type Totaux = { total: string; sans_indice: string };

async function main(): Promise<void> {
	const mesure = await withClient(async (client) => {
		await client.query("BEGIN READ ONLY");
		try {
			const { rows: lignes } = await client.query<Ligne>(
				`SELECT id, org_hint
				   FROM quarantine_raw
				  WHERE promoted = false
				    AND kind = 'claim'
				    AND status = 'pending'
				    AND org_hint IS NOT NULL
				    AND btrim(org_hint) <> ''
				  ORDER BY id`,
			);
			const { rows } = await client.query<Totaux>(
				`SELECT count(*)::text AS total,
				        count(*) FILTER (WHERE org_hint IS NULL OR btrim(org_hint) = '')::text AS sans_indice
				   FROM quarantine_raw
				  WHERE promoted = false AND kind = 'claim' AND status = 'pending'`,
			);
			return { lignes, totaux: rows[0]! };
		} finally {
			await client.query("ROLLBACK");
		}
	});

	const comptes = Object.fromEntries(FAMILLES.map((f) => [f, 0])) as Record<FamilleIndice, number>;
	const exemples = Object.fromEntries(FAMILLES.map((f) => [f, [] as string[]])) as Record<
		FamilleIndice,
		string[]
	>;
	for (const ligne of mesure.lignes) {
		const famille = classifierIndice(ligne.org_hint);
		comptes[famille] += 1;
		if (exemples[famille]!.length < 5) exemples[famille]!.push(ligne.org_hint);
	}

	// Corpus ordonné par id : le même jeu de lignes donne toujours le même hash.
	const corpus = mesure.lignes.map((l) => l.org_hint).join("\n");
	const sha256 = createHash("sha256").update(`${corpus}\n`, "utf8").digest("hex");

	const rapport = {
		base: BASE_TEST,
		filtre: "promoted=false AND kind='claim' AND status='pending' AND btrim(org_hint) <> ''",
		total: mesure.lignes.length,
		total_attente: Number(mesure.totaux.total),
		attente_sans_indice: Number(mesure.totaux.sans_indice),
		comptes,
		exemples,
		sha256_corpus: sha256,
		sha256_methode: "SHA-256 des org_hint ordonnés par id, joints par \\n avec un \\n final (UTF-8)",
	};

	mkdirSync(fileURLToPath(new URL("../bench/results/", import.meta.url)), { recursive: true });
	writeFileSync(SORTIE, `${JSON.stringify(rapport, null, 2)}\n`, "utf8");

	console.log(`total mesuré : ${rapport.total} (attente tous indices : ${rapport.total_attente})`);
	for (const famille of FAMILLES) console.log(`${famille}: ${comptes[famille]}`);
	console.log(`sha256 : ${sha256}`);
	console.log(`écrit : ${SORTIE}`);
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
