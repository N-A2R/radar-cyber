/**
 * Backfill the parent_org_id link from SIRET establishments to their siège.
 *
 * Idempotent, Nouvelle-Aquitaine only, no event/victim data involved.
 * Run once after a SIRENE import; the public counter reads the resulting links.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/attacher-etablissements-siret.mts
 */
import { closePools } from "../apps/api/src/db.js";
import {
	attachSiretEstablishments,
	countSiretEstablishments,
} from "../apps/api/src/referentiel/siret-establishments.js";

try {
	const linksCreated = await attachSiretEstablishments();
	const counts = await countSiretEstablishments();
	console.log(JSON.stringify({ linksCreated, ...counts }, null, 2));
} finally {
	await closePools();
}
