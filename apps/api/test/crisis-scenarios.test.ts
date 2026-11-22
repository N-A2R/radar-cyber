/** One test per behaviour of the crisis-scenario generator (no network, no database). */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildScenario,
	classifySource,
	containsPersonalData,
	generateScenarios,
	groupSignals,
	isNaDepartment,
	NA_DEPARTMENTS,
	screenSignal,
	scoreCluster,
	selectClusters,
	themeFor,
	type RawSignal,
} from "../src/scenarios/model.js";
import { assessObjective, type ObjectiveInputs } from "../src/scenarios/objective.js";

function signal(overrides: Partial<RawSignal> = {}): RawSignal {
	return {
		eventId: 1,
		orgId: 100,
		family: "ransomware",
		assertionType: "third_party_claim",
		sourceId: "ransomlook",
		sourceFamily: "ransomware",
		observedAt: "2026-11-10",
		severity: 4,
		department: "33",
		orgKind: "collectivite",
		orgSector: "public-administration",
		title: "SECRET-SOURCE-TITLE-MUST-NOT-BE-PUBLISHED",
		summary: "SECRET-SOURCE-SUMMARY-MUST-NOT-BE-PUBLISHED",
		...overrides,
	};
}

function inputs(overrides: Partial<ObjectiveInputs> = {}): ObjectiveInputs {
	return {
		baseline: { organizations: 1_673_151, sources: 312, events: 26_259 },
		scenarioCount: 10,
		outsideNaCount: 0,
		personalDataCount: 0,
		paidServiceCount: 0,
		unsourcedCount: 0,
		...overrides,
	};
}

test("only the twelve Nouvelle-Aquitaine departments are accepted", () => {
	assert.equal(NA_DEPARTMENTS.length, 12);
	for (const code of NA_DEPARTMENTS) assert.equal(isNaDepartment(code), true);
	assert.equal(isNaDepartment("75"), false);
	assert.equal(isNaDepartment(null), false);
});

test("a signal from outside Nouvelle-Aquitaine is dropped", () => {
	assert.equal(screenSignal(signal({ department: "75" })), null);
	assert.equal(screenSignal(signal({ department: null })), null);
	assert.ok(screenSignal(signal({ department: "33" })));
});

test("a signal carrying a victim email or phone number is dropped", () => {
	assert.equal(containsPersonalData("contact victim@example.org"), true);
	assert.equal(containsPersonalData("appel au 06 12 34 56 78"), true);
	assert.equal(screenSignal(signal({ title: "victim@example.org" })), null);
	assert.equal(screenSignal(signal({ summary: "Mme Marie Dupont" })), null);
	assert.equal(containsPersonalData("Mairie de Bordeaux - cyberattaque"), false);
});

test("screening removes the raw title and summary from the emitted signal", () => {
	const clean = screenSignal(signal());
	assert.ok(clean);
	assert.equal("title" in clean, false);
	assert.equal("summary" in clean, false);
});

test("real event families map to themes and unknown families are rejected", () => {
	assert.equal(themeFor("ransomware"), "ransomware");
	assert.equal(themeFor("leaks"), "data-leak");
	assert.equal(themeFor("cert_fr"), "public-alert");
	assert.equal(themeFor("unknown-family"), null);
	assert.equal(screenSignal(signal({ family: "unknown-family" })), null);
});

test("grey trackers are accepted as grey sources and public alerts as official", () => {
	assert.equal(classifySource("ransomware", "ransomlook"), "grey");
	assert.equal(classifySource("cti", "tg-ransomwareg"), "grey");
	assert.equal(classifySource("cert_fr", "cert-fr-alerte"), "official");
	assert.equal(classifySource("cti", "presse-sudouest"), "press");
});

test("signals are grouped by department and theme", () => {
	const clean = [
		screenSignal(signal({ eventId: 1, department: "33" })),
		screenSignal(signal({ eventId: 2, department: "33", sourceId: "tg-ransomwareg" })),
		screenSignal(signal({ eventId: 3, department: "17", family: "leaks" })),
	].filter((value): value is NonNullable<typeof value> => value !== null);
	const groups = groupSignals(clean);
	assert.equal(groups.length, 2);
	assert.deepEqual(groups.map((group) => group.key).sort(), ["17|data-leak", "33|ransomware"]);
	assert.equal(groups.find((group) => group.department === "33")?.signals.length, 2);
});

test("a cluster scores higher when signals come from more distinct sources", () => {
	const oneSource = [
		screenSignal(signal({ eventId: 1 })),
		screenSignal(signal({ eventId: 2 })),
	].filter((value): value is NonNullable<typeof value> => value !== null);
	const twoSources = [
		screenSignal(signal({ eventId: 1 })),
		screenSignal(signal({ eventId: 2, sourceId: "tg-ransomwareg" })),
	].filter((value): value is NonNullable<typeof value> => value !== null);
	assert.ok(scoreCluster(twoSources) > scoreCluster(oneSource));
});

test("the first selections take at most one scenario per department", () => {
	const groups = groupSignals([
		screenSignal(signal({ eventId: 1, department: "33" })),
		screenSignal(signal({ eventId: 2, department: "33", family: "leaks" })),
		screenSignal(signal({ eventId: 3, department: "17" })),
	].filter((value): value is NonNullable<typeof value> => value !== null));
	const selected = selectClusters(groups, 2);
	assert.equal(selected.length, 2);
	assert.equal(new Set(selected.map((cluster) => cluster.department)).size, 2);
});

test("scenario evidence is hashed and never contains source text", () => {
	const cluster = groupSignals([
		screenSignal(signal({ eventId: 42 })),
	].filter((value): value is NonNullable<typeof value> => value !== null))[0]!;
	const scenario = buildScenario(cluster);
	const json = JSON.stringify(scenario);
	assert.equal(json.includes("SECRET-SOURCE-TITLE"), false);
	assert.equal(json.includes("SECRET-SOURCE-SUMMARY"), false);
	assert.equal(json.includes("eventId"), false);
	assert.match(scenario.evidenceHashes[0]!, /^[0-9a-f]{12}$/);
});

test("generation is capped at ten deterministic scenarios", () => {
	const raw = NA_DEPARTMENTS.flatMap((department, index) => [
		signal({ eventId: index * 2 + 1, department, observedAt: "2026-11-10" }),
		signal({ eventId: index * 2 + 2, department, observedAt: "2026-11-12", sourceId: "tg-ransomwareg" }),
	]);
	const first = generateScenarios(raw, 10);
	const second = generateScenarios(raw, 10);
	assert.equal(first.scenarios.length, 10);
	assert.equal(new Set(first.scenarios.map((s) => s.id)).size, 10);
	assert.deepEqual(JSON.stringify(first), JSON.stringify(second));
});

test("a signal with an invalid date is not used as evidence", () => {
	const result = generateScenarios([signal({ observedAt: "not-a-date" })]);
	assert.equal(result.scenarios.length, 0);
	assert.equal(result.screening.usable, 0);
});

test("the objective requires at least ten scenarios", () => {
	assert.equal(assessObjective(inputs({ scenarioCount: 9 })).met, false);
	assert.equal(assessObjective(inputs({ scenarioCount: 10 })).met, true);
});

test("the objective rejects a scenario outside Nouvelle-Aquitaine", () => {
	assert.equal(assessObjective(inputs({ outsideNaCount: 1 })).met, false);
});

test("the objective rejects a scenario carrying victim personal data", () => {
	assert.equal(assessObjective(inputs({ personalDataCount: 1 })).met, false);
});

test("the objective rejects a scenario relying on a paid service", () => {
	assert.equal(assessObjective(inputs({ paidServiceCount: 1 })).met, false);
});

test("the objective rejects a scenario with no real source", () => {
	assert.equal(assessObjective(inputs({ unsourcedCount: 1 })).met, false);
});

test("the objective accepts the measured live baseline", () => {
	const verdict = assessObjective(inputs());
	assert.equal(verdict.met, true);
	assert.equal(verdict.checks.every((check) => check.passed), true);
});
