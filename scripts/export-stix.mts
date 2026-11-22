/**
 * Export reproductible des événements admis vers `stix_object`.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm export:stix
 *
 * L'export est idempotent (upsert par identifiant STIX déterministe). Il ne
 * lit que des champs structurels : aucun titre, résumé, evidence brute ni nom
 * de victime n'est exporté, et les faits TLP:RED restent en quarantaine.
 */
import { closePools, query } from "../apps/api/src/db.js";
import { persistStixObjects, type StixEventRow } from "../apps/api/src/export/stix.js";

const EVENTS = `
  SELECT id, dedup_key, family, assertion_type, tlp, confidence, evidence, created_at
  FROM event
  ORDER BY id
`;

try {
	const evenements = await query<StixEventRow>(EVENTS);
	const resultat = await persistStixObjects(evenements.rows, query);
	const etat = await query<{ total: string; invalides: string }>(`
    SELECT count(*)::text AS total,
           count(*) FILTER (WHERE confidence IS NULL OR tlp IS NULL)::text AS invalides
    FROM stix_object
  `);
	console.log(
		`export: ${resultat.exported} objet(s) écrit(s), ${resultat.skipped} en quarantaine (TLP/PAP:RED) non exporté(s), ${resultat.rejected} rejeté(s) pour tag inconnu`,
	);
	console.log(
		`stix_object: ${etat.rows[0].total} objet(s), ${etat.rows[0].invalides} sans tlp/confidence`,
	);
} finally {
	await closePools();
}
