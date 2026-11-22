/**
 * Déduplication inter-flux branchée dans la détection.
 *
 * La règle `cross-flow@1` est mesurée dans `test/dedup-pairs.test.ts`. Ce test
 * vérifie son **effet** : deux flux qui republient le même fait ne doivent ni
 * gonfler la corroboration de la note de confiance, ni ouvrir une seconde
 * alerte. Deux faits distincts le même jour restent, eux, deux sources et deux
 * alertes.
 *
 * Isolation : organisation, sources, règle et événements portent le TAG du
 * test et sont supprimés dans un `finally`.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import { loadRules, evaluateEvent, loadCorroborationContext } from "../src/detect/engine.js";
import type { RuleMatch } from "../src/detect/engine.js";

const TAG = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let seq = 0;
function next(): string {
	seq += 1;
	return `${TAG}-${seq}`;
}

after(async () => {
	await closePools().catch(() => {});
});

type Ids = { events: number[]; orgs: number[]; rules: string[]; sources: string[] };

async function insertOrg(name: string, dept: string): Promise<number> {
	const r = await query<{ id: string | number }>(
		"INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'collectivite',$3) RETURNING id",
		[name, next(), dept],
	);
	return Number(r.rows[0].id);
}

async function insertSource(): Promise<string> {
	const id = next();
	await query(
		"INSERT INTO source (id, name, family, url) VALUES ($1,$2,'presse','https://example.invalid/feed')",
		[id, `Flux de test ${id}`],
	);
	return id;
}

async function insertEvent(e: {
	family: string;
	title: string;
	sourceId: string;
	orgId: number;
	day: string;
}): Promise<number> {
	const r = await query<{ id: string | number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, severity, confidence,
		                    source_id, org_id, observed_at, evidence)
		 VALUES ($1,$2,'third_party_claim',$3,4,'A1',$4,$5,$6::timestamptz,'{}') RETURNING id`,
		[next(), e.family, e.title, e.sourceId, e.orgId, `${e.day}T10:00:00Z`],
	);
	return Number(r.rows[0].id);
}

async function insertRule(id: string, match: RuleMatch): Promise<void> {
	await query(
		`INSERT INTO detection_rule (id, name, description, severity, enabled, match, action)
		 VALUES ($1,$1,NULL,4,true,$2,'alert')`,
		[id, JSON.stringify(match)],
	);
	await loadRules(true);
}

async function countAlerts(ruleId: string, eventIds: number[]): Promise<number> {
	const r = await query<{ n: string }>(
		"SELECT COUNT(*)::text AS n FROM alert WHERE rule_id=$1 AND event_id = ANY($2::int[])",
		[ruleId, eventIds],
	);
	return Number(r.rows[0].n);
}

async function alertEvidence(ruleId: string, eventIds: number[]): Promise<Record<string, unknown>> {
	const r = await query<{ evidence: unknown }>(
		"SELECT evidence FROM alert WHERE rule_id=$1 AND event_id = ANY($2::int[]) LIMIT 1",
		[ruleId, eventIds],
	);
	const row = r.rows[0];
	assert.ok(row, "alerte attendue");
	return typeof row.evidence === "string"
		? (JSON.parse(row.evidence) as Record<string, unknown>)
		: (row.evidence as Record<string, unknown>);
}

async function cleanup(ids: Ids): Promise<void> {
	if (ids.rules.length > 0) await query("DELETE FROM alert WHERE rule_id = ANY($1::text[])", [ids.rules]);
	if (ids.events.length > 0) await query("DELETE FROM event WHERE id = ANY($1::int[])", [ids.events]);
	if (ids.orgs.length > 0) await query("DELETE FROM org WHERE id = ANY($1::int[])", [ids.orgs]);
	if (ids.rules.length > 0) await query("DELETE FROM detection_rule WHERE id = ANY($1::text[])", [ids.rules]);
	if (ids.sources.length > 0) await query("DELETE FROM source WHERE id = ANY($1::text[])", [ids.sources]);
	await loadRules(true);
}

test("deux flux reprenant le même fait : une source corroborée, une seule alerte", async () => {
	const ids: Ids = { events: [], orgs: [], rules: [], sources: [] };
	const ruleId = `test-cross-flow-${TAG}`;
	ids.rules.push(ruleId);
	try {
		await insertRule(ruleId, { family: "testcrossflow" });
		const org = await insertOrg(`Org dédup ${TAG}`, "33");
		ids.orgs.push(org);
		const sourceA = await insertSource();
		const sourceB = await insertSource();
		ids.sources.push(sourceA, sourceB);

		// Deux titres différents, un seul fait : CHU de Bordeaux, rançongiciel,
		// même jour. Le second flux est évalué en premier pour prouver que
		// l'ordre d'évaluation ne double pas l'alerte.
		const second = await insertEvent({
			family: "testcrossflow",
			title: "Rançongiciel contre CHU de Bordeaux : systèmes bloqués",
			sourceId: sourceB,
			orgId: org,
			day: "2026-11-02",
		});
		const first = await insertEvent({
			family: "testcrossflow",
			title: "CHU de Bordeaux victime d'un rançongiciel : activité suspendue",
			sourceId: sourceA,
			orgId: org,
			day: "2026-11-02",
		});
		ids.events.push(first, second);

		const context = await loadCorroborationContext([org]);
		assert.equal(context.sourcesByOrg.get(org), 1, "deux flux d'un même fait = une source");
		assert.deepEqual(
			[...(context.groupByEvent.get(first) ?? [])].sort((a, b) => a - b),
			[first, second].sort((a, b) => a - b),
			"les deux événements doivent former un seul groupe",
		);

		assert.equal(await evaluateEvent(second), 1, "le premier membre évalué ouvre l'alerte");
		assert.equal(await evaluateEvent(first), 0, "le second membre ne rouvre pas d'alerte");
		assert.equal(await countAlerts(ruleId, [first, second]), 1, "une alerte pour le fait, pas deux");

		const evidence = await alertEvidence(ruleId, [first, second]);
		const confidence = evidence.confidence as Record<string, number>;
		assert.equal(confidence.distinct_sources, 1, "la corroboration ne compte pas le doublon");
		// A1 + revendication tierce + organisation géolocalisée + 1 source = 77.
		// Avec deux sources comptées à tort, la note monterait à 84.
		assert.equal(confidence.score, 77, "la note ne doit pas être gonflée par le second flux");
		const crossFlow = evidence.cross_flow as Record<string, unknown>;
		assert.equal(crossFlow.rule_version, "cross-flow@1");
		assert.deepEqual(
			[...(crossFlow.event_ids as number[])].sort((a, b) => a - b),
			[first, second].sort((a, b) => a - b),
		);
	} finally {
		await cleanup(ids);
	}
});

test("deux faits distincts le même jour restent deux sources et deux alertes", async () => {
	const ids: Ids = { events: [], orgs: [], rules: [], sources: [] };
	const ruleId = `test-cross-flow-distinct-${TAG}`;
	ids.rules.push(ruleId);
	try {
		await insertRule(ruleId, { family: "testcrossflowdistinct" });
		const org = await insertOrg(`Org dédup distincte ${TAG}`, "33");
		ids.orgs.push(org);
		const sourceA = await insertSource();
		const sourceB = await insertSource();
		ids.sources.push(sourceA, sourceB);

		// Même ville, établissements et natures différents : deux faits.
		const victim = await insertEvent({
			family: "testcrossflowdistinct",
			title: "Mairie de Pau victime d'un rançongiciel",
			sourceId: sourceA,
			orgId: org,
			day: "2026-11-05",
		});
		const other = await insertEvent({
			family: "testcrossflowdistinct",
			title: "Hôpital de Pau cible d'une attaque DDoS",
			sourceId: sourceB,
			orgId: org,
			day: "2026-11-05",
		});
		ids.events.push(victim, other);

		assert.equal(await evaluateEvent(victim), 1);
		assert.equal(await evaluateEvent(other), 1);
		assert.equal(await countAlerts(ruleId, [victim, other]), 2, "deux faits = deux alertes");

		for (const eventId of [victim, other]) {
			const r = await query<{ evidence: unknown }>(
				"SELECT evidence FROM alert WHERE rule_id=$1 AND event_id=$2",
				[ruleId, eventId],
			);
			const evidence = typeof r.rows[0]?.evidence === "string"
				? (JSON.parse(r.rows[0].evidence as string) as Record<string, unknown>)
				: (r.rows[0]?.evidence as Record<string, unknown>);
			assert.equal((evidence.confidence as Record<string, number>).distinct_sources, 2);
			assert.equal(evidence.cross_flow, undefined, "un fait distinct n'est pas un groupe");
		}
	} finally {
		await cleanup(ids);
	}
});

test("une promotion humaine n'est pas bloquée par la déduplication", async () => {
	const ids: Ids = { events: [], orgs: [], rules: [], sources: [] };
	const ruleId = `test-cross-flow-force-${TAG}`;
	ids.rules.push(ruleId);
	try {
		await insertRule(ruleId, { family: "testcrossflowforce" });
		const org = await insertOrg(`Org dédup force ${TAG}`, "33");
		ids.orgs.push(org);
		const sourceA = await insertSource();
		const sourceB = await insertSource();
		ids.sources.push(sourceA, sourceB);

		const second = await insertEvent({
			family: "testcrossflowforce",
			title: "Mairie de Niort : des données personnelles diffusées en ligne",
			sourceId: sourceB,
			orgId: org,
			day: "2026-11-08",
		});
		const first = await insertEvent({
			family: "testcrossflowforce",
			title: "Mairie de Niort victime d'une fuite de données",
			sourceId: sourceA,
			orgId: org,
			day: "2026-11-08",
		});
		ids.events.push(first, second);

		assert.equal(await evaluateEvent(second), 1);
		assert.equal(await evaluateEvent(first, { force: true }), 1, "un acte humain explicite reste honoré");
		assert.equal(await countAlerts(ruleId, [first, second]), 2);
	} finally {
		await cleanup(ids);
	}
});
