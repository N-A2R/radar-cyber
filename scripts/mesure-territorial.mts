/**
 * Mesure du filtre territorial.
 *
 * Deux questions, deux réponses chiffrées :
 *
 *  1. Sur les événements en base, combien nomment un département de la
 *     région ? C'est le plafond du rattachement possible : un événement qui
 *     ne parle pas de la région ne peut pas concerner une organisation
 *     régionale.
 *  2. Sur le corpus de référence (incidents régionaux rédigés), combien
 *     nomment leur département ? C'est le coût du filtre : un incident
 *     régional qui ne nomme pas son département sera raté.
 *
 *   tsx scripts/mesure-territorial.mts
 */
import { query } from "../apps/api/src/db.js";
import { verifierTerritorial } from "../apps/api/src/match/territorial.js";
import corpus from "../bench/fixtures/corpus-reference-na.json" with { type: "json" };

type Ligne = { title: string | null; summary: string | null; org_id: number | null };

const { rows } = await query<Ligne>("SELECT title, summary, org_id FROM event");

let regionaux = 0;
let rattaches = 0;
let rattachesHorsRegion = 0;
for (const r of rows) {
	const texte = `${r.title ?? ""} ${r.summary ?? ""}`;
	const verdict = verifierTerritorial(texte);
	if (verdict.regional) regionaux++;
	if (r.org_id !== null) {
		rattaches++;
		if (!verdict.regional) rattachesHorsRegion++;
	}
}

console.log(`Événements en base            : ${rows.length}`);
console.log(`  nomment un département NA   : ${regionaux} (${pct(regionaux, rows.length)})`);
console.log(`  rattachés à une organisation: ${rattaches} (${pct(rattaches, rows.length)})`);
console.log(`  rattachés SANS indice région: ${rattachesHorsRegion}`);

const incidents = corpus.incidents as Array<{ id: string; entite: string; resume: string; departement: string }>;
let corpusRegionaux = 0;
const manquants: string[] = [];
for (const i of incidents) {
	if (verifierTerritorial(`${i.entite} ${i.resume}`).regional) corpusRegionaux++;
	else manquants.push(`${i.id} ${i.entite} (${i.departement})`);
}

console.log("");
console.log(`Corpus de référence           : ${incidents.length}`);
console.log(`  nomment un département NA   : ${corpusRegionaux} (${pct(corpusRegionaux, incidents.length)})`);
if (manquants.length > 0) {
	console.log("  ratés par le filtre :");
	for (const m of manquants) console.log(`    - ${m}`);
}

function pct(n: number, d: number): string {
	return d === 0 ? "—" : `${((n / d) * 100).toFixed(1)} %`;
}
process.exit(0);
