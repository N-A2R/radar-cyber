/**
 * Mesure de couverture du corpus de 20 incidents — point d'entrée reproductible.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-couverture-systeme.mts
 *
 * Le script consolide le corpus, rejoue chaque incident sur la base, publie le
 * rapport JSON et affiche le chiffre. Il n'écrit aucun fichier avec `--stdout`
 * (utilisé par le test d'intégration) et vérifie la publication avec `--check`.
 *
 * Deux exécutions sur une base inchangée produisent le même chiffre et les
 * mêmes octets : la date de calcul vient de la base (dernière collecte), jamais
 * de l'horloge du processus.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import {
	mesurerCouverture,
	type RapportCouverture,
} from "../apps/api/src/analyse/couverture-base.js";
import { consoliderCorpus, DOSSIER_CORPUS } from "../apps/api/src/analyse/corpus-couverture.js";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const SORTIE_DEFAUT = "bench/results/couverture-mesuree.json";

interface Options {
	sortie: string;
	stdout: boolean;
	check: boolean;
}

function parseArgs(argv: string[]): Options {
	const opts: Options = { sortie: SORTIE_DEFAUT, stdout: false, check: false };
	for (const arg of argv) {
		if (arg.startsWith("--json=")) opts.sortie = arg.slice("--json=".length);
		else if (arg === "--stdout") opts.stdout = true;
		else if (arg === "--check") opts.check = true;
		else if (arg === "--help") {
			console.log("Usage: tsx scripts/mesure-couverture-systeme.mts [--json=...] [--stdout] [--check]");
			process.exit(0);
		} else throw new Error(`Option inconnue : ${arg}`);
	}
	return opts;
}

function chaine(valeur: unknown): string {
	return JSON.stringify(valeur);
}

/** Comparaison sur les champs qui font le chiffre, pas sur l'horodatage de publication. */
export function divergences(publie: RapportCouverture, frais: RapportCouverture): string[] {
	const ecarts: string[] = [];
	for (const [cle, a, b] of [
		["hashCorpus", publie.hashCorpus, frais.hashCorpus],
		["vus", publie.global.vus, frais.global.vus],
		["total", publie.global.total, frais.global.total],
		["taux", publie.global.taux, frais.global.taux],
		["publiable", publie.publication?.publiable, frais.publication?.publiable],
		["raison", publie.publication?.raison, frais.publication?.raison],
	] as const) {
		if (a !== b) ecarts.push(`${cle}: publié ${chaine(a)} / script ${chaine(b)}`);
	}
	for (const cle of ["parMotif", "parDepartement", "parType", "incidents"] as const) {
		if (chaine(publie[cle]) !== chaine(frais[cle])) ecarts.push(`${cle}: divergence`);
	}
	return ecarts;
}

async function main(): Promise<void> {
	const opts = parseArgs(process.argv.slice(2));
	try {
		const corpus = consoliderCorpus(DOSSIER_CORPUS);
		const rapport = await mesurerCouverture({ corpus });
		const contenu = `${JSON.stringify(rapport, null, 2)}\n`;

		if (opts.stdout) {
			process.stdout.write(`${JSON.stringify(rapport)}\n`);
			return;
		}
		if (opts.check) {
			const publie = JSON.parse(readFileSync(resolve(RACINE, opts.sortie), "utf8")) as RapportCouverture;
			const ecarts = divergences(publie, rapport);
			if (ecarts.length > 0) {
				throw new Error(`chiffre servi divergent du script : ${ecarts.join(" ; ")}`);
			}
			console.log(`couverture conforme : ${rapport.global.taux} % (${rapport.global.vus}/${rapport.global.total})`);
			return;
		}

		const cible = resolve(RACINE, opts.sortie);
		mkdirSync(dirname(cible), { recursive: true });
		writeFileSync(cible, contenu, "utf8");
		console.log(`corpus : ${corpus.incidents.length} incidents — ${relative(RACINE, DOSSIER_CORPUS)}`);
		console.log(`empreinte SHA-256 : ${corpus.sha256}`);
		console.log(
			`couverture : ${rapport.global.taux} % (${rapport.global.vus}/${rapport.global.total})` +
				` — délai médian ${rapport.delaiMedianHeures ?? "—"} h`,
		);
		console.log(
			"motifs : " +
				rapport.parMotif.map((m) => `${m.motif}=${m.incidents}`).join(" · "),
		);
		console.log(
			rapport.publication.publiable
				? "publication : chiffre publiable (quatre seuils franchis)"
				: `publication : ${rapport.publication.mention} : ${rapport.publication.raison}`,
		);
		console.log(`rapport publié : ${relative(RACINE, cible)}`);
	} finally {
		await closePools();
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	main().catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
