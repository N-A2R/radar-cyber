/**
 * Découpage déterministe des fichiers `test/*.test.ts`, récursivement, pour la CI en matrix.
 *
 * La découverte est récursive et inclut `test/objectifs/`. Ces tests restent
 * sous la responsabilité du job nightly `objectives` (voir ci.yml) : le plan
 * des shards les exclut par défaut pour ne pas les jouer à chaque PR ni les
 * doubler en nightly. `--objectifs` permet d'auditer le plan complet, utilisé
 * quand le label `full-ci` force tous les tests sur une PR.
 *
 * Les mêmes règles sont utilisées par chaque shard et par la vérification :
 * les fichiers sont placés du plus lourd au plus léger sur le shard le moins
 * chargé, puis triés dans chaque shard. Le poids vient de `shard-weights.json`
 * (durées mesurées en ms) quand ce fichier existe ; sinon il reste une
 * estimation (démarrage du process + taille du fichier). Aucun doublon, aucun
 * oubli, plan auditable.
 *
 *   tsx test/shard-files.ts --shards=8 --index=1              # fichiers du shard 1
 *   tsx test/shard-files.ts --shards=8 --list --check         # plan de la matrix
 *   tsx test/shard-files.ts --shards=8 --list --check --objectifs
 */
import { readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEST_DIR = fileURLToPath(new URL("./", import.meta.url));
export const DEFAULT_SHARDS = 6;
const TEST_PREFIX = "test/";
const OBJECTIFS_DIR = "test/objectifs/";

/** Coût fixe d'un fichier : lancement du process tsx/Node. */
const FILE_STARTUP_WEIGHT = 500;
const WEIGHTS_FILE = fileURLToPath(new URL("./shard-weights.json", import.meta.url));
const weights = new Map<string, number>();
let measuredWeights: Map<string, number> | undefined;

/** Test réservé à la nightly, hors shards et canari par défaut. */
export function isObjectifTest(file: string): boolean {
	return file.startsWith(OBJECTIFS_DIR);
}

/** Tous les tests découverts, y compris ceux du job nightly `objectives`. */
export async function discoverTestFiles(): Promise<string[]> {
	const found: string[] = [];
	const walk = async (dir: string, prefix: string): Promise<void> => {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			const path = join(dir, entry.name);
			const relative = `${prefix}${entry.name}`;
			if (entry.isDirectory()) await walk(path, `${relative}/`);
			else if (entry.isFile() && entry.name.endsWith(".test.ts")) found.push(`${TEST_PREFIX}${relative}`);
		}
	};
	await walk(TEST_DIR, "");
	return found.sort();
}

/** Tests des shards : `test/objectifs/` est géré par le job nightly dédié. */
export async function discoverShardTestFiles(): Promise<string[]> {
	return (await discoverTestFiles()).filter((file) => !isObjectifTest(file));
}

/**
 * Durées mesurées (ms) produites par le collecteur CI. Un fichier absent,
 * illisible ou invalide ne bloque pas le planning : les entrées exploitables
 * sont utilisées, les autres retombent sur `estimatedWeight`.
 */
function loadMeasuredWeights(): ReadonlyMap<string, number> {
	if (measuredWeights) return measuredWeights;
	measuredWeights = new Map();
	try {
		const parsed: unknown = JSON.parse(readFileSync(WEIGHTS_FILE, "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return measuredWeights;
		for (const [file, value] of Object.entries(parsed)) {
			if (!/^test\/(?:[^/]+\/)*[^/]+\.test\.ts$/.test(file)) continue;
			if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
			measuredWeights.set(file, value);
		}
	} catch (erreur) {
		if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") {
			console.error(`shard-weights.json illisible, estimation par taille : ${String(erreur)}`);
		}
	}
	return measuredWeights;
}

/**
 * Poids retenu : durée mesurée si disponible, sinon démarrage du process
 * plus nombre de lignes du fichier.
 */
export function estimatedWeight(file: string): number {
	const measured = loadMeasuredWeights().get(file);
	if (measured !== undefined) return measured;
	const cached = weights.get(file);
	if (cached !== undefined) return cached;
	let weight = FILE_STARTUP_WEIGHT;
	try {
		const relative = file.startsWith(TEST_PREFIX) ? file.slice(TEST_PREFIX.length) : file;
		const source = readFileSync(join(TEST_DIR, relative), "utf8");
		weight += source.split("\n").length;
	} catch {
		// Fichier absent : il sera quand même placé, le plan --check le verra.
	}
	weights.set(file, weight);
	return weight;
}

/**
 * Répartition LPT (longest processing time) : chaque fichier va au shard
 * dont la charge estimée est la plus faible. Déterministe : poids décroissant,
 * puis nom, puis index de shard.
 */
export function shardFiles(files: readonly string[], shards: number, index: number): string[] {
	if (shards < 1 || index < 1 || index > shards) return [];
	const groups = Array.from({ length: shards }, () => ({ load: 0, files: [] as string[] }));
	const ordered = [...files].sort((a, b) => {
		const byWeight = estimatedWeight(b) - estimatedWeight(a);
		return byWeight !== 0 ? byWeight : a.localeCompare(b);
	});
	for (const file of ordered) {
		let target = 0;
		for (let i = 1; i < groups.length; i += 1) {
			if (groups[i]!.load < groups[target]!.load) target = i;
		}
		groups[target]!.load += estimatedWeight(file);
		groups[target]!.files.push(file);
	}
	return groups[index - 1]!.files.sort();
}

function positiveInt(value: string | undefined, label: string): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		throw new Error(`${label} doit être un entier positif (reçu : ${value ?? "rien"})`);
	}
	return parsed;
}

const USAGE = `Usage : tsx test/shard-files.ts --shards=N (--index=I | --list --check)

  --shards=N    nombre de shards (défaut : ${DEFAULT_SHARDS})
  --index=I     affiche les fichiers du shard I, un par ligne
  --list        affiche le plan complet
  --check       vérifie le plan (aucun doublon, aucune perte, aucun shard vide)
  --objectifs   inclut test/objectifs/*.test.ts (job nightly, label full-ci)
`;

async function main(): Promise<number> {
	let shards = DEFAULT_SHARDS;
	let index = 0;
	let list = false;
	let check = false;
	let includeObjectifs = false;
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg === "--list") { list = true; continue; }
		if (arg === "--check") { check = true; continue; }
		if (arg === "--objectifs") { includeObjectifs = true; continue; }
		if (arg === "--help" || arg === "-h") { console.log(USAGE); return 0; }
		if (arg === "--shards" || arg.startsWith("--shards=")) {
			shards = positiveInt(arg === "--shards" ? argv[++i] : arg.slice("--shards=".length), "--shards");
			continue;
		}
		if (arg === "--index" || arg.startsWith("--index=")) {
			index = positiveInt(arg === "--index" ? argv[++i] : arg.slice("--index=".length), "--index");
			continue;
		}
		throw new Error(`option inconnue : ${arg}`);
	}

	const files = includeObjectifs ? await discoverTestFiles() : await discoverShardTestFiles();
	if (files.length === 0) throw new Error("aucun fichier test/*.test.ts découvert (récursif)");
	if (index > shards) throw new Error(`--index=${index} hors limites (1..${shards})`);

	if (list || check) {
		if (check && files.length < shards) {
			throw new Error(`${files.length} fichiers pour ${shards} shards : réduire --shards`);
		}
		const seen = new Set<string>();
		for (let i = 1; i <= shards; i++) {
			const group = shardFiles(files, shards, i);
			console.log(`shard ${i}/${shards} (${group.length}) : ${group.join(" ")}`);
			if (!check) continue;
			if (group.length === 0) throw new Error(`shard ${i} vide`);
			for (const file of group) {
				if (seen.has(file)) throw new Error(`fichier dupliqué : ${file}`);
				seen.add(file);
			}
		}
		if (check) {
			for (const file of files) {
				if (!seen.has(file)) throw new Error(`fichier perdu : ${file}`);
			}
			console.log(`vérification OK : ${files.length} fichiers, ${seen.size} assignés, 0 doublon`);
		}
		return 0;
	}

	if (index === 0) throw new Error("indiquer --index=I ou --list --check");
	console.log(shardFiles(files, shards, index).join("\n"));
	return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().then(
		(code) => { process.exitCode = code; },
		(err: unknown) => { console.error(err); process.exitCode = 1; },
	);
}
