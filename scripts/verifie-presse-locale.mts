#!/usr/bin/env -S npx tsx
/**
 * Critère de sortie du chantier « presse locale ».
 *
 * Exécute la requête du juge mot pour mot, puis la ventilation par
 * département. Lecture seule. Sort en erreur si les 12 départements, les
 * 10 faits récents par département ou la source locale ne sont pas là.
 *
 *   pnpm verifie:presse-locale
 *   DATABASE_URL=postgres://… pnpm verifie:presse-locale
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const pg = require("pg") as typeof import("pg");

const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const client = new pg.Client({ connectionString: url, application_name: "radar-verifie-presse-locale" });
await client.connect();

const CRITERE = `SELECT count(DISTINCT dept)::int AS depts
  FROM event
 WHERE family='presse_locale'
   AND observed_at>now()-interval '90 days'
   AND source_url IS NOT NULL`;

try {
	const global = await client.query<{ depts: number }>(CRITERE);
	const parDept = await client.query<{ dept: string; faits: number; source: string | null }>(
		`SELECT e.dept,
		        count(*)::int AS faits,
		        min(s.name) FILTER (WHERE s.family='presse_locale' AND s.department=e.dept) AS source
		   FROM event e
		   LEFT JOIN source s ON s.id = e.source_id
		  WHERE e.family='presse_locale'
		    AND e.observed_at>now()-interval '90 days'
		    AND e.source_url IS NOT NULL
		    AND e.dept IS NOT NULL
		  GROUP BY e.dept
		  ORDER BY e.dept`,
	);

	const depts = Number(global.rows[0]?.depts ?? 0);
	console.log(`départements couverts (requête du juge) : ${depts} (attendu 12)`);
	for (const ligne of parDept.rows) {
		console.log(`${ligne.dept} : ${ligne.faits} fait(s) — source ${ligne.source ?? "ABSENTE"}`);
	}
	const tousRenseignes = parDept.rows.length === 12 && parDept.rows.every((l) => l.faits >= 10 && l.source !== null);
	const atteint = depts === 12 && tousRenseignes;
	console.log(atteint ? "OBJECTIF ATTEINT" : "OBJECTIF NON ATTEINT");
	if (!atteint) process.exitCode = 1;
} finally {
	await client.end();
}
