/**
 * Fusionne les durées partielles écrites par `duration-reporter.mjs` dans
 * chaque shard CI en un `shard-weights.json` directement consommable par
 * `shard-files.ts`.
 *
 *   node apps/api/test/merge-durations.mjs OUT.json shard-*.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [out, ...inputs] = process.argv.slice(2);
if (!out || inputs.length === 0) {
	throw new Error("usage : node merge-durations.mjs OUT.json INPUT.json...");
}

const FILE_KEY = /^test\/[^/]+\.test\.ts$/;
const weights = new Map();
for (const input of inputs) {
	const parsed = JSON.parse(readFileSync(input, "utf8"));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`${input} : une map fichier → ms est attendue`);
	}
	for (const [file, value] of Object.entries(parsed)) {
		if (!FILE_KEY.test(file) || typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
		weights.set(file, Math.max(weights.get(file) ?? 0, value));
	}
}
if (weights.size === 0) throw new Error("aucune durée exploitable dans les artifacts");

const sorted = Object.fromEntries([...weights].sort(([a], [b]) => a.localeCompare(b)));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${weights.size} durée(s) fusionnée(s) dans ${out}`);
