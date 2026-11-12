/**
 * Bench A2 — dérive les alias de chaque enregistrement avec le code du repo.
 *
 * Hypothèse testée : les doublons que la similarité de chaînes ne voit pas
 * (« CHU de Bordeaux » vs « Centre Hospitalier Universitaire de Bordeaux »)
 * sont précisément ceux que `deriveAliases` sait produire, puisqu'il fabrique
 * le sigle en plus du nom nettoyé.
 *
 *   apps/api/node_modules/.bin/tsx bench/orgs/derive-aliases.mts > bench/results/A2-aliases.json
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deriveAliases, normalize } from "../../apps/api/src/match/core.js";

const doc = JSON.parse(
	readFileSync(fileURLToPath(new URL("./gold-dedupe.json", import.meta.url)), "utf8"),
) as { records: Array<{ record_id: number; name: string; city: string; dept: string }> };

const out: Record<string, string[]> = {};
for (const record of doc.records) {
	const keys = new Set<string>([normalize(record.name)]);
	for (const alias of deriveAliases(record.name)) keys.add(normalize(alias));
	out[String(record.record_id)] = [...keys].filter((k) => k.length >= 4);
}

process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
