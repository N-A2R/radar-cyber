/**
 * Charge les inventaires CT versionnés dans la base courante.
 *
 * Idempotent : `ON CONFLICT (sous_domaine, source) DO NOTHING` conserve la
 * première vue la plus ancienne et ne duplique rien. Appelé par le socle
 * (`scripts/bootstrap.mts`) pour qu'une base neuve porte l'inventaire réel
 * au lieu d'une table vide.
 *
 *   tsx scripts/load-ct-inventory.mts
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// pnpm cloisonne `pg` dans apps/api : même idiome que scripts/migrate.mts.
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";

const SNAPSHOTS = [
	new URL("../bench/results/ctlogs-inventaire-2026-11-21.json", import.meta.url),
	new URL("../bench/results/ctlogs-inventaire-2026-11-22.json", import.meta.url),
];

type Snapshot = {
	sous_domaines: {
		sous_domaine: string;
		domaine: string;
		organisation: string;
		source: string;
		premiere_vue: string;
		certificat_id: string | null;
		emetteur: string | null;
	}[];
};

async function main(): Promise<void> {
	const client = new Client({ connectionString: DATABASE_URL });
	await client.connect();
	try {
		const avant = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM ct_sous_domaine");
		let inscrits = 0;
		for (const chemin of SNAPSHOTS) {
			const snapshot = JSON.parse(readFileSync(chemin, "utf8")) as Snapshot;
			for (const ligne of snapshot.sous_domaines) {
				// `premiere_vue` est l'instant où CET inventaire voit le nom ;
				// la date du certificat fournisseur reste dans `certificat_vu_le`.
				const resultat = await client.query(
					`INSERT INTO ct_sous_domaine
					 (sous_domaine, domaine, organisation, source, premiere_vue, certificat_vu_le, certificat_id, emetteur)
					 VALUES ($1, $2, $3, $4, now(), $5::timestamptz, $6, $7)
					 ON CONFLICT (sous_domaine, source) DO NOTHING`,
					[
						ligne.sous_domaine,
						ligne.domaine,
						ligne.organisation,
						ligne.source,
						ligne.premiere_vue,
						ligne.certificat_id,
						ligne.emetteur,
					],
				);
				inscrits += resultat.rowCount ?? 0;
			}
		}
		const apres = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM ct_sous_domaine");
		console.log(
			`Inventaire CT : ${inscrits} sous-domaine(s) ajouté(s), ${avant.rows[0]?.n} → ${apres.rows[0]?.n}.`,
		);
	} finally {
		await client.end();
	}
}

main().catch((erreur: unknown) => {
	console.error(erreur);
	process.exitCode = 1;
});
