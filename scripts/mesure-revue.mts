/**
 * Mesure de la file de revue avant toute automatisation.
 *
 * Question posée : parmi les revendications en attente, combien le moteur
 * peut-il trancher **sans se tromper** ? On ne décide pas d'une règle
 * d'automatisation avant de connaître ce nombre — sinon on industrialise une
 * erreur, ce qui est exactement ce qui vient d'arriver au rattachement.
 *
 * Trois catégories, mutuellement exclusives :
 *  - `resolvable`     : l'indice désigne une organisation du référentiel ;
 *  - `hint_domaine`   : l'indice est un domaine, sans organisation en face ;
 *  - `hint_texte`     : l'indice est un nom libre, non résolu ;
 *  - `illisible`      : l'indice n'est ni un domaine ni un nom plausible.
 *
 *   tsx scripts/mesure-revue.mts
 */
import { query } from "../apps/api/src/db.js";
import { preparerGazetteer, designateOrganization } from "../apps/api/src/collectors/relevance.js";

const DOMAINE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z]{2,})+$/i;
/** Séparateur utilisé par les sources qui collent des métadonnées à l'indice. */
const SEPARATEUR = /[\\|;]/;

type Ligne = { id: string; org_hint: string | null };

const { rows } = await query<Ligne>(
	"SELECT id::text, org_hint FROM quarantine_raw WHERE status = 'pending' AND kind = 'claim'",
);
await preparerGazetteer();

const compte = { resolvable: 0, hint_domaine: 0, hint_texte: 0, illisible: 0 };
const exemplesResolus: string[] = [];

for (const r of rows) {
	const brut = (r.org_hint ?? "").trim();
	// « dollmar.com\$28.3M\Italy\127GB » : on garde le premier segment.
	const indice = brut.split(SEPARATEUR)[0]?.trim() ?? "";
	if (indice.length < 3 || /\s{3,}/.test(indice) && !/\s/.test(indice.replace(/\s+/g, " "))) {
		compte.illisible++;
		continue;
	}
	const estDomaine = DOMAINE.test(indice);
	const match = designateOrganization(indice);
	if (match?.orgId) {
		compte.resolvable++;
		if (exemplesResolus.length < 8) exemplesResolus.push(`${indice} → org ${match.orgId} (${match.explication?.motif ?? "?"})`);
	} else if (estDomaine) {
		compte.hint_domaine++;
	} else if (/^[\p{L}][\p{L}\p{N} .'&()-]{2,}$/u.test(indice)) {
		compte.hint_texte++;
	} else {
		compte.illisible++;
	}
}

const total = rows.length;
console.log(`Revendications en attente : ${total}`);
for (const [k, n] of Object.entries(compte)) {
	console.log(`  ${k.padEnd(14)} ${String(n).padStart(6)}  (${total ? ((n / total) * 100).toFixed(1) : "0"} %)`);
}
if (exemplesResolus.length > 0) {
	console.log("\nRésolues (échantillon) :");
	for (const e of exemplesResolus) console.log(`  ${e}`);
}
process.exit(0);
