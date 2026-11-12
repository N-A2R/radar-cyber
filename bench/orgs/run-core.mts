/**
 * Bench A1 — passe le jeu annoté dans le cœur de matching actuel.
 *
 * Aucune base de données : on construit l'index d'alias depuis le jeu, comme
 * le ferait `loadIndex()` en ligne. Rend un JSON de prédictions + le temps
 * mesuré, consommé par `score.py`.
 *
 *   apps/api/node_modules/.bin/tsx bench/orgs/run-core.mts > bench/results/A1-core.json
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { analyzeAliasIndex, buildAliasIndex, type AliasRow } from "../../apps/api/src/match/core.js";

type Gold = {
	orgs: Array<{ id: number; name: string; aliases: string[] }>;
	cases: Array<{ id: string; text: string; expect: number | null; category: string }>;
};

const path = fileURLToPath(new URL("./gold-attach.json", import.meta.url));
const gold = JSON.parse(readFileSync(path, "utf8")) as Gold;

const rows: AliasRow[] = [];
for (const org of gold.orgs) {
	for (const alias of org.aliases) rows.push({ org_id: org.id, name: org.name, alias });
	// Le nom officiel est toujours un alias, comme dans le référentiel réel.
	rows.push({ org_id: org.id, name: org.name, alias: org.name });
}

const t0 = performance.now();
const index = buildAliasIndex(rows);
const buildMs = performance.now() - t0;

const predictions: Record<string, { orgId: number | null; reason: string; confidence: number | null }> = {};
const t1 = performance.now();
for (const c of gold.cases) {
	const { match, reason } = analyzeAliasIndex(index, c.text);
	predictions[c.id] = {
		orgId: match?.orgId ?? null,
		reason,
		confidence: match?.confidence ?? null,
	};
}
const matchMs = performance.now() - t1;

process.stdout.write(
	`${JSON.stringify(
		{
			engine: "radar-core",
			aliases: rows.length,
			indexedKeys: index.byKey.size,
			cases: gold.cases.length,
			buildMs: Number(buildMs.toFixed(3)),
			matchMs: Number(matchMs.toFixed(3)),
			msPerCase: Number((matchMs / gold.cases.length).toFixed(4)),
			predictions,
		},
		null,
		1,
	)}\n`,
);
