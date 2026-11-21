/**
 * Consolidation du corpus de couverture — `scripts/consolider-corpus-couverture.mts`.
 *
 * Lit `bench/couverture/*.jsonl`, vérifie le contrat de chaque ligne, déduplique
 * par `id`, trie par `id`, puis calcule le SHA-256 des octets canoniques ainsi
 * obtenus. L'empreinte est écrite dans `bench/couverture/HASH` et sert de
 * signature au jeu d'incidents mesuré par `scripts/mesure-couverture-systeme.mts`.
 *
 *   tsx scripts/consolider-corpus-couverture.mts
 *   tsx scripts/consolider-corpus-couverture.mts --check
 *
 * `--check` ne écrit rien et échoue si l'empreinte publiée ne correspond plus
 * au corpus : c'est le garde-fou contre un chiffre citant le mauvais corpus.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { consoliderCorpus, DOSSIER_CORPUS } from "../apps/api/src/analyse/corpus-couverture.js";

const FICHIER_HASH = join(DOSSIER_CORPUS, "HASH");

function main(): void {
	const verifier = process.argv.includes("--check");
	const corpus = consoliderCorpus(DOSSIER_CORPUS);
	if (verifier) {
		const publie = existsSync(FICHIER_HASH) ? readFileSync(FICHIER_HASH, "utf8").trim() : "";
		if (publie !== corpus.sha256) {
			throw new Error(`empreinte ${FICHIER_HASH} divergent : publié ${publie || "(absent)"} / calculé ${corpus.sha256}`);
		}
		console.log(`empreinte conforme : ${corpus.sha256}`);
		return;
	}
	writeFileSync(FICHIER_HASH, `${corpus.sha256}\n`, "utf8");
	console.log(`${corpus.incidents.length} incidents consolidés (${corpus.fichiers.join(", ")})`);
	if (corpus.doublons.length > 0) console.log(`doublons ignorés : ${corpus.doublons.join(", ")}`);
	console.log(`${corpus.sha256}  ${FICHIER_HASH}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	try {
		main();
	} catch (error: unknown) {
		console.error(error);
		process.exitCode = 1;
	}
}
