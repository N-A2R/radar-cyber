/**
 * Export reproductible des événements du périmètre public vers `stix_object`.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm export:stix
 *
 * L'export est idempotent (upsert par identifiant STIX déterministe). Il ne
 * lit que des champs structurels : aucun titre, résumé, evidence brute ni nom
 * de victime n'est exporté. La source est la liste blanche
 * `export_public_event` — un fait non TLP:CLEAR n'est jamais lu, et
 * `persistStixObjects` le refuserait de toute façon.
 */
import { closePools, query } from "../apps/api/src/db.js";
import {
	listPublicEvents,
	persistStixObjects,
} from "../apps/api/src/export/stix.js";

try {
	const evenements = await listPublicEvents();
	const resultat = await persistStixObjects(evenements, query);
	const etat = await query<{ total: string; invalides: string }>(`
    SELECT count(*)::text AS total,
           count(*) FILTER (WHERE confidence IS NULL OR tlp IS NULL)::text AS invalides
    FROM stix_object
  `);
	console.log(
		`export: ${resultat.exported} objet(s) écrit(s), ${resultat.skipped} hors périmètre public (TLP non CLEAR ou PAP:RED), ${resultat.rejected} rejeté(s) pour tag inconnu`,
	);
	console.log(
		`stix_object: ${etat.rows[0].total} objet(s), ${etat.rows[0].invalides} sans tlp/confidence`,
	);
} finally {
	await closePools();
}
