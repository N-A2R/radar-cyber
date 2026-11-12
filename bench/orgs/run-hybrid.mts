/**
 * Bench A1 — mesure le code réellement livré, pas une approximation Python.
 *
 * Enchaîne `analyzeAliasIndex` (cœur) et `fuzzyMatchAlias` (filet) exactement
 * comme `apps/api/src/match/orgs.ts` le fait en ligne : même seuil, mêmes
 * garde-fous, même plafond de confiance. Les chiffres produits sont donc
 * ceux du comportement shipped.
 *
 *   apps/api/node_modules/.bin/tsx bench/orgs/run-hybrid.mts > bench/results/A1-radar-hybrid.json
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { analyzeAliasIndex, buildAliasIndex, type AliasRow } from "../../apps/api/src/match/core.js";
import { fuzzyMatchAlias } from "../../apps/api/src/match/fuzzy.js";

type Gold = {
	orgs: Array<{ id: number; name: string; aliases: string[] }>;
	cases: Array<{ id: string; text: string; expect: number | null; category: string }>;
};

const gold = JSON.parse(
	readFileSync(fileURLToPath(new URL("./gold-attach.json", import.meta.url)), "utf8"),
) as Gold;

const rows: AliasRow[] = [];
for (const org of gold.orgs) {
	for (const alias of [...org.aliases, org.name]) rows.push({ org_id: org.id, name: org.name, alias });
}

const t0 = performance.now();
const index = buildAliasIndex(rows);
const buildMs = performance.now() - t0;

const predictions: Record<string, { orgId: number | null; reason: string; confidence: number | null }> = {};
let fallbacks = 0;
const t1 = performance.now();
for (const c of gold.cases) {
	const analysis = analyzeAliasIndex(index, c.text);
	if (analysis.reason === "no-alias") {
		fallbacks++;
		const fallback = fuzzyMatchAlias(index, c.text);
		predictions[c.id] = fallback.match
			? { orgId: fallback.match.orgId, reason: "fuzzy", confidence: fallback.match.confidence }
			: { orgId: null, reason: "no-alias", confidence: null };
	} else {
		predictions[c.id] = {
			orgId: analysis.match?.orgId ?? null,
			reason: analysis.reason,
			confidence: analysis.match?.confidence ?? null,
		};
	}
}
const matchMs = performance.now() - t1;

process.stdout.write(
	`${JSON.stringify(
		{
			engine: "radar-hybrid",
			aliases: rows.length,
			indexedKeys: index.byKey.size,
			cases: gold.cases.length,
			fallbacks,
			buildMs: Number(buildMs.toFixed(3)),
			matchMs: Number(matchMs.toFixed(3)),
			msPerCase: Number((matchMs / gold.cases.length).toFixed(4)),
			predictions,
		},
		null,
		1,
	)}\n`,
);
