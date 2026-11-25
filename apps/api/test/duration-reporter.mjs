/**
 * Reporter Node : écrit les durées mesurées des fichiers `test/*.test.ts`
 * dans `$RADAR_SHARD_WEIGHTS_OUT` sous la forme `{ "test/foo.test.ts": ms }`.
 *
 * Il ne produit aucune sortie et ne touche pas au code de sortie des tests :
 * la suite reste maîtresse de son verdict. Un fichier tué avant la fin n'a
 * simplement pas d'entrée, et `shard-files.ts` retombe sur son estimation.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = fileURLToPath(new URL("../", import.meta.url));
const FILE_KEY = /^test\/[^/]+\.test\.ts$/;

function fileKey(data) {
	if (!data || typeof data.file !== "string" || data.entryFile !== undefined) return null;
	// Seul l'événement du fichier n'a pas d'`entryFile` ; les tests qu'il
	// contient portent `entryFile` et le nom du `test()`.
	const path = data.file.startsWith("file://") ? fileURLToPath(data.file) : data.file;
	if (!basename(path).endsWith(".test.ts")) return null;
	const key = relative(API_ROOT, resolve(path)).replaceAll("\\", "/");
	return FILE_KEY.test(key) ? key : null;
}

export default async function* durationReporter(source) {
	const durations = new Map();
	for await (const event of source) {
		if (event.type !== "test:complete") continue;
		const key = fileKey(event.data);
		const ms = event.data?.details?.duration_ms;
		if (key && typeof ms === "number" && Number.isFinite(ms) && ms > 0) {
			durations.set(key, Math.max(1, Math.round(ms)));
		}
	}

	const out = process.env.RADAR_SHARD_WEIGHTS_OUT;
	if (!out) return;
	const sorted = Object.fromEntries([...durations].sort(([a], [b]) => a.localeCompare(b)));
	try {
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
	} catch (erreur) {
		// Un artifact indisponible ne doit jamais faire échouer la suite.
		console.error(`collecte des durées impossible : ${String(erreur)}`);
	}
}
