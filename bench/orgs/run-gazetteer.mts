/**
 * Bench A3 — le gazetteer de production sur le jeu annoté.
 *
 * Les mesures existantes (A1, A2) portaient sur des implémentations qui ne sont
 * plus celles de l'ingestion. Celle-ci porte sur le moteur réellement branché,
 * et — c'est le point du chantier 7 — **découpée par secteur**.
 *
 * Pourquoi par secteur : une précision globale de 0,9 peut cacher un secteur à
 * 0,3. C'est exactement ce que la couverture globale masquait : le radar est bon
 * sur les collectivités et aveugle ailleurs. Un chiffre agrégé ne le dit pas.
 *
 * Aucune base : l'index est construit depuis le jeu, comme le fait
 * `org-gazetteer.ts` en production.
 *
 *   apps/api/node_modules/.bin/tsx bench/orgs/run-gazetteer.mts [--gold=jeu.json] [--json=out.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { buildGazetteer, resoudre, type GazetteerRow } from "../../apps/api/src/match/gazetteer.js";

type Gold = {
	orgs: Array<{ id: number; name: string; kind: string; city: string | null; dept: string | null; aliases: string[] }>;
	cases: Array<{ id: string; text: string; expect: number | null; category: string }>;
};

const goldFile = process.argv.find((a) => a.startsWith("--gold="))?.split("=")[1] ?? "gold-attach.json";
const path = fileURLToPath(new URL(`./${goldFile}`, import.meta.url));
const gold = JSON.parse(readFileSync(path, "utf8")) as Gold;

const rows: GazetteerRow[] = gold.orgs.flatMap((org) =>
	org.aliases.map((alias) => ({
		org_id: org.id,
		name: org.name,
		kind: org.kind,
		dept: org.dept,
		city: org.city,
		sector: org.kind,
		alias,
	})),
);

const t0 = performance.now();
const gaz = buildGazetteer(rows);
const construction = performance.now() - t0;

type Ligne = {
	id: string;
	category: string;
	attendu: number | null;
	obtenu: number | null;
	raison: string;
	ms: number;
};

const lignes: Ligne[] = gold.cases.map((cas) => {
	const debut = performance.now();
	const r = resoudre(gaz, cas.text);
	return {
		id: cas.id,
		category: cas.category,
		attendu: cas.expect,
		obtenu: r.org?.id ?? null,
		raison: r.reason,
		ms: performance.now() - debut,
	};
});

/** Une correspondance compte comme juste si l'organisation attendue est trouvée. */
function metriques(sousEnsemble: Ligne[]) {
	const avecAttendu = sousEnsemble.filter((l) => l.attendu !== null);
	const sansAttendu = sousEnsemble.filter((l) => l.attendu === null);
	const trouves = avecAttendu.filter((l) => l.obtenu === l.attendu);
	const faux = avecAttendu.filter((l) => l.obtenu !== null && l.obtenu !== l.attendu);
	const abstentions = avecAttendu.filter((l) => l.obtenu === null);
	const bruit = sansAttendu.filter((l) => l.obtenu !== null);
	const rappel = avecAttendu.length === 0 ? 0 : trouves.length / avecAttendu.length;
	const precision =
		trouves.length + faux.length === 0 ? 1 : trouves.length / (trouves.length + faux.length);
	return {
		cas: sousEnsemble.length,
		rappel: Math.round(rappel * 1000) / 1000,
		precision: Math.round(precision * 1000) / 1000,
		f1: rappel + precision === 0 ? 0 : Math.round(((2 * rappel * precision) / (rappel + precision)) * 1000) / 1000,
		trouves: trouves.length,
		faux: faux.length,
		abstentions: abstentions.length,
		/** Sur les cas où aucun rattachement n'est attendu : combien de bruit. */
		bruit: bruit.length,
		attendus: avecAttendu.length,
	};
}

// Secteur d'un cas = secteur de l'organisation attendue.
const kindParId = new Map(gold.orgs.map((o) => [o.id, o.kind]));
const parSecteur = new Map<string, Ligne[]>();
for (const ligne of lignes) {
	if (ligne.attendu === null) continue;
	const secteur = kindParId.get(ligne.attendu) ?? "inconnu";
	const liste = parSecteur.get(secteur) ?? [];
	liste.push(ligne);
	parSecteur.set(secteur, liste);
}

const parCategorie = new Map<string, Ligne[]>();
for (const ligne of lignes) {
	const liste = parCategorie.get(ligne.category) ?? [];
	liste.push(ligne);
	parCategorie.set(ligne.category, liste);
}

const latences = lignes.map((l) => l.ms).sort((a, b) => a - b);

const resultat = {
	date: new Date().toISOString().slice(0, 10),
	moteur: "gazetteer@4+context-resolution",
	jeu: { organisations: gold.orgs.length, cas: gold.cases.length, alias: rows.length },
	constructionMs: Math.round(construction),
	latence: {
		p50: Math.round((latences[Math.floor(latences.length / 2)] ?? 0) * 1000) / 1000,
		p95: Math.round((latences[Math.floor(latences.length * 0.95)] ?? 0) * 1000) / 1000,
		max: Math.round((latences.at(-1) ?? 0) * 1000) / 1000,
	},
	global: metriques(lignes),
	parSecteur: Object.fromEntries(
		[...parSecteur.entries()].map(([secteur, liste]) => [secteur, metriques(liste)]),
	),
	parCategorie: Object.fromEntries(
		[...parCategorie.entries()].map(([categorie, liste]) => [categorie, metriques(liste)]),
	),
	echecs: lignes
		.filter((l) => (l.attendu === null && l.obtenu !== null) || (l.attendu !== null && l.obtenu !== l.attendu))
		.map((l) => ({
			id: l.id,
			categorie: l.category,
			attendu: l.attendu === null ? null : (kindParId.get(l.attendu) ?? null),
			obtenu: l.obtenu === null ? null : (kindParId.get(l.obtenu) ?? null),
			raison: l.raison,
		})),
};

console.log(`Gazetteer @ ${resultat.date} — ${gold.cases.length} cas, ${rows.length} alias`);
console.log(
	`global : rappel ${resultat.global.rappel} · précision ${resultat.global.precision} · F1 ${resultat.global.f1}` +
		` · ${resultat.global.faux} faux · ${resultat.global.bruit} bruit sur ${gold.cases.length - resultat.global.attendus} cas sans attendu`,
);
console.log(`latence p50 ${resultat.latence.p50} ms, p95 ${resultat.latence.p95} ms, index ${resultat.constructionMs} ms\n`);

console.log("Par secteur :");
for (const [secteur, m] of Object.entries(resultat.parSecteur).sort((a, b) => b[1].attendus - a[1].attendus)) {
	console.log(
		`  ${secteur.padEnd(14)} ${String(m.trouves).padStart(2)}/${String(m.attendus).padStart(2)}` +
			`  rappel ${m.rappel.toFixed(2)}  précision ${m.precision.toFixed(2)}  F1 ${m.f1.toFixed(2)}`,
	);
}

console.log("\nPar catégorie :");
for (const [categorie, m] of Object.entries(resultat.parCategorie).sort((a, b) => b[1].cas - a[1].cas)) {
	console.log(
		`  ${categorie.padEnd(20)} ${String(m.trouves).padStart(2)}/${String(m.attendus).padStart(2)}` +
			`  F1 ${m.f1.toFixed(2)}  faux ${m.faux}  bruit ${m.bruit}`,
	);
}

const json = process.argv.find((a) => a.startsWith("--json="))?.split("=")[1];
if (json) {
	writeFileSync(json, `${JSON.stringify(resultat, null, 2)}\n`, "utf8");
	console.log(`\nrésultat écrit : ${json}`);
}
