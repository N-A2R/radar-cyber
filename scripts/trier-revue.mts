/**
 * Triage de la file de revue.
 *
 * Ne promeut rien. Classe et sort de la file ce qui est **démontrablement**
 * hors périmètre, en le consignant au journal — chaque sortie est réversible.
 *
 * Trois sorties possibles, mesurées avant d'écrire cette ligne :
 *   - `region`         : un département de la région est nommé → reste à revoir ;
 *   - `hors_perimetre` : indice illisible, ou pays étranger annoncé → sortie ;
 *   - `a_revoir`       : rien ne tranche → reste à revoir.
 *
 * Sur les 16 572 revendications en attente, **une seule** se rattache à une
 * organisation du référentiel. Automatiser la promotion aurait donc traité un
 * élément sur seize mille — et le vrai levier est la source, pas la file.
 *
 *   tsx scripts/trier-revue.mts            # dry-run : compte par catégorie
 *   tsx scripts/trier-revue.mts --apply    # sort de la file, journalise
 */
import { query, withTransaction } from "../apps/api/src/db.js";
import { classerPortee } from "../apps/api/src/quarantine/portee.js";

const APPLY = process.argv.includes("--apply");
/**
 * Archive les `a_revoir` sans signal : elles quittent la file de travail sans
 * être jugées. C'est une décision d'ergonomie, pas de vérité — d'où le statut
 * `reviewed` et non `rejected`, et un motif qui dit explicitement qu'on n'a
 * pas tranché.
 */
const ARCHIVER = process.argv.includes("--archiver-sans-signal");

type Ligne = { id: string; org_hint: string | null; titre_brut: string | null };

const { rows } = await query<Ligne>(`
	SELECT id::text, org_hint, extracted->>'titre_brut' AS titre_brut
	  FROM quarantine_raw
	 WHERE status = 'pending'
`);

const parPortee = { region: 0, hors_perimetre: 0, a_revoir: 0 };
const motifs = new Map<string, number>();
const sortants: Ligne[] = [];

for (const r of rows) {
	const verdict = classerPortee(r.org_hint, r.titre_brut ?? "");
	parPortee[verdict.portee]++;
	motifs.set(verdict.motif, (motifs.get(verdict.motif) ?? 0) + 1);
	if (verdict.portee === "hors_perimetre") sortants.push(r);
}

console.log(`Revendications en attente : ${rows.length}`);
for (const [k, n] of Object.entries(parPortee)) {
	console.log(`  ${k.padEnd(15)} ${String(n).padStart(6)}`);
}
console.log("\nMotifs :");
for (const [m, n] of [...motifs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
	console.log(`  ${String(n).padStart(6)}  ${m}`);
}

const sansSignal = rows.filter((r) => {
	const v = classerPortee(r.org_hint, r.titre_brut ?? "");
	return v.portee === "a_revoir";
});

if (!APPLY) {
	console.log(`\nDry-run. ${sortants.length} rejet(s) et ${ARCHIVER ? sansSignal.length : 0} archivage(s) possibles — rien n'a été modifié.`);
	process.exit(0);
}

await withTransaction(async (client) => {
	await client.query(
		`UPDATE quarantine_raw SET status = 'rejected'
		  WHERE id = ANY($1::bigint[]) AND status = 'pending'`,
		[sortants.map((s) => s.id)],
	);
	await client.query(
		`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
		 SELECT 'review.decided', 'quarantine:' || d.id,
		        'triage automatique : hors périmètre',
		        jsonb_build_object('quarantineId', d.id, 'motif', d.motif, 'regle', 'portee@1'),
		        'moteur:triage', now()
		   FROM unnest($1::bigint[], $2::text[]) AS d(id, motif)`,
		[
			sortants.map((s) => s.id),
			sortants.map((s) => classerPortee(s.org_hint, s.titre_brut ?? "").motif),
		],
	);
});

if (ARCHIVER && sansSignal.length > 0) {
	await withTransaction(async (client) => {
		await client.query(
			`UPDATE quarantine_raw SET status = 'reviewed'
			  WHERE id = ANY($1::bigint[]) AND status = 'pending'`,
			[sansSignal.map((s) => s.id)],
		);
		await client.query(
			`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
			 SELECT 'review.decided', 'quarantine:' || d.id,
			        'archivage : aucun indice, non jugée',
			        jsonb_build_object('quarantineId', d.id, 'motif', 'aucun-indice', 'regle', 'archive@1'),
			        'moteur:triage', now()
			   FROM unnest($1::bigint[]) AS d(id)`,
			[sansSignal.map((s) => s.id)],
		);
	});
	console.log(`${sansSignal.length} revendication(s) archivée(s) sans jugement, consignées au journal.`);
}

console.log(`\n${sortants.length} revendication(s) sortie(s) de la file, consignées au journal.`);
process.exit(0);
