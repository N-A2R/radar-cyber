/**
 * Counts the verified active sources of the versioned Nouvelle-Aquitaine corpus.
 *
 * A source is active when it carries an HTTP 200 proof and at least one item
 * built from visible page text. The command is offline and deterministic.
 *
 * Usage:
 *   node scripts/measure-active-sources.mts [input.jsonl]
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { OUTPUT, countActiveSources, type VerifiedSource } from "./generer-sources-actives.mts";

export async function measure(input: string = OUTPUT): Promise<number> {
	const lines = (await readFile(input, "utf8")).split("\n").filter((line) => line.trim().length > 0);
	const sources = lines.map((line) => JSON.parse(line) as VerifiedSource);
	return countActiveSources(sources);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const input = process.argv[2];
	console.log(await measure(input));
}
