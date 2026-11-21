#!/usr/bin/env -S npx tsx
/**
 * Export des organisations : id, nom, type, département, domaine,
 * nombre d'alias et nombre d'événements.
 *
 *   pnpm -F @radar/api exec tsx ../../scripts/export-orgs.mts
 *
 * Écrit out/orgs.csv (CSV) et out/orgs.ndjson.gz (NDJSON gzipé), deux flux
 * écrits en parallèle avec respect de la contre-pression. La lecture se fait
 * par tranches de 100 000 organisations (pagination par clé sur org.id) :
 * jamais plus d'une tranche en mémoire, même avec 1,67 M de lignes.
 *
 * Les compteurs sont lus par des sous-requêtes indexées (org_alias.org_id,
 * event.org_id) ; aucun GROUP BY sur la table entière.
 */
import { once } from "node:events";
import { createWriteStream, mkdirSync, statSync } from "node:fs";
import { finished, pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import { closePools, ingestQuery } from "../apps/api/src/db.js";

const BATCH_SIZE = 100_000;
const OUT_DIR = fileURLToPath(new URL("../out/", import.meta.url));
const CSV_PATH = fileURLToPath(new URL("../out/orgs.csv", import.meta.url));
const NDJSON_PATH = fileURLToPath(new URL("../out/orgs.ndjson.gz", import.meta.url));

const SQL = `SELECT o.id, o.name, o.kind, o.dept, o.domain,
       (SELECT count(*)::int FROM org_alias a WHERE a.org_id = o.id) AS nb_alias,
       (SELECT count(*)::int FROM event e WHERE e.org_id = o.id) AS nb_evenements
  FROM org o
 WHERE o.id > $1
 ORDER BY o.id
 LIMIT $2`;

type Row = {
	id: number;
	name: string;
	kind: string;
	dept: string | null;
	domain: string | null;
	nb_alias: number;
	nb_evenements: number;
};

const HEADER = "id,nom,type,departement,domaine,nb_alias,nb_evenements\n";

function csvField(value: string | number | null): string {
	if (value === null) return "";
	const text = String(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvLine(row: Row): string {
	return [
		row.id,
		row.name,
		row.kind,
		row.dept,
		row.domain,
		row.nb_alias,
		row.nb_evenements,
	]
		.map(csvField)
		.join(",");
}

function ndjsonLine(row: Row): string {
	return `${JSON.stringify({
		id: row.id,
		nom: row.name,
		type: row.kind,
		departement: row.dept,
		domaine: row.domain,
		nb_alias: row.nb_alias,
		nb_evenements: row.nb_evenements,
	})}\n`;
}

function mib(bytes: number): string {
	return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

async function main(): Promise<void> {
	mkdirSync(OUT_DIR, { recursive: true });
	const startedAt = performance.now();

	const csv = createWriteStream(CSV_PATH, { encoding: "utf8" });
	const gzip = createGzip({ level: 6 });
	const ndjson = createWriteStream(NDJSON_PATH);
	const ndjsonDone = pipeline(gzip, ndjson);

	let lastId = 0;
	let exported = 0;
	let batches = 0;

	try {
		csv.write(HEADER);
		for (;;) {
			const { rows } = await ingestQuery<Row>(SQL, [lastId, BATCH_SIZE]);
			if (rows.length === 0) break;

			for (const row of rows) {
				if (!csv.write(`${csvLine(row)}\n`)) await once(csv, "drain");
				if (!gzip.write(ndjsonLine(row))) await once(gzip, "drain");
			}

			lastId = rows[rows.length - 1]!.id;
			exported += rows.length;
			batches++;
			console.log(`[export] tranche ${batches} : ${exported} organisations`);
		}

		csv.end();
		gzip.end();
		await Promise.all([finished(csv), ndjsonDone]);
	} catch (error) {
		csv.destroy();
		gzip.destroy();
		ndjson.destroy();
		await Promise.allSettled([finished(csv), ndjsonDone]);
		throw error;
	}

	const elapsed = (performance.now() - startedAt) / 1000;
	const csvBytes = statSync(CSV_PATH).size;
	const ndjsonBytes = statSync(NDJSON_PATH).size;
	console.log(`[export] ${exported} organisations en ${batches} tranches`);
	console.log(`[export] durée totale : ${elapsed.toFixed(1)} s`);
	console.log(
		`[export] taille : CSV ${mib(csvBytes)} + NDJSON.gz ${mib(ndjsonBytes)} = ${mib(csvBytes + ndjsonBytes)}`,
	);
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
