/**
 * Mesure bornée du coût mémoire du gazetteer.
 *
 * Le service vivant garde son index résident : on ne le duplique pas. On charge
 * les lignes en lecture seule, on construit l'index dans CE processus court,
 * on relève le pic, puis on sort. Le tas est plafonné par l'appelant
 * (`--max-old-space-size`), donc un dépassement tue ce script, pas la machine.
 */
import { buildGazetteer, type GazetteerRow } from "../apps/api/src/match/gazetteer.js";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const pg = require("pg") as typeof import("pg");

const URL_DB = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
const LIMITE = Number(process.env.LIMITE ?? 0);

const memoire = () => {
	const m = process.memoryUsage();
	return { rssMo: Math.round(m.rss / 1048576), tasMo: Math.round(m.heapUsed / 1048576) };
};

async function main() {
	const client = new pg.Client({ connectionString: URL_DB });
	await client.connect();
	const avant = memoire();
	console.log(`départ        : rss ${avant.rssMo} Mo · tas ${avant.tasMo} Mo`);

	const sql = `SELECT a.org_id, o.name, o.kind, o.dept, o.city, o.sector, a.alias, a.source
	               FROM org_alias a JOIN org o ON o.id = a.org_id
	              WHERE a.status = 'active'
	              ${LIMITE > 0 ? `LIMIT ${LIMITE}` : ""}`;
	const t0 = performance.now();
	const { rows } = await client.query<GazetteerRow>(sql);
	await client.end();
	const t1 = performance.now();
	const apresChargement = memoire();
	console.log(`${rows.length} lignes : ${Math.round(t1 - t0)} ms · rss ${apresChargement.rssMo} Mo · tas ${apresChargement.tasMo} Mo`);

	const t2 = performance.now();
	const gaz = buildGazetteer(rows);
	const t3 = performance.now();
	const apresIndex = memoire();
	console.log(`index         : ${Math.round(t3 - t2)} ms · rss ${apresIndex.rssMo} Mo · tas ${apresIndex.tasMo} Mo`);
	console.log(`delta index   : +${apresIndex.tasMo - apresChargement.tasMo} Mo de tas · +${apresIndex.rssMo - apresChargement.rssMo} Mo de rss`);
	console.log(`clés d'alias  : ${gaz.byAliasKey.size}`);
}

main().catch((e) => {
	console.error("échec :", e instanceof Error ? e.message : e);
	process.exit(1);
});
