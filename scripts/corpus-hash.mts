/**
 * Empreinte du corpus consolidé — `scripts/corpus-hash.mts`.
 *
 * Le corpus consolidé est l'ensemble des lignes de tous les fichiers
 * `bench/corpus/*.jsonl`. L'empreinte SHA-256 porte sur ces lignes triées
 * octet par octet (ordre UTF-8), chaque ligne étant terminée par `\n` ; les
 * fins de ligne CRLF sont ramenées à LF. Le tri rend l'empreinte indépendante
 * de l'ordre des fichiers et des lignes : ajouter, retirer ou modifier une
 * ligne la change à coup sûr.
 *
 *   tsx scripts/corpus-hash.mts     # écrit bench/corpus/HASH et l'affiche
 *
 * Aucune mesure de couverture ne doit être publiée sans citer cette
 * empreinte (voir `scripts/mesure-couverture.mts`).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CHEMIN_CORPUS = fileURLToPath(new URL("../bench/corpus/", import.meta.url));
export const FICHIER_HASH = join(CHEMIN_CORPUS, "HASH");

/** SHA-256 du corpus consolidé : lignes de tous les *.jsonl triées en UTF-8. */
export function calculerHashCorpus(): string {
	const fichiers = existsSync(CHEMIN_CORPUS)
		? readdirSync(CHEMIN_CORPUS, { withFileTypes: true })
				.filter((entree) => entree.isFile() && entree.name.endsWith(".jsonl"))
				.map((entree) => entree.name)
				.sort()
		: [];
	const lignes: Buffer[] = [];
	for (const nom of fichiers) {
		const morceaux = readFileSync(join(CHEMIN_CORPUS, nom), "utf8").split("\n");
		if (morceaux[morceaux.length - 1] === "") morceaux.pop(); // dernière fin de ligne
		for (const morceau of morceaux) {
			lignes.push(Buffer.from(morceau.endsWith("\r") ? morceau.slice(0, -1) : morceau, "utf8"));
		}
	}
	lignes.sort(Buffer.compare);
	const sha256 = createHash("sha256");
	for (const ligne of lignes) {
		sha256.update(ligne);
		sha256.update("\n");
	}
	return sha256.digest("hex");
}

/** Empreinte publiée, telle qu'une mesure de couverture doit la citer. */
export function lireHashCorpus(): string {
	const hash = readFileSync(FICHIER_HASH, "utf8").trim();
	if (!/^[0-9a-f]{64}$/.test(hash)) {
		throw new Error(`${FICHIER_HASH} ne contient pas un SHA-256 valide : ${hash}`);
	}
	return hash;
}

function estLanceDirectement(): boolean {
	const entre = process.argv[1];
	return entre !== undefined && import.meta.url === pathToFileURL(entre).href;
}

if (estLanceDirectement()) {
	mkdirSync(CHEMIN_CORPUS, { recursive: true });
	const hash = calculerHashCorpus();
	writeFileSync(FICHIER_HASH, `${hash}\n`, "utf8");
	console.log(`${hash}  bench/corpus/HASH`);
}
