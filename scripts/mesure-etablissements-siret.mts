/**
 * Reproducible measurement: number of SIRET establishments linked to a siège.
 *
 * Read-only. Prints the counters and the SQL-backed reference state so a
 * published figure can be checked against the database at any time.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-etablissements-siret.mts
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	countSiretEstablishments,
	NA_DEPARTMENTS,
} from "../apps/api/src/referentiel/siret-establishments.js";

const outputArg = process.argv.find((a) => a.startsWith("--json="))?.slice(7);

try {
	const [counts, state] = await Promise.all([
		countSiretEstablishments(),
		query<{ organisations: number; sources: number; events: number }>(`
			SELECT (SELECT count(*) FROM org)::int AS organisations,
			       (SELECT count(*) FROM source)::int AS sources,
			       (SELECT count(*) FROM event)::int AS events
		`),
	]);
	const result = {
		region: "Nouvelle-Aquitaine",
		departments: NA_DEPARTMENTS,
		state: state.rows[0],
		...counts,
	};
	console.log(JSON.stringify(result, null, 2));
	if (outputArg) writeFileSync(outputArg, `${JSON.stringify(result, null, 2)}\n`);
} finally {
	await closePools();
}
