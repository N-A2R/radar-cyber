/**
 * Rapport d'anticipation — script reproductible.
 *
 * Lit le corpus de couverture des 50 incidents et l'instantané J-21
 * versionnés, vérifie leur cohérence, puis écrit `docs/anticipation.md`.
 * Sans base, sans réseau, sans horodatage : mêmes entrées, mêmes octets.
 * `--verifier` permet de constater une dérive sans rien écrire (utile en CI).
 * Le corpus JSON historique reste accepté via `--corpus=…json`.
 *
 *   apps/api/node_modules/.bin/tsx scripts/rapport-anticipation.mts
 *   apps/api/node_modules/.bin/tsx scripts/rapport-anticipation.mts --verifier
 *   apps/api/node_modules/.bin/tsx scripts/rapport-anticipation.mts --json=bench/results/anticipation-rapport.json
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	ErreurRapportAnticipation,
	genererRapport,
	lireCorpus,
	lireCorpusJsonl,
	lireInstantanes,
} from "../apps/api/src/analyse/rapport-anticipation.js";

const argv = process.argv.slice(2);
function option(nom: string, defaut: string): string {
	return argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? defaut;
}

const racine = fileURLToPath(new URL("../", import.meta.url));
const cheminCorpus = option("corpus", `${racine}bench/couverture/incidents.jsonl`);
const cheminSnapshot = option("snapshot", `${racine}bench/anticipation/J-21.jsonl`);
const cheminSortie = option("sortie", `${racine}docs/anticipation.md`);
const cheminJson = option("json", "");
const verifier = argv.includes("--verifier");

function empreinte(texte: string): string {
	return createHash("sha256").update(texte).digest("hex");
}

function main(): void {
	const corpusTexte = readFileSync(cheminCorpus, "utf8");
	const snapshotTexte = readFileSync(cheminSnapshot, "utf8");
	const rapport = genererRapport({
		corpus: cheminCorpus.endsWith(".jsonl") ? lireCorpusJsonl(corpusTexte) : lireCorpus(corpusTexte),
		instantanes: lireInstantanes(snapshotTexte),
		empreintes: { corpus: empreinte(corpusTexte), instantane: empreinte(snapshotTexte) },
	});

	if (verifier) {
		const existant = readFileSync(cheminSortie, "utf8");
		if (existant !== rapport.markdown) {
			console.error(`${cheminSortie} : le document ne correspond plus à ses entrées ; le régénérer.`);
			process.exitCode = 1;
			return;
		}
		console.log(`${cheminSortie} : conforme (${rapport.dossiers.length} dossier(s), ${rapport.stats.evenements} événement(s)).`);
		return;
	}

	writeFileSync(cheminSortie, rapport.markdown, "utf8");
	console.log(`${rapport.dossiers.length} incident(s) → ${cheminSortie}`);
	console.log(
		`signaux retenus : ${rapport.resume.avecSignal}/${rapport.resume.faits} ; ` +
			`anomalies signalées : ${rapport.anomalies.length}`,
	);

	if (cheminJson) {
		writeFileSync(
			cheminJson,
			`${JSON.stringify(
				{
					empreintes: { corpus: empreinte(corpusTexte), instantane: empreinte(snapshotTexte) },
					stats: rapport.stats,
					resume: rapport.resume,
					anomalies: rapport.anomalies,
					dossiers: rapport.dossiers.map((d) => ({
						id: d.incident.id,
						entite: d.incident.entite,
						j21: d.instantane.j21,
						verdict: d.verdict,
						evenements: d.instantane.evenements.length,
						sources: d.instantane.sources_actives.length,
						organisations: d.instantane.organisations_citees.length,
						ruptures: d.ruptures.length,
						signaux: d.retenus.length,
						candidats: d.aExaminer.length,
						rattachementsBruites: d.bruits.length,
					})),
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		console.log(`détail machine : ${cheminJson}`);
	}
}

try {
	main();
} catch (erreur) {
	if (erreur instanceof ErreurRapportAnticipation) {
		console.error(`${erreur.code} : ${erreur.message}`);
	} else {
		console.error(erreur);
	}
	process.exitCode = 1;
}
