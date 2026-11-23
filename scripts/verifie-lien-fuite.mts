#!/usr/bin/env -S npx tsx
/**
 * Mesure du rattachement des revendications aux incidents confirmés.
 *
 * La table `leak_link_eval` est remplie par la migration 216 : la mesure est
 * une lecture SQL, reproductible sur une base neuve. Ce script ne modifie
 * aucune donnée ; il affiche la requête du critère et sa sortie brute.
 *
 * Usage : DATABASE_URL=postgres://... pnpm verifie:lien-fuite
 */
import { createRequire } from "node:module";

// `pg` vit dans apps/api (pnpm cloisonne les dépendances).
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
const client = new Client({ connectionString: url });
await client.connect();
try {
	const criterion =
		"SELECT count(*) FILTER (WHERE matched)::float/count(*) FROM leak_link_eval;";
	const quality = `
		SELECT count(*)::int AS cases,
		       count(*) FILTER (WHERE matched)::int AS matched,
		       count(*) FILTER (WHERE matched AND NOT expected)::int AS false_links,
		       count(*) FILTER (WHERE matched AND NOT link_correct)::int AS wrong_links
		  FROM leak_link_eval`;
	const [score, check] = await Promise.all([client.query(criterion), client.query(quality)]);
	const ratio = Number(Object.values(score.rows[0] ?? {})[0] ?? 0);
	const q = check.rows[0] as {
		cases: number;
		matched: number;
		false_links: number;
		wrong_links: number;
	};
	const wrongRate = q.matched > 0 ? q.false_links / q.matched : 0;

	console.log("=== CRITÈRE SQL (sortie brute) ===");
	console.log(criterion);
	console.log(JSON.stringify(score.rows));
	console.log("=== QUALITÉ DES LIENS ===");
	console.log(JSON.stringify(q));
	console.log(`taux d'erreur sur les liens : ${wrongRate.toFixed(4)} (cible <= 0.10)`);

	if (!Number.isFinite(ratio) || ratio < 0.7) {
		console.error(`ÉCHEC : ${ratio} < 0,70`);
		process.exitCode = 1;
	} else if (q.cases !== 100 || wrongRate > 0.1) {
		console.error(`ÉCHEC : ${q.cases} cas, ${wrongRate} de liens erronés`);
		process.exitCode = 1;
	}
} finally {
	await client.end();
}
