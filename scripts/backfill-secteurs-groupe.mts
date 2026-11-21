/**
 * Backfill des neuf groupes sectoriels du référentiel.
 *
 * La règle est dans `apps/api/src/analyse/secteur-groupe.ts` : une seule
 * implémentation, appelée ici et testée dans `apps/api/test`. On écrit le
 * groupe, sa source (`secteur`, `naf`, `kind`, `defaut`) et sa confiance
 * (0 à 1), pour que la mesure puisse dire ce qu'elle compte.
 *
 * Par lots de 5 000, en transaction : 1,6 M de mises à jour en une seule
 * transaction bloquerait les lecteurs. Le journal reçoit un fait agrégé par
 * exécution — un fait par organisation noierait le journal sous 1,6 M lignes.
 *
 * Usage :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar tsx scripts/backfill-secteurs-groupe.mts
 *   … --dry-run   : calcule et mesure sans écrire.
 */
import { closePools, ingestQuery, withTransaction } from "../apps/api/src/db.js";
import { consignerLot, type JournalEntry } from "../apps/api/src/journal/index.js";
import {
	classerSecteurGroupe,
	type SecteurGroupe,
	type SourceSecteur,
} from "../apps/api/src/analyse/secteur-groupe.js";

type Ligne = { id: number; sector: string | null; naf: string | null; kind: string };

const TAILLE_LOT = 5000;
const ECRIRE = !process.argv.includes("--dry-run");

async function main(): Promise<void> {
	let dernierId = 0;
	let traitees = 0;
	let ecrites = 0;
	const parGroupe = new Map<SecteurGroupe, number>();
	const parSource = new Map<SourceSecteur, number>();

	while (true) {
		const { rows } = await ingestQuery<Ligne>(
			`SELECT id, sector, naf, kind
			   FROM org WHERE id > $1 ORDER BY id LIMIT $2`,
			[dernierId, TAILLE_LOT],
		);
		if (rows.length === 0) break;

		const ids: number[] = [];
		const groupes: string[] = [];
		const sources: string[] = [];
		const confiances: number[] = [];
		for (const ligne of rows) {
			const classe = classerSecteurGroupe(ligne);
			ids.push(ligne.id);
			groupes.push(classe.secteur);
			sources.push(classe.source);
			confiances.push(classe.confiance);
			parGroupe.set(classe.secteur, (parGroupe.get(classe.secteur) ?? 0) + 1);
			parSource.set(classe.source, (parSource.get(classe.source) ?? 0) + 1);
		}

		if (ECRIRE) {
			await withTransaction(async (client) => {
				const result = await client.query(
					`UPDATE org AS o
					    SET secteur_groupe = v.groupe,
					        secteur_source = v.source,
					        secteur_confiance = v.confiance
					   FROM unnest($1::int[], $2::text[], $3::text[], $4::real[])
					        AS v(id, groupe, source, confiance)
					  WHERE o.id = v.id
					    AND (o.secteur_groupe IS DISTINCT FROM v.groupe
					      OR o.secteur_source IS DISTINCT FROM v.source
					      OR o.secteur_confiance IS DISTINCT FROM v.confiance)`,
					[ids, groupes, sources, confiances],
				);
				ecrites += result.rowCount ?? 0;
			});
		}

		dernierId = rows[rows.length - 1]!.id;
		traitees += rows.length;
	}

	const faits: JournalEntry[] = ECRIRE
		? [{
			kind: "org.changed",
			subject: "secteurs-groupe:backfill@1",
			summary: `${ecrites} organisations classées en 9 groupes sectoriels (source et confiance jointes)`,
			actor: "backfill:secteurs-groupe@1",
			payload: {
				traitees,
				ecrites,
				parGroupe: Object.fromEntries(parGroupe),
				parSource: Object.fromEntries(parSource),
				regle: "apps/api/src/analyse/secteur-groupe.ts",
			},
		}]
		: [];
	if (faits.length > 0) {
		const lot = await consignerLot(faits);
		console.log(`journal : ${lot.consignes} fait(s), ${lot.lacunes} lacune(s), ${lot.erreurs.length} échec(s)`);
	}

	console.log(`${ECRIRE ? "classées" : "à classer (dry-run)"} : ${traitees} organisation(s), ${ecrites} écrite(s)`);
	for (const [groupe, n] of [...parGroupe].sort((a, b) => b[1] - a[1])) {
		console.log(`  ${groupe.padEnd(16)} ${n}`);
	}
	await closePools();
}

main().catch((erreur: unknown) => {
	console.error(erreur);
	process.exit(1);
});
