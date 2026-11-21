import { ratio } from "rapidfuzz-js/fuzz";
import { closePools, query } from "./src/db.js";
import { loadOrgIndex, normalizeName } from "./src/quarantine/promote.js";
import { buildSimilarityIndex } from "./src/quarantine/contexte.js";

const orgs = await loadOrgIndex();
const index = buildSimilarityIndex(orgs);
const rows = (await query<{ org_hint: string | null }>(
	"SELECT org_hint FROM quarantine_raw WHERE kind='claim' AND status='pending' AND org_hint IS NOT NULL ORDER BY received_at DESC, id DESC LIMIT 50",
)).rows;
let mapMs = 0;
let ratioMs = 0;
let gramsTotal = 0;
let poolTotal = 0;
for (const row of rows) {
	const key = normalizeName(row.org_hint ?? "");
	const grams = [...new Set([...key].slice(0, -1).map((_, i) => key.slice(i, i + 2)))];
	gramsTotal += grams.length;
	let t = performance.now();
	const comptes = new Map<number, number>();
	for (const gram of grams) for (const p of index.byGram.get(gram) ?? []) comptes.set(p, (comptes.get(p) ?? 0) + 1);
	mapMs += performance.now() - t;
	const pool = [...comptes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400).map(([p]) => orgs[p]);
	poolTotal += pool.length;
	t = performance.now();
	for (const entry of pool) ratio(key, entry.nameNorm);
	ratioMs += performance.now() - t;
}
console.log({ mapMs: mapMs.toFixed(1), ratioMs: ratioMs.toFixed(1), gramsTotal, poolTotal });
await closePools();
