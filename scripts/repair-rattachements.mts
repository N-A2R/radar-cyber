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
import { preparerGazetteer, designateOrganization } from "../apps/api/src/collectors/relevance.js";
import { estTexteFrancais } from "../apps/api/src/match/territorial.js";
import { defaireRattachement } from "../apps/api/src/match/detachement.js";

const APPLY = process.argv.includes("--apply");



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

await preparerGazetteer();

// Le critère est celui du moteur, pas une seconde règle écrite ici : c'est
// précisément la faute qu'on répare. On demande au moteur à quelle
// organisation il rattacherait ce texte aujourd'hui ; si la réponse diffère
// de ce qui est en base, le lien en base vient d'une règle qui n'existe plus.
const fautifs: Ligne[] = [];
for (const r of rows) {
	const texte = `${r.title ?? ""} ${r.summary ?? ""}`;
	// Même verrou que la corrélation : un texte anglais ne désigne pas une
	// organisation régionale.
	const verdict = estTexteFrancais(texte) ? designateOrganization(texte) : null;
	if (!verdict || verdict.orgId !== r.org_id) fautifs.push(r);
}

console.log(`Rattachements examinés : ${rows.length}`);
console.log(`Fautifs (le moteur ne les rattacherait pas ainsi aujourd'hui) : ${fautifs.length}`);

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
	for (const f of fautifs) {
		await defaireRattachement(client, {
			eventId: f.id,
			orgId: f.org_id,
			motif: "jetons génériques",
			regle: "repair-jetons",
			journal: {
				kind: "event.rattachement",
				actor: "humain:reparation",
				summary: "réparation : rattachement défait (jetons génériques)",
				subject: f.dedup_key,
			},
		});
	}
});

console.log(`\n${fautifs.length} rattachement(s) défait(s), consignés au journal.`);
process.exit(0);
