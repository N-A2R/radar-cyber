/**
 * Réparation des rattachements posés par la règle de jetons fautive.
 *
 * Le moteur de corrélation exigeait « tous les jetons significatifs de
 * l'organisation présents dans le texte », et au moins deux jetons pour
 * éviter les noms génériques. La répétition du nom entre parenthèses —
 * « CODE 202 (CODE 202) » — produisait deux fois le même jeton, ce qui
 * satisfaisait la condition. N'importe quel CVE dont le résumé contient le
 * mot « code » se rattachait donc à cette organisation.
 *
 * Ce script ne devine pas : il recalcule, avec la règle corrigée, quels
 * jetons du nom apparaissent réellement dans le texte de l'événement. Si le
 * compte est inférieur à deux, le rattachement est défait — et le fait est
 * consigné au journal (orgId null), pas effacé.
 *
 *   tsx scripts/repair-rattachements.mts            # dry-run, liste et compte
 *   tsx scripts/repair-rattachements.mts --apply    # défait les liens fautifs
 */
import { query, withTransaction } from "../apps/api/src/db.js";
import { significantTokens } from "../apps/api/src/collectors/correlate.js";

const APPLY = process.argv.includes("--apply");

function normalizeName(s: string): string {
	return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type Ligne = {
	id: string;
	dedup_key: string;
	org_id: number;
	org_name: string;
	title: string | null;
	summary: string | null;
};

const { rows } = await query<Ligne>(`
	SELECT e.id::text, e.dedup_key, e.org_id, o.name AS org_name, e.title, e.summary
	  FROM event e JOIN org o ON o.id = e.org_id
`);

const fautifs: Ligne[] = [];
for (const r of rows) {
	const texte = ` ${normalizeName(`${r.title ?? ""} ${r.summary ?? ""}`)} `;
	const jetons = significantTokens(normalizeName(r.org_name));
	// La règle réparée : au moins deux jetons distincts, et tous présents.
	const corrobores = jetons.filter((t) => texte.includes(` ${t} `));
	if (jetons.length < 2 || corrobores.length < 2) fautifs.push(r);
}

console.log(`Rattachements examinés : ${rows.length}`);
console.log(`Fautifs (moins de deux jetons distincts corroborés) : ${fautifs.length}`);

const parOrg = new Map<string, number>();
for (const f of fautifs) parOrg.set(f.org_name, (parOrg.get(f.org_name) ?? 0) + 1);
console.log("\nOrganisations les plus touchées :");
for (const [nom, n] of [...parOrg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
	console.log(`  ${n.toString().padStart(5)}  ${nom}`);
}

if (!APPLY) {
	console.log("\nDry-run. Relancer avec --apply pour défaire ces liens.");
	process.exit(0);
}

await withTransaction(async (client) => {
	await client.query(
		`UPDATE event e SET org_id = NULL
		  WHERE e.id = ANY($1::bigint[])`,
		[fautifs.map((f) => f.id)],
	);
	await client.query(
		`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
		 SELECT 'event.rattachement', e.dedup_key,
		        'réparation : rattachement défait (jetons génériques)',
		        jsonb_build_object('orgId', NULL, 'orgRetiree', d.org_id, 'regle', 'repair-jetons'),
		        'humain:reparation', now()
		   FROM unnest($1::text[], $2::int[]) AS d(dedup_key, org_id)
		   JOIN event e ON e.dedup_key = d.dedup_key`,
		[fautifs.map((f) => f.dedup_key), fautifs.map((f) => f.org_id)],
	);
});

console.log(`\n${fautifs.length} rattachement(s) défait(s), consignés au journal.`);
process.exit(0);
