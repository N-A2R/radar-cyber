/**
 * Rapport de benchmark — script reproductible, sans base ni réseau.
 *
 * Lit le corpus témoin, les 12 fichiers départementaux et la mesure GitHub
 * versionnée, puis écrit `docs/benchmark.md`, `docs/benchmark-incidents.md`
 * et `bench/results/benchmark-premier-regard.json`.
 *
 *   apps/api/node_modules/.bin/tsx scripts/rapport-benchmark.mts
 *   apps/api/node_modules/.bin/tsx scripts/rapport-benchmark.mts --verifier
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { calculerBenchmark, construireIncidents } from "../apps/api/src/analyse/benchmark-premier-regard.js";
import { verifierJeuOutils, type JeuOutils } from "../apps/api/src/analyse/benchmark-outils.js";
import { genererRapport, type RapportBenchmark } from "../apps/api/src/analyse/rapport-benchmark.js";

const racine = fileURLToPath(new URL("../", import.meta.url));
const verifier = process.argv.includes("--verifier");

function lireJsonl(chemin: string): Record<string, unknown>[] {
	return readFileSync(chemin, "utf8")
		.split("\n")
		.filter((ligne) => ligne.trim().length > 0)
		.map((ligne) => JSON.parse(ligne) as Record<string, unknown>);
}

function lireEntrees(): { bilan: ReturnType<typeof calculerBenchmark>; jeu: JeuOutils } {
	const texteReference = readFileSync(`${racine}bench/fixtures/corpus-reference-na.json`, "utf8");
	const reference = JSON.parse(texteReference) as Parameters<typeof construireIncidents>[0];
	const fichiers = readdirSync(`${racine}bench/corpus`)
		.filter((nom) => /^incidents-.*\.jsonl$/.test(nom))
		.sort();
	const departementaux = fichiers.flatMap((nom) =>
		lireJsonl(`${racine}bench/corpus/${nom}`) as Parameters<typeof construireIncidents>[1],
	);
	const incidents = construireIncidents(reference, departementaux, 100);
	if (incidents.length !== 100) {
		throw new Error(`${incidents.length} incidents sélectionnés, 100 attendus`);
	}
	const jeu = JSON.parse(
		readFileSync(`${racine}bench/results/benchmark-outils.json`, "utf8"),
	) as JeuOutils;
	verifierJeuOutils(jeu);
	return { bilan: calculerBenchmark(incidents), jeu };
}

function resultatJson(rapport: RapportBenchmark, bilan: ReturnType<typeof calculerBenchmark>, jeu: JeuOutils): string {
	return `${JSON.stringify(
		{
			dateMesure: jeu.dateMesure,
			methode: jeu.methode,
			resume: rapport.resume,
			motsRapport: rapport.mots,
			delaiHeures: bilan.delaiHeures,
			outils: jeu.outils,
			incidents: bilan.lignes.map((ligne) => ({
				id: ligne.id,
				entite: ligne.entite,
				codeDepartement: ligne.codeDepartement,
				dates: ligne.dates,
				premier: ligne.premier,
				dernier: ligne.dernier,
				premierMedia: ligne.premierMedia,
				datePremierMedia: ligne.datePremierMedia,
				delaiHeures: ligne.delaiHeures,
			})),
		},
		null,
		2,
	)}\n`;
}

function ecrireOuVerifier(chemin: string, contenu: string): void {
	if (verifier) {
		const existant = readFileSync(chemin, "utf8");
		if (existant !== contenu) {
			console.error(`${chemin} : le document ne correspond plus à ses entrées ; le régénérer.`);
			process.exitCode = 1;
		}
		return;
	}
	writeFileSync(chemin, contenu, "utf8");
}

function main(): void {
	const { bilan, jeu } = lireEntrees();
	const rapport = genererRapport(bilan, jeu);
	ecrireOuVerifier(`${racine}docs/benchmark.md`, `${rapport.markdown}\n`);
	ecrireOuVerifier(`${racine}docs/benchmark-incidents.md`, rapport.tableauIncidents);
	ecrireOuVerifier(
		`${racine}bench/results/benchmark-premier-regard.json`,
		resultatJson(rapport, bilan, jeu),
	);
	if (verifier) {
		console.log(`benchmark : 3 documents conformes (${rapport.mots} mots)`);
		return;
	}
	console.log(`${bilan.total} incidents → docs/benchmark.md (${rapport.mots} mots)`);
	console.log(
		`radar dernier ${bilan.radarDernier}/${bilan.total} ; premier face à un média daté ` +
			`${bilan.radarPremierFaceMedia}/${bilan.delaiHeures.n} ; médiane ${bilan.delaiHeures.mediane} h`,
	);
}

main();
