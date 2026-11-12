/**
 * Banc « référentiel × moteur de rattachement », à l'échelle réelle.
 *
 * Question posée : si un article dit « la mairie de X a été visée », le moteur
 * retrouve-t-il la bonne commune parmi les 4 462 organisations du référentiel ?
 * On balaie **toutes** les communes, pas un échantillon choisi à la main.
 *
 * Trois issues possibles, comptées séparément :
 *   - rattachement correct ;
 *   - abstention (le moteur expose des candidats à égalité) ;
 *   - erreur (mauvaise organisation).
 *
 * Mesure aussi le coût de construction de l'index et la latence de décision,
 * parce qu'un index dix fois plus gros qu'avant doit rester utilisable en ligne.
 *
 *   tsx bench/referentiel/probe-match.mts
 *   tsx bench/referentiel/probe-match.mts --json bench/results/NA-match.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { planReferentiel } from "../../apps/api/src/referentiel/plan.js";
import type { ReferentielNA } from "../../apps/api/src/referentiel/model.js";
import { analyzeAliasIndex, buildAliasIndex } from "../../apps/api/src/match/core.js";

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;

const data = JSON.parse(
	readFileSync(new URL("../../db/data/referentiel-na.json", import.meta.url), "utf8"),
) as ReferentielNA;
const plan = planReferentiel(data);

// org_id synthétique = position + 1 : le banc ne touche pas la base.
const idBySlug = new Map(plan.orgs.map((org, index) => [org.slug, index + 1]));
const rows = plan.orgs.flatMap((org) =>
	org.aliases.map((alias) => ({
		org_id: idBySlug.get(org.slug)!,
		name: org.name,
		alias: alias.alias,
	})),
);

const buildStart = performance.now();
const index = buildAliasIndex(rows);
const buildMs = performance.now() - buildStart;

const nameById = new Map(plan.orgs.map((org, index) => [index + 1, org.name]));
const communes = plan.orgs.filter((org) => org.sector === "commune");
const nameCounts = new Map<string, number>();
for (const org of communes) {
	const key = (org.city ?? "").toLowerCase();
	nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
}

type Outcome = "correct" | "abstention" | "erreur";
const templates: Array<{ id: string; render: (name: string) => string }> = [
	{ id: "mairie-de", render: (n) => `La mairie de ${n} a été visée par un rançongiciel` },
	{ id: "ville-de", render: (n) => `La ville de ${n} annonce une fuite de données` },
	{ id: "commune-de", render: (n) => `Un incident confirmé à la commune de ${n}` },
	{ id: "nu-contexte", render: (n) => `La mairie de ${n} indique que ses services sont interrompus` },
];

const results: Array<Record<string, unknown>> = [];
const failures: Array<Record<string, unknown>> = [];

for (const template of templates) {
	const counts: Record<Outcome, number> = { correct: 0, abstention: 0, erreur: 0 };
	const latencies: number[] = [];
	let correctOnHomonyms = 0;
	let homonyms = 0;

	for (const org of communes) {
		const name = org.city ?? "";
		const text = template.render(name);
		const started = performance.now();
		const analysis = analyzeAliasIndex(index, text);
		latencies.push(performance.now() - started);

		const expected = idBySlug.get(org.slug)!;
		const isHomonym = (nameCounts.get(name.toLowerCase()) ?? 0) > 1;
		if (isHomonym) homonyms++;

		let outcome: Outcome;
		if (analysis.match === null) {
			outcome = "abstention";
		} else if (analysis.match.orgId === expected) {
			outcome = "correct";
			if (isHomonym) correctOnHomonyms++;
		} else {
			outcome = "erreur";
		}
		counts[outcome]++;
		if (outcome === "erreur" && failures.length < 40) {
			failures.push({
				template: template.id,
				attendu: org.name,
				dept: org.dept,
				obtenu: analysis.match ? nameById.get(analysis.match.orgId) ?? `#${analysis.match.orgId}` : null,
				texte: text,
			});
		}
	}

	latencies.sort((a, b) => a - b);
	const total = communes.length;
	results.push({
		template: template.id,
		total,
		correct: counts.correct,
		abstention: counts.abstention,
		erreur: counts.erreur,
		tauxCorrect: Number((counts.correct / total).toFixed(4)),
		tauxErreur: Number((counts.erreur / total).toFixed(4)),
		communesHomonymes: homonyms,
		correctSurHomonymes: correctOnHomonyms,
		latenceP50Ms: Number(latencies[Math.floor(latencies.length * 0.5)].toFixed(3)),
		latenceP95Ms: Number(latencies[Math.floor(latencies.length * 0.95)].toFixed(3)),
	});
}

// EPCI, départements, région : quelques phrases réalistes, pas de balayage.
const institutional = [
	["Bordeaux Métropole", "Bordeaux Métropole signale une intrusion"],
	["CA du Grand Villeneuvois", "La communauté d'agglomération du Grand Villeneuvois est visée"],
	["Département de la Gironde", "Le conseil départemental de la Gironde confirme l'incident"],
	["Région Nouvelle-Aquitaine", "La région Nouvelle-Aquitaine a déposé plainte"],
] as const;
const institutionalResults = institutional.map(([label, text]) => {
	const analysis = analyzeAliasIndex(index, text);
	return {
		label,
		texte: text,
		obtenu: analysis.match ? nameById.get(analysis.match.orgId) ?? null : null,
		motif: analysis.reason,
	};
});

const payload = {
	jeu: data.meta.genereLe,
	organisations: plan.orgs.length,
	alias: rows.length,
	clesIndex: index.byKey.size,
	maxTokens: index.maxTokens,
	constructionIndexMs: Number(buildMs.toFixed(1)),
	communes: communes.length,
	nomsCommunauxHomonymes: [...nameCounts.values()].filter((n) => n > 1).length,
	resultats: results,
	institutions: institutionalResults,
	echecs: failures,
};

console.log(`organisations : ${payload.organisations} | alias : ${payload.alias} | clés d'index : ${payload.clesIndex}`);
console.log(`construction de l'index : ${payload.constructionIndexMs} ms`);
console.log(`communes : ${payload.communes} | noms homonymes : ${payload.nomsCommunauxHomonymes}\n`);
for (const row of results) {
	console.log(
		`${String(row.template).padEnd(14)} correct ${String(row.correct).padStart(4)} ` +
		`(${(Number(row.tauxCorrect) * 100).toFixed(1)} %) | abstention ${String(row.abstention).padStart(3)} ` +
		`| erreur ${String(row.erreur).padStart(3)} | p50 ${row.latenceP50Ms} ms | p95 ${row.latenceP95Ms} ms`,
	);
}
console.log("\ninstitutions :");
for (const row of institutionalResults) {
	console.log(`  ${row.label.padEnd(26)} → ${row.obtenu ?? `(aucun : ${row.motif})`}`);
}
if (failures.length) {
	console.log(`\npremiers_ratages :`);
	for (const failure of failures.slice(0, 8)) {
		console.log(`  attendu ${failure.attendu} (${failure.dept}) → obtenu ${failure.obtenu}`);
	}
}

if (JSON_OUT) {
	mkdirSync(dirname(JSON_OUT), { recursive: true });
	writeFileSync(JSON_OUT, `${JSON.stringify(payload, null, 2)}\n`);
	console.log(`\nécrit ${JSON_OUT}`);
}
