/**
 * Construit le corpus des sites de mairies des communes de Nouvelle-Aquitaine.
 *
 * La liste des communes provient de la source INSEE publique exposée par
 * `https://geo.api.gouv.fr/communes` (code région INSEE 75), avec les champs
 * `nom,code,codeDepartement,population`. Seules les communes dont la
 * population est strictement supérieure à 10 000 sont retenues.
 *
 * Pour chaque commune, quatre URL candidates sont sondées dans l'ordre :
 * `https://mairie-<slug>.fr`, `https://mairie-<compact>.fr`,
 * `https://<slug>.fr`, `https://<compact>.fr` (slug ASCII minuscule à
 * séparateurs `-`, variante compacte sans tirets). Un site n'est confirmé
 * que si la requête GET répond strictement HTTP 200 ; on s'arrête au premier
 * succès. Les doublons d'URL sont ignorés et la concurrence est bornée.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/corpus-communes.mts                    # rapport, aucune écriture
 *   apps/api/node_modules/.bin/tsx scripts/corpus-communes.mts --appliquer         # écrit bench/corpus/communes.jsonl
 *   apps/api/node_modules/.bin/tsx scripts/corpus-communes.mts --help
 *
 * Par défaut, le script affiche seulement un rapport. `--appliquer` écrit
 * `bench/corpus/communes.jsonl` : une ligne JSON par commune, avec les clés
 * `nom`, `code_insee`, `departement`, `url` et `statut`, triées par code INSEE.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API_COMMUNES = "https://geo.api.gouv.fr/communes?codeRegion=75&fields=nom,code,codeDepartement,population&format=json";
const USER_AGENT = "RadarCyberCorpusCommunes/1.0";
const TIMEOUT_MS = 5_500;
const CONCURRENCE = 8;
const OUTPUT_FILE = fileURLToPath(new URL("../bench/corpus/communes.jsonl", import.meta.url));

interface Commune {
	nom: string;
	code: string;
	departement: string;
	population: number;
}

interface Ligne {
	nom: string;
	code_insee: string;
	departement: string;
	url: string | null;
	statut: number | null;
}

function usage(): string {
	return [
		"Usage : tsx scripts/corpus-communes.mts [--appliquer]",
		"  défaut       : rapport des communes et des sites confirmés, aucune écriture",
		"  --appliquer  : écrit bench/corpus/communes.jsonl (une ligne JSON par commune)",
		"  --help, -h   : affiche cette aide",
	].join("\n");
}

function parseArgs(argv: string[]): { apply: boolean } {
	let apply = false;
	for (const arg of argv) {
		if (arg === "--appliquer") apply = true;
		else if (arg === "--help" || arg === "-h") {
			process.stdout.write(usage() + "\n");
			process.exit(0);
		} else {
			throw new Error(`argument inconnu : ${arg}`);
		}
	}
	return { apply };
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function recupererCommunes(): Promise<Commune[]> {
	let response: Response;
	try {
		response = await fetch(API_COMMUNES, {
			method: "GET",
			headers: { "user-agent": USER_AGENT, accept: "application/json" },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch (error) {
		throw new Error(`impossible de récupérer la liste des communes sur ${API_COMMUNES} : ${message(error)}`);
	}
	if (response.status !== 200) {
		await response.body?.cancel().catch(() => {});
		throw new Error(`liste des communes : HTTP ${String(response.status)} attendu 200`);
	}

	let parsed: unknown;
	try {
		parsed = await response.json();
	} catch (error) {
		throw new Error(`liste des communes : JSON illisible : ${message(error)}`);
	}
	if (!Array.isArray(parsed)) throw new Error("liste des communes : tableau JSON attendu");

	const communes: Commune[] = [];
	for (const record of parsed) {
		if (record === null || typeof record !== "object" || Array.isArray(record)) {
			throw new Error("liste des communes : entrée invalide");
		}
		const entree = record as Record<string, unknown>;
		const { nom, code, codeDepartement, population } = entree;
		if (typeof nom !== "string" || typeof code !== "string" || typeof codeDepartement !== "string") {
			throw new Error(`liste des communes : champs manquants pour ${JSON.stringify(entree)}`);
		}
		if (typeof population !== "number" || !Number.isFinite(population)) continue;
		if (population <= 10_000) continue;
		communes.push({ nom, code, departement: codeDepartement, population });
	}
	return communes;
}

function slugify(value: string): string {
	return value
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

async function confirme(url: string): Promise<number | null> {
	try {
		const response = await fetch(url, {
			method: "GET",
			headers: { "user-agent": USER_AGENT, accept: "*/*" },
			redirect: "follow",
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		await response.body?.cancel().catch(() => {});
		return response.status === 200 ? 200 : null;
	} catch {
		return null;
	}
}

async function sonder(commune: Commune): Promise<Ligne> {
	const slug = slugify(commune.nom);
	const compact = slug.replace(/-/g, "");
	const candidats = [...new Set([
		slug === "" ? null : `https://mairie-${slug}.fr`,
		compact === "" ? null : `https://mairie-${compact}.fr`,
		slug === "" ? null : `https://${slug}.fr`,
		compact === "" ? null : `https://${compact}.fr`,
	].filter((url): url is string => url !== null))];

	for (const url of candidats) {
		const statut = await confirme(url);
		if (statut === 200) {
			return { nom: commune.nom, code_insee: commune.code, departement: commune.departement, url, statut };
		}
	}
	return { nom: commune.nom, code_insee: commune.code, departement: commune.departement, url: null, statut: null };
}

async function sonderToutes(communes: Commune[]): Promise<Ligne[]> {
	const lignes: (Ligne | undefined)[] = new Array(communes.length);
	let suivant = 0;
	const travailleur = async (): Promise<void> => {
		while (true) {
			const index = suivant++;
			if (index >= communes.length) return;
			lignes[index] = await sonder(communes[index]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCE, communes.length) }, travailleur));
	return lignes.filter((ligne): ligne is Ligne => ligne !== undefined);
}

async function main(): Promise<void> {
	const { apply } = parseArgs(process.argv.slice(2));
	const communes = await recupererCommunes();
	const lignes = await sonderToutes(communes);
	lignes.sort((a, b) => (a.code_insee < b.code_insee ? -1 : a.code_insee > b.code_insee ? 1 : 0));
	const confirmes = lignes.filter((ligne) => ligne.statut === 200).length;

	console.log(`communes (population > 10000) : ${String(lignes.length)}`);
	console.log(`sites confirmés (HTTP 200) : ${String(confirmes)}`);
	if (!apply) {
		console.log("aucune écriture (ajouter --appliquer pour écrire bench/corpus/communes.jsonl)");
		return;
	}

	await mkdir(dirname(OUTPUT_FILE), { recursive: true });
	const contenu = lignes.map((ligne) => JSON.stringify(ligne)).join("\n");
	await writeFile(OUTPUT_FILE, contenu === "" ? "" : `${contenu}\n`, "utf8");
	console.log(`écrit : ${OUTPUT_FILE} (${String(lignes.length)} ligne(s))`);
}

try {
	await main();
} catch (error) {
	process.stderr.write(`corpus-communes: ${message(error)}\n`);
	process.exitCode = 1;
}
