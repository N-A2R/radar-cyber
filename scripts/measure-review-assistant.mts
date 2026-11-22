#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of the review assistant's suggestion acceptance rate.
 *
 * Offline by default: reads the frozen, non-personal decision corpus from the
 * repository. `--with-db` also reads read-only baseline counters from the real
 * database. `--export-corpus` regenerates the frozen corpus from that database.
 *
 *   apps/api/node_modules/.bin/tsx scripts/measure-review-assistant.mts
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-review-assistant.mts --with-db
 *
 * No row is written to the database. No victim text, name or contact detail is
 * exported: only the organisation hint, the source and a description flag.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { suggestDecision, type AssistantAction, type AssistantClaim } from "../apps/api/src/review-assistant/suggest.js";
import { computeAcceptance, type AnalystDecision } from "../apps/api/src/review-assistant/acceptance.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const withDb = process.argv.includes("--with-db");
const exportCorpus = process.argv.includes("--export-corpus");
const corpusPath = join(process.cwd(), "bench/corpus/review-assistant-decisions.json");
const resultPath = join(process.cwd(), "bench/results/review-assistant-acceptance.json");
const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
const shown = new URL(url);
shown.password = "***";

type CorpusClaim = AssistantClaim & { action: AssistantAction };

function isAction(value: unknown): value is AssistantAction {
	return value === "promote" || value === "review" || value === "reject";
}

function readCorpus(): CorpusClaim[] {
	const parsed = JSON.parse(readFileSync(corpusPath, "utf8")) as { claims?: unknown };
	if (!Array.isArray(parsed.claims)) throw new Error(`invalid corpus: ${corpusPath}`);
	return parsed.claims.map((item) => {
		const row = item as Record<string, unknown>;
		if (!Number.isInteger(row.claimId) || !isAction(row.action)) throw new Error("invalid corpus row");
		return {
			claimId: row.claimId as number,
			action: row.action,
			orgHint: typeof row.orgHint === "string" ? row.orgHint : null,
			source: typeof row.source === "string" ? row.source : null,
			hasDescription: row.hasDescription === true,
		};
	});
}

async function connect() {
	const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
	await client.connect();
	await client.query("SET statement_timeout = '15000ms'");
	return client;
}

async function exportFromDatabase(): Promise<void> {
	const client = await connect();
	try {
		const { rows } = await client.query<{
			claimId: string; action: string; orgHint: string | null;
			source: string | null; hasDescription: boolean;
		}>(`
			WITH decided AS (
			  SELECT regexp_replace(j.subject, '^quarantine:', '')::bigint AS claim_id,
			         j.id AS journal_id,
			         CASE
			           WHEN j.payload->>'action' = 'promote'
			                OR j.payload->>'decision' IN ('creer','promote','promu') THEN 'promote'
			           WHEN j.payload->>'decision' = 'reject' OR j.summary LIKE 'rejeté%' THEN 'reject'
			           WHEN j.summary LIKE 'restauration%' OR j.payload->>'decision' = 'review' THEN 'review'
			         END AS action
			    FROM journal j
			   WHERE j.kind = 'review.decided' AND j.actor LIKE 'humain:%'
			), ranked AS (
			  SELECT *, row_number() OVER (PARTITION BY claim_id ORDER BY journal_id DESC) AS rn
			    FROM decided WHERE action IS NOT NULL
			)
			SELECT r.claim_id::text AS "claimId", r.action, q.org_hint AS "orgHint",
			       q.source, (q.extracted->>'description' IS NOT NULL
			                  AND btrim(q.extracted->>'description') <> '') AS "hasDescription"
			  FROM ranked r LEFT JOIN quarantine_raw q ON q.id = r.claim_id
			 WHERE r.rn = 1
			 ORDER BY r.claim_id`);

		const claims: CorpusClaim[] = rows
			.filter((row) => isAction(row.action))
			.map((row) => ({
				claimId: Number(row.claimId),
				action: row.action as AssistantAction,
				orgHint: row.orgHint,
				source: row.source,
				hasDescription: row.hasDescription === true,
			}));
		const corpus = {
			dataset: "Human review decisions on quarantined claims",
			source: "journal.review.decided joined to quarantine_raw (read-only)",
			privacy: "No claim text, victim name, contact detail or personal field is exported.",
			claims,
		};
		writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + "\n");
		console.log(`exported claims: ${claims.length}`);
		console.log(`written: ${corpusPath}`);
	} finally {
		await client.end();
	}
}

async function readBaseline(): Promise<Record<string, string>> {
	const client = await connect();
	try {
		const { rows } = await client.query<Record<string, string>>(`
			SELECT (SELECT reltuples::bigint::text FROM pg_class WHERE relname = 'org') AS organizations,
			       (SELECT count(*)::text FROM source) AS sources,
			       (SELECT count(*)::text FROM event) AS events,
			       (SELECT count(*)::text FROM quarantine_raw) AS quarantinedClaims,
			       (SELECT count(*)::text FROM journal WHERE kind = 'review.decided') AS recordedDecisions,
			       (SELECT count(*)::text FROM journal
			         WHERE kind = 'review.decided' AND actor LIKE 'humain:%') AS humanDecisionEvents`);
		return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, String(value)]));
	} finally {
		await client.end();
	}
}

async function main(): Promise<void> {
	if (exportCorpus) {
		await exportFromDatabase();
		return;
	}

	const claims = readCorpus();
	const suggestions = claims.map((claim) => suggestDecision(claim));
	const decisions: AnalystDecision[] = claims.map((claim) => ({ claimId: claim.claimId, action: claim.action }));
	const acceptance = computeAcceptance(suggestions, decisions);
	const baseline = withDb ? await readBaseline() : null;

	const result = {
		measuredAt: new Date().toISOString(),
		database: withDb ? shown.toString() : null,
		baseline,
		corpus: {
			claims: claims.length,
			path: "bench/corpus/review-assistant-decisions.json",
			humanDecisionEvents: baseline?.humanDecisionEvents ?? null,
		},
		acceptance,
	};
	writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");

	console.log(`review assistant acceptance rate: ${(acceptance.acceptanceRate * 100).toFixed(2)}%`);
	console.log(`accepted suggestions: ${acceptance.accepted}/${acceptance.evaluated}`);
	console.log(`majority baseline: ${(acceptance.majorityBaselineRate * 100).toFixed(2)}%`);
	for (const action of ["promote", "review", "reject"] as const) {
		const tally = acceptance.byAction[action];
		console.log(`  ${action}: ${tally.accepted}/${tally.suggested}`);
	}
	if (baseline) {
		console.log(`baseline: ${baseline.organizations} organizations, ${baseline.sources} sources, ${baseline.events} events`);
	}
	console.log(`written: ${resultPath}`);
}

await main();
