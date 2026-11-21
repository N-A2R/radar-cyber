/**
 * Mesure bornée du coût mémoire du gazetteer — deux modes.
 *
 *  - défaut : lit les alias de la base de démonstration (port 5433) et mesure
 *    le coût de l'index dans CE processus court, sans dupliquer l'index du
 *    service vivant.
 *  - `--synthetique=1700000` : fabrique 1,7 M d'alias par lots, sans base, et
 *    vérifie le budget de 500 Mo (le cas nominal de la demande). Les lots sont
 *    donnés au constructeur incrémental, comme en production : la mesure ne
 *    profitable pas d'un tableau géant de lignes librement accessible.
 *
 * Le tas est plafonné par l'appelant (`--max-old-space-size`), donc un
 * dépassement tue ce script, pas la machine.
 *
 *   apps/api/node_modules/.bin/tsx scripts/mesure-gazetteer.mts --synthetique=1700000
 */
import { ConstructeurGazetteer, buildGazetteer, type GazetteerRow } from "../apps/api/src/match/gazetteer.js";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const pg = require("pg") as typeof import("pg");
const args = process.argv.slice(2);
const argTexte = (nom: string): string | undefined => args.find((a) => a.startsWith(`--${nom}=`))?.split("=")[1];
const arg = (nom: string): number => {
	const valeur = argTexte(nom);
	return valeur === undefined ? NaN : Number(valeur);
};
const URL_DB = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
const LIMITE = Number(process.env.LIMITE ?? 0);
const SYNTHETIQUE = arg("synthetique");
const BUDGET_MO = Number(process.env.LIMITE_MO ?? argTexte("limite-mo") ?? 500);
const LOT = 20_000;


const memoire = () => {
	const m = process.memoryUsage();
	return { rssMo: Math.round(m.rss / 1048576), tasMo: Math.round(m.heapUsed / 1048576) };
};

/** Jeu synthétique subsidiairement réaliste : une org porte ~5,6 alias. */
/** Jeu synthétique subsidiairement réaliste : une org porte ~6 alias. */
function lotSynthetique(debut: number, total: number): GazetteerRow[] {
	const noms = ["Etablissement", "Association", "Societe", "Mairie", "Hopital", "Ecole"];
	const lot: GazetteerRow[] = [];
	for (let i = debut; i < Math.min(total, debut + LOT); i++) {
		const orgId = Math.floor(i / 6) + 1;
		const alias = `${noms[i % noms.length]} ${i} Bordeaux`;
		lot.push({
			org_id: orgId,
			name: `${noms[i % noms.length]} ${orgId} Nouvelle Aquitaine`,
			kind: "entreprise",
			dept: "33",
			city: "Bordeaux",
			sector: "commerce",
			alias,
			nom_normalise: alias.toLowerCase(),
			source: i % 9 === 0 ? "annuaire-entreprises" : "sirene-nom",
		});
	}
	return lot;
}

async function main() {
	const avant = memoire();
	console.log(`départ        : rss ${avant.rssMo} Mo · tas ${avant.tasMo} Mo`);
	let alias = 0;
	let index = 0;
	let constructionMs = 0;

	if (Number.isFinite(SYNTHETIQUE) && SYNTHETIQUE > 0) {
		const t0 = performance.now();
		const constructeur = new ConstructeurGazetteer();
		for (let debut = 0; debut < SYNTHETIQUE; debut += LOT) {
			const lot = lotSynthetique(debut, SYNTHETIQUE);
			for (const ligne of lot) constructeur.ajouter(ligne);
			alias += lot.length;
		}
		const t1 = performance.now();
		const gaz = constructeur.construire();
		constructionMs = Math.round(t1 - t0);
		index = gaz.byAliasKey.size;
		console.log(`${alias} alias synthétiques : ${constructionMs} ms`);
	} else {
		const client = new pg.Client({ connectionString: URL_DB });
		await client.connect();
		const t0 = performance.now();
		const { rows } = await client.query<GazetteerRow>(
			`SELECT a.org_id, o.name, o.kind, o.dept, o.city, o.sector, a.alias, a.source
			   FROM org_alias a JOIN org o ON o.id = a.org_id
			  WHERE a.status = 'active'
			  ${LIMITE > 0 ? `LIMIT ${LIMITE}` : ""}`,
		);
		await client.end();
		const t1 = performance.now();
		console.log(`${rows.length} lignes lues : ${Math.round(t1 - t0)} ms`);
		const t2 = performance.now();
		const gaz = buildGazetteer(rows);
		constructionMs = Math.round(performance.now() - t2);
		alias = rows.length;
		index = gaz.byAliasKey.size;
		console.log(`index         : ${constructionMs} ms`);
	}
	// Avec --expose-gc, on mesure l'index résident et non les tas temporaires
	// encore à collecter. Sans GC, le chiffre est un majorant (pic de RAM).
	const avecGc = globalThis as typeof globalThis & { gc?: () => void };
	avecGc.gc?.();
	const apres = memoire();
	const deltaTas = apres.tasMo - avant.tasMo;
	const deltaRss = apres.rssMo - avant.rssMo;
	console.log(`mémoire finale: rss ${apres.rssMo} Mo · tas ${apres.tasMo} Mo`);
	console.log(`delta total   : +${deltaTas} Mo de tas · +${deltaRss} Mo de rss`);
	console.log(`clés d'alias  : ${index}`);
	console.log(`budget        : ${deltaTas} Mo de tas / ${BUDGET_MO} Mo — ${deltaTas <= BUDGET_MO ? "OK" : "DÉPASSÉ"}`);
	if (deltaTas > BUDGET_MO) process.exitCode = 1;
}

main().catch((e) => {
	console.error("échec :", e instanceof Error ? e.message : e);
	process.exit(1);
});
