/**
 * Découpage déterministe des fichiers `test/*.test.ts` pour la CI en matrix.
 *
 * Les mêmes règles sont utilisées par chaque shard et par la vérification :
 * liste triée, répartition tournante, aucun fichier dupliqué ou perdu.
 * La rotation évite de regrouper dans un même shard une suite alphabétique
 * de tests lourds ; chaque shard reçoit un échantillon réparti sur tout l'alphabet.
 * Aucune base, aucun test : cette commande sert aussi de plan auditable.
 *
 *   tsx test/shard-files.ts --shards=8 --index=1     # fichiers du shard 1
 *   tsx test/shard-files.ts --shards=8 --list --check
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const TEST_DIR = fileURLToPath(new URL("./", import.meta.url));
export const DEFAULT_SHARDS = 6;

export async function discoverTestFiles(): Promise<string[]> {
	const entries = await readdir(TEST_DIR);
	return entries.filter((f) => f.endsWith(".test.ts")).sort().map((f) => `test/${f}`);
}

/** Répartition tournante : aucun doublon, aucun oubli, tailles à ±1. */
export function shardFiles(files: readonly string[], shards: number, index: number): string[] {
	return files.filter((_, position) => position % shards === index - 1);
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
`;

async function main(): Promise<number> {
	let shards = DEFAULT_SHARDS;
	let index = 0;
	let list = false;
	let check = false;
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg === "--list") { list = true; continue; }
		if (arg === "--check") { check = true; continue; }
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

	const files = await discoverTestFiles();
	if (files.length === 0) throw new Error("aucun fichier test/*.test.ts découvert");
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

main().then(
	(code) => { process.exitCode = code; },
	(err: unknown) => { console.error(err); process.exitCode = 1; }
);
