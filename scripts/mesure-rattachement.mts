/**
 * Mesure du rapprochement des revendications — combien de victimes françaises
 * trouvent une organisation ?
 *
 * Le référentiel connaît le nom de 1 244 048 organisations mais le domaine de
 * 12 seulement. Une revendication qui ne donne qu'un domaine ne pouvait donc
 * rencontrer personne : le domaine est désormais un indice de nom (plafonné à
 * 0,75, sous le seuil automatique de 0,85).
 *
 * Ce script borne la requête aux organisations dont le nom porte les mots du
 * domaine — un sur-ensemble des correspondances possibles — puis applique le
 * moteur tel quel. On mesure le vrai score, pas une approximation.
 *
 *   tsx scripts/mesure-rattachement.mts              # victimes .fr
 *   tsx scripts/mesure-rattachement.mts --all        # toutes les victimes
 *   tsx scripts/mesure-rattachement.mts --limit=500
 */
import { closePools, query } from "../apps/api/src/db.js";
import { loadOrgIndex, matchOrgInIndex, AUTO_MIN_CONFIDENCE } from "../apps/api/src/quarantine/promote.js";

type Args = { all: boolean; limit: number; show: number };

function parseArgs(argv: string[]): Args {
	const arg = (name: string, fallback: number): number => {
		const found = argv.find((a) => a.startsWith(`--${name}=`));
		return found ? Number(found.split("=")[1]) : fallback;
	};
	return { all: argv.includes("--all"), limit: arg("limit", 5000), show: arg("show", 25) };
}

/** Mots du domaine, TLD exclu : « www.black-star.fr » → [black, star]. */
function domainWords(hint: string): string[] {
	const host = hint.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
	const labels = host.split(".").filter(Boolean);
	const stem = labels.slice(0, Math.max(0, labels.length - 1)).join(" ");
	return stem.split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
}

const args = parseArgs(process.argv.slice(2));

const { rows } = await query<{ org_hint: string }>(
	`SELECT DISTINCT org_hint FROM quarantine_raw
	 WHERE promoted = false AND org_hint IS NOT NULL AND org_hint <> ''
	 ${args.all ? "" : "AND org_hint LIKE '%.fr'"}
	 ORDER BY org_hint
	 LIMIT ${args.limit}`,
);

let examined = 0;
let proposed = 0;
let automatic = 0;
const samples: string[] = [];

for (const { org_hint } of rows) {
	const words = domainWords(org_hint);
	if (words.length === 0) continue;
	const where = words.map((_, i) => `name ILIKE $${i + 1}`).join(" AND ");
	const index = await loadOrgIndex({ where, params: words.map((w) => `%${w}%`) });
	examined++;
	const match = matchOrgInIndex(org_hint, index);
	if (!match || match.confidence < 0.5) continue;
	proposed++;
	if (match.confidence >= AUTO_MIN_CONFIDENCE) automatic++;
	const name = index.find((e) => e.id === match.orgId)?.name ?? "?";
	if (samples.length < args.show) {
		samples.push(`${org_hint.padEnd(32)} → ${name.slice(0, 42).padEnd(42)} ${match.confidence.toFixed(2)} via ${match.via}`);
	}
}

console.log(`\nRevendications examinées : ${examined}`);
console.log(`  propositions humaines (≥ 0,50) : ${proposed}`);
console.log(`  dont automatiques (≥ ${AUTO_MIN_CONFIDENCE}) : ${automatic}`);
console.log(`  taux de proposition : ${((100 * proposed) / Math.max(1, examined)).toFixed(1)} %\n`);
for (const line of samples) console.log("  " + line);
console.log("");

await closePools();
