/**
 * Charge le complément de référentiel vérifié à l'API Recherche d'entreprises.
 *
 * Le fichier `db/data/referentiel-complement-*.json` ne contient que des
 * entités retrouvées **auprès de la source officielle** (INSEE/SIRENE via
 * `recherche-entreprises.api.gouv.fr`), avec leur SIREN et leur commune. Le
 * corpus de mesure a révélé le manque ; il ne fournit aucune donnée.
 *
 * Idempotent : une entité déjà présente par son SIREN est mise à jour, pas
 * dupliquée. Les alias sont insérés sans écraser ceux qui existent.
 *
 *   tsx scripts/load-referentiel-complement.mts            # dry-run
 *   tsx scripts/load-referentiel-complement.mts --apply
 */
import { readFileSync } from "node:fs";
import { query, withTransaction } from "../apps/api/src/db.js";

const APPLY = process.argv.includes("--apply");
const FICHIER = "db/data/referentiel-complement-2026-11-13.json";

type Entite = {
	siren: string;
	name: string;
	kind: string;
	city: string;
	dept: string;
	codePostal: string;
	aliases: string[];
	verifieLe: string;
};

const fichier = JSON.parse(readFileSync(FICHIER, "utf8")) as { entites: Entite[] };

function slug(nom: string, siren: string): string {
	const base = nom
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60);
	return `complement-${base}-${siren}`;
}

const bilan = { crees: 0, misAJour: 0, alias: 0, ignores: 0 };

for (const e of fichier.entites) {
	const existant = await query<{ id: number }>("SELECT id FROM org WHERE siren = $1", [e.siren]);
	const deja = existant.rows[0]?.id;

	if (!APPLY) {
		console.log(`${deja ? "existe" : "à créer"}  ${e.siren}  ${e.name}  (${e.codePostal} ${e.city})`);
		if (deja) bilan.misAJour++;
		else bilan.crees++;
		continue;
	}

	await withTransaction(async (client) => {
		let id = deja;
		if (id) {
			await client.query(
				`UPDATE org SET name=$2, kind=$3, city=$4, dept=$5, siren=$6, geo_source='annuaire-entreprises'
				  WHERE id=$1`,
				[id, e.name, e.kind, e.city, e.dept, e.siren],
			);
			bilan.misAJour++;
		} else {
			const r = await client.query<{ id: number }>(
				`INSERT INTO org (name, slug, kind, city, dept, siren, geo_source)
				 VALUES ($1,$2,$3,$4,$5,$6,'annuaire-entreprises') RETURNING id`,
				[e.name, slug(e.name, e.siren), e.kind, e.city, e.dept, e.siren],
			);
			id = r.rows[0]?.id as number;
			bilan.crees++;
		}
		for (const alias of e.aliases) {
			const insere = await client.query(
				`INSERT INTO org_alias (org_id, alias, source)
				 SELECT $1, $2, 'annuaire-entreprises'
				  WHERE NOT EXISTS (SELECT 1 FROM org_alias WHERE org_id=$1 AND alias=$2)`,
				[id, alias],
			);
			bilan.alias += insere.rowCount ?? 0;
		}
	});
}

console.log(
	`${APPLY ? "Appliqué" : "Dry-run"} · ${fichier.entites.length} entité(s) · ` +
		`${bilan.crees} création(s), ${bilan.misAJour} mise(s) à jour, ${bilan.alias} alias`,
);
process.exit(0);
