/**
 * Backfill des secteurs manquants du référentiel entreprises.
 *
 * Le 14 novembre, l'import SIRENE hors numérique a créé 7 460 entreprises avec
 * `sector = NULL` : le code NAF était stocké, le secteur jamais déduit. La
 * mesure de couverture du 15 novembre l'a révélé — « 0 ligne en
 * agro/industrie/BTP/commerce » là où le doc du 14 en publiait 4 824 — et le
 * même défaut touchait 1 648 entreprises numériques réimportées depuis.
 *
 * Le correctif déduit le secteur du NAF déjà en base (`naf-secteurs.mts`),
 * complète sans écraser (COALESCE, comme la voie du référentiel) et consigne
 * un fait `org.changed` par organisation modifiée — écriture hors transaction,
 * une lacune de journal ne doit pas annuler un backfill.
 *
 * Idempotent : ne touche que les lignes avec `sector IS NULL` et un NAF connu.
 */
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { consignerLot, type JournalEntry } from "../apps/api/src/journal/index.js";
import { secteurDeNaf } from "./naf-secteurs.mts";

type Ligne = {
	id: number;
	name: string;
	slug: string;
	entity_code: string | null;
	naf: string;
};

const { rows } = await query<Ligne>(`
	SELECT id, name, slug, entity_code, naf
	  FROM org
	 WHERE kind = 'entreprise'
	   AND sector IS NULL
	   AND naf IS NOT NULL
	 ORDER BY id`);

console.log(`${rows.length} organisation(s) avec un NAF connu et aucun secteur`);

const faits: JournalEntry[] = [];
await withTransaction(async (client) => {
	for (const ligne of rows) {
		const secteur = secteurDeNaf(ligne.naf);
		if (!secteur) continue;
		const r = await client.query<{ id: number }>(
			`UPDATE org SET sector = $2 WHERE id = $1 AND sector IS NULL RETURNING id`,
			[ligne.id, secteur],
		);
		if ((r.rowCount ?? 0) === 0) continue;
		faits.push({
			kind: "org.changed",
			subject: ligne.entity_code ?? ligne.slug,
			summary: `${ligne.name} : sector complété (${secteur})`,
			actor: "backfill:sirene-secteurs@1",
			payload: {
				slug: ligne.slug,
				kind: "entreprise",
				changements: { sector: { avant: null, apres: secteur } },
				naf: ligne.naf,
			},
		});
	}
});

const lot = await consignerLot(faits);
console.log(
	`sector complété : ${faits.length} organisation(s) — journal : ${lot.consignes} fait(s) consigné(s), ${lot.lacunes} lacune(s), ${lot.erreurs.length} échec(s)`,
);

const { rows: reste } = await query<{ n: string }>(
	`SELECT count(*)::text AS n FROM org
	  WHERE kind = 'entreprise' AND sector IS NULL AND naf IS NOT NULL`,
);
const { rows: parSecteur } = await query<{ secteur: string; n: string }>(
	`SELECT COALESCE(sector, '(null)') AS secteur, count(*)::text AS n
	   FROM org WHERE kind = 'entreprise' GROUP BY 1 ORDER BY 2 DESC`,
);
console.log(`resté sans secteur (NAF connu) : ${reste[0]?.n ?? "?"}`);
for (const ligne of parSecteur) console.log(`  ${ligne.secteur.padEnd(22)} ${ligne.n}`);

await closePools();
if (Number(reste[0]?.n ?? 0) > 0) process.exit(1);
