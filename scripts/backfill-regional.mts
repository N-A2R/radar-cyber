/**
 * Remplit `event.regional` pour les lignes existantes.
 *
 * Le calcul est celui de `porteeRegionale`, la même fonction que l'ingestion
 * utilisera : une seule définition, pas deux. Une colonne remplie par un script
 * et recalculée autrement à l'écriture divergerait en une semaine.
 *
 *   tsx scripts/backfill-regional.mts            # compte seulement
 *   tsx scripts/backfill-regional.mts --apply
 */
import { query, withClient } from "../apps/api/src/db.js";
import { porteeRegionale } from "../apps/api/src/match/territorial.js";

const APPLY = process.argv.includes("--apply");

type Ligne = { id: string; title: string | null; summary: string | null; org_id: number | null };

const { rows } = await query<Ligne>("SELECT id::text, title, summary, org_id FROM event");

const parMotif = { rattachement: 0, departement: 0, aucun: 0 };
const aMarquer: { id: string; regional: boolean; motif: string }[] = [];

for (const r of rows) {
	const verdict = porteeRegionale(`${r.title ?? ""} ${r.summary ?? ""}`, r.org_id);
	parMotif[verdict.motif]++;
	aMarquer.push({ id: r.id, regional: verdict.regional, motif: verdict.motif });
}

const regionaux = parMotif.rattachement + parMotif.departement;
console.log(`Événements examinés : ${rows.length}`);
console.log(`  régionaux  : ${regionaux} (${((regionaux / Math.max(1, rows.length)) * 100).toFixed(1)} %)`);
console.log(`    par rattachement : ${parMotif.rattachement}`);
console.log(`    par département  : ${parMotif.departement}`);
console.log(`  hors région : ${parMotif.aucun}`);

if (!APPLY) {
	console.log("\nDry-run. Relancer avec --apply pour écrire la colonne.");
	process.exit(0);
}

await withClient(async (client) => {
	await client.query("BEGIN");
	// Mise à jour par lots pour ne pas tenir un verrou sur 19 000 lignes.
	const LOT = 2000;
	for (let i = 0; i < aMarquer.length; i += LOT) {
		const lot = aMarquer.slice(i, i + LOT);
		await client.query(
			`UPDATE event e
			    SET regional = d.regional, regional_motif = d.motif
			   FROM unnest($1::bigint[], $2::boolean[], $3::text[]) AS d(id, regional, motif)
			  WHERE e.id = d.id`,
			[
				lot.map((x) => x.id),
				lot.map((x) => x.regional),
				lot.map((x) => x.motif),
			],
		);
	}
	await client.query("COMMIT");
});

console.log(`\n${regionaux} événement(s) marqué(s) régional(aux).`);
process.exit(0);
