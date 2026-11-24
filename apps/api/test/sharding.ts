/**
 * Répartition déterministe de la suite API entre shards indépendants.
 *
 * Le découpage est public et pur : `--list-shards` permet de vérifier qu'aucun
 * fichier n'est perdu ou dupliqué sans ouvrir PostgreSQL ni lancer de test.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const TEST_DIR = fileURLToPath(new URL("./", import.meta.url));
export const DEFAULT_SHARDS = 2;
export const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

export async function discoverTestFiles(): Promise<string[]> {
	const entries = await readdir(TEST_DIR);
	return entries.filter((f) => f.endsWith(".test.ts")).sort().map((f) => `test/${f}`);
}

/** Round-robin sur la liste triée : unordered, stable et sans doublon. */
export function shardFiles(files: readonly string[], count: number): string[][] {
	const shards: string[][] = Array.from({ length: count }, () => []);
	[...files].sort().forEach((file, index) => {
		shards[index % count]!.push(file);
	});
	return shards;
}

export type ControllerArgs = {
	shards: number;
	concurrency: number;
	timeoutMs: number;
	listShards: boolean;
	help: boolean;
	flags: string[];
	files: string[];
};

function positiveInt(value: string | undefined, label: string): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		throw new Error(`${label} doit être un entier positif (reçu: ${value ?? "rien"})`);
	}
	return parsed;
}

/** Options du contrôleur, distinctes des drapeaux transmis à `tsx --test`. */
export function parseControllerArgs(argv: readonly string[]): ControllerArgs {
	let shards = DEFAULT_SHARDS;
	let concurrency = 0;
	let timeoutMs = DEFAULT_TIMEOUT_MS;
	let listShards = false;
	let help = false;
	const flags: string[] = [];
	const files: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg === "--list-shards") { listShards = true; continue; }
		if (arg === "--help" || arg === "-h") { help = true; continue; }
		if (arg === "--shards" || arg.startsWith("--shards=")) {
			shards = positiveInt(arg === "--shards" ? argv[++i] : arg.slice("--shards=".length), "--shards");
			continue;
		}
		if (arg === "--concurrency" || arg.startsWith("--concurrency=")) {
			concurrency = positiveInt(
				arg === "--concurrency" ? argv[++i] : arg.slice("--concurrency=".length),
				"--concurrency"
			);
			continue;
		}
		if (arg === "--timeout-ms" || arg.startsWith("--timeout-ms=")) {
			timeoutMs = positiveInt(
				arg === "--timeout-ms" ? argv[++i] : arg.slice("--timeout-ms=".length),
				"--timeout-ms"
			);
			continue;
		}
		// Le mode classique interdit déjà `--test-force-exit` : le mode shardié ne
		// doit pas offrir un contournement silencieux de la garde anti-handles.
		if (arg.startsWith("--test-force-exit") || arg.startsWith("--test-concurrency")) {
			throw new Error(`${arg} n'est pas autorisé en mode shardié (un handle ouvert doit échouer)`);
		}
		if (arg.startsWith("-")) flags.push(arg);
		else files.push(arg);
	}

	if (concurrency === 0) concurrency = shards;
	if (concurrency > shards) throw new Error("--concurrency ne peut pas dépasser --shards");
	return { shards, concurrency, timeoutMs, listShards, help, flags, files };
}

export const USAGE = `Usage : tsx test/run-sharded.ts [options] [fichiers...]

Répartit les fichiers test/*.test.ts entre N shards, chacun avec sa base jetable.

Options :
  --shards=N            nombre de shards (défaut : ${DEFAULT_SHARDS})
  --concurrency=N       workers simultanés, <= shards (défaut : shards)
  --timeout-ms=N        garde anti-handle par worker (défaut : ${DEFAULT_TIMEOUT_MS} ms)
  --list-shards         affiche le découpage sans base ni exécution
  --experimental-test-coverage  et autres drapeaux --test-* : transmis aux workers
  -h, --help            cette aide

Le mode sûr reste \`pnpm test\` (test/run.ts, une seule base, --test-concurrency=1).
--test-force-exit et --test-concurrency sont refusés : ils masqueraient un handle ouvert.`;
