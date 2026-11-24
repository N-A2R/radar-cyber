/**
 * Critère du chantier « projeter les événements en objets STIX 2.1 horodatés ».
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-stix-projection.mts
 *
 * La sortie brute est fait foi : les deux comptes SQL et le résultat de
 * l'aller-retour STIX -> STIX (deux imports) sont affichés tels quels.
 */
import { closePools, query } from "../apps/api/src/db.js";
import { roundTripStix } from "../apps/api/src/export/stix-projection.js";

try {
	const comptes = await query<{ objets: string; relations: string }>(`
    SELECT (SELECT count(*)::text FROM stix_object
             WHERE type IN ('indicator', 'identity', 'campaign')) AS objets,
           (SELECT count(*)::text FROM stix_relation) AS relations
  `);
	const objets = Number(comptes.rows[0].objets);
	const relations = Number(comptes.rows[0].relations);

	console.log("SELECT count(*) FROM stix_object WHERE type IN ('indicator','identity','campaign') >= 1000");
	console.log(`  count = ${objets}  ->  ${objets >= 1000 ? "OK" : "ECHEC"}`);
	console.log("SELECT count(*) FROM stix_relation >= 500");
	console.log(`  count = ${relations}  ->  ${relations >= 500 ? "OK" : "ECHEC"}`);

	const allerRetour = await roundTripStix();
	const identiques = JSON.stringify(allerRetour.imports[0].ids) === JSON.stringify(allerRetour.imports[1].ids)
		&& allerRetour.ids.length === allerRetour.imports[0].ids.length;
	console.log("test d'aller-retour STIX->STIX idempotent (2 imports = mêmes ids)");
	console.log(`  ids exportes = ${allerRetour.ids.length}`);
	console.log(`  ids import 1 = ${allerRetour.imports[0].ids.length}`);
	console.log(`  ids import 2 = ${allerRetour.imports[1].ids.length}`);
	console.log(`  identiques = ${identiques}  ->  ${identiques ? "OK" : "ECHEC"}`);

	if (objets < 1000 || relations < 500 || !identiques) process.exitCode = 1;
} finally {
	await closePools();
}
