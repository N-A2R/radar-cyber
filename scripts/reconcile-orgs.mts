/**
 * Réconciliation des rattachements existants avec le matcher courant.
 *
 * Un rattachement doit être reproductible à partir du texte. Après avoir
 * retiré les alias-domaines de l'index de texte (ils attrapaient tout article
 * régional), il faut vérifier que les rattachements déjà en base tiennent
 * toujours — sinon on garde des faux positifs que plus rien ne justifie.
 *
 * Défait les liens non justifiés via `defaireRattachement` : `org_id`,
 * portée régionale et journal restent cohérents. `--dry-run` par défaut.
 *
 *   pnpm -F @radar/api exec tsx ../../scripts/reconcile-orgs.mts
 *   pnpm -F @radar/api exec tsx ../../scripts/reconcile-orgs.mts --apply
 */
import { pool, closePools, withTransaction } from "../apps/api/src/db.js";
import { defaireRattachement } from "../apps/api/src/match/detachement.js";
import { matchOrg, resetAliasCache } from "../apps/api/src/match/orgs.js";

const apply = process.argv.includes("--apply");

type Row = { id: string; title: string; summary: string | null; org_id: number; org_name: string };

async function main(): Promise<void> {
	resetAliasCache();
	const { rows } = await pool.query<Row>(
		`SELECT e.id, e.title, e.summary, e.org_id, o.name AS org_name
		   FROM event e JOIN org o ON o.id = e.org_id
		  ORDER BY e.id`,
	);

	const toReset: Row[] = [];
	const changed: { id: string; from: string; to: string }[] = [];
	let unchanged = 0;

	for (const row of rows) {
		const match = await matchOrg(`${row.title} ${row.summary ?? ""}`);
		if (match === null) {
			toReset.push(row);
		} else if (match.orgId !== row.org_id) {
			changed.push({ id: row.id, from: row.org_name, to: String(match.orgId) });
		} else {
			unchanged++;
		}
	}

	console.log(`rattachements examinés : ${rows.length}`);
	console.log(`confirmés par le texte : ${unchanged}`);
	console.log(`plus justifiés (à retirer) : ${toReset.length}`);
	console.log(`vers une autre organisation : ${changed.length}`);

	for (const row of toReset.slice(0, 10)) {
		console.log(`  - [${row.id}] ${row.org_name} ← ${row.title.slice(0, 90)}`);
	}

	if (!apply) {
		console.log("\n--dry-run : rien n'a été écrit.");
		return;
	}

	if (toReset.length > 0) {
		let retires = 0;
		await withTransaction(async (client) => {
			for (const row of toReset) {
				const resultat = await defaireRattachement(client, {
					eventId: row.id,
					orgId: row.org_id,
					motif: "texte non confirmé par le matcher",
					regle: "reconcile-texte",
					journal: {
						kind: "event.rattachement",
						actor: "moteur:reconciliation",
						summary: "réconciliation : rattachement défait (texte)",
						subject: `event:${row.id}`,
					},
				});
				if (resultat.updated) retires++;
			}
		});
		console.log(`rattachements retirés : ${retires}`);
	}
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
