/**
 * One behavior per test for the public-service availability measurement.
 * Offline only: HTTP is injected, no database is opened.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	NA_DEPARTMENTS,
	buildPerimeter,
	parseCorpus,
	type PublicService,
} from "../src/serviceAvailability/perimeter.js";
import { dayKeys, mergeDaily, parseObservations, serializeObservations } from "../src/serviceAvailability/observations.js";
import { probeAll, probeService, type DailyObservation } from "../src/serviceAvailability/probe.js";
import { measureAvailability } from "../src/serviceAvailability/measure.js";
import { evaluateCoverage } from "../src/serviceAvailability/objective.js";
import { auditWindows, candidateAnchors, earliestAttainableAnchor } from "../src/serviceAvailability/audit.js";

function service(id: string, department = "033"): PublicService {
	return { id, url: `https://example.fr/${id}`, department, kind: "collège" };
}

function corpusLine(id: string, department = "033", status = 200): string {
	return JSON.stringify({
		id,
		nom: `Lycée ${id}`,
		departement: department,
		type: "lycée",
		url: `https://example.fr/${id}`,
		preuve: { http_status: status, verifie_le: "2026-11-21" },
	});
}

function observation(serviceId: string, day: string, ok: boolean, observedAt = `${day}T08:00:00.000Z`): DailyObservation {
	return { serviceId, day, ok, status: ok ? 200 : 503, latencyMs: 120, observedAt, failure: ok ? null : "http_error" };
}

function fakeFetch(status: number): typeof fetch {
	return (async () => ({ status, body: { cancel: async () => undefined } })) as unknown as typeof fetch;
}

test("perimeter takes exactly 500 verified services from the twelve NA departments", () => {
	const rows = parseCorpus(
		Array.from({ length: 520 }, (_, index) => corpusLine(`svc-${String(index).padStart(4, "0")}`)).join("\n")
	);
	const perimeter = buildPerimeter(rows);
	assert.equal(perimeter.length, 500);
	assert.ok(perimeter.every((row) => NA_DEPARTMENTS[row.department] === true));
});

test("perimeter excludes other regions and unverified HTTP statuses", () => {
	const rows = parseCorpus([
		corpusLine("na-ok", "033"),
		corpusLine("outside", "75"),
		corpusLine("not-verified", "033", 404),
		corpusLine("named-department", "Gironde"),
	].join("\n"));
	assert.deepEqual(rows.map((row) => row.id), ["na-ok"]);
});

test("perimeter selection is independent of corpus order", () => {
	const rows = parseCorpus(Array.from({ length: 510 }, (_, index) => corpusLine(`svc-${index}`)).join("\n"));
	const forward = buildPerimeter(rows);
	const backward = buildPerimeter([...rows].reverse());
	assert.deepEqual(forward, backward);
});

test("perimeter rows carry no title, personal name or victim field", () => {
	const [row] = buildPerimeter(parseCorpus(corpusLine("svc-1")));
	assert.deepEqual(Object.keys(row ?? {}).sort(), ["department", "id", "kind", "url"]);
});

test("a successful probe records the status, timing and UTC day", async () => {
	const result = await probeService(service("svc-1"), {
		fetchImpl: fakeFetch(200),
		now: () => new Date("2026-11-22T09:30:00.000Z"),
	});
	assert.equal(result.ok, true);
	assert.equal(result.status, 200);
	assert.equal(result.day, "2026-11-22");
	assert.equal(result.failure, null);
	assert.ok(result.latencyMs >= 0);
});

test("a transport failure is recorded as unavailable, never as missing", async () => {
	const failing = (async () => {
		throw new Error("ECONNREFUSED");
	}) as unknown as typeof fetch;
	const result = await probeService(service("svc-2"), { fetchImpl: failing });
	assert.equal(result.ok, false);
	assert.equal(result.status, null);
	assert.equal(result.failure, "network_error");
});

test("a timed-out request is labelled timeout", async () => {
	const error = new Error("timed out");
	error.name = "TimeoutError";
	const failing = (async () => {
		throw error;
	}) as unknown as typeof fetch;
	const result = await probeService(service("svc-3"), { fetchImpl: failing });
	assert.equal(result.failure, "timeout");
});

test("the campaign stops when its global deadline has passed", async () => {
	let calls = 0;
	const counting = (async () => {
		calls += 1;
		return { status: 200, body: { cancel: async () => undefined } };
	}) as unknown as typeof fetch;
	const results = await probeAll([service("a"), service("b")], { deadlineMs: 0, fetchImpl: counting });
	assert.deepEqual(results, []);
	assert.equal(calls, 0);
});

test("the window contains seven consecutive UTC days ending on the anchor", () => {
	assert.deepEqual(dayKeys("2026-11-22"), [
		"2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19",
		"2026-11-20", "2026-11-21", "2026-11-22",
	]);
});

test("daily merge keeps one row per service and day, preferring success", () => {
	const merged = mergeDaily([
		observation("a", "2026-11-22", false, "2026-11-22T07:00:00.000Z"),
		observation("a", "2026-11-22", true, "2026-11-22T09:00:00.000Z"),
		observation("a", "2026-11-21", true),
	]);
	assert.equal(merged.length, 2);
	assert.equal(merged.find((row) => row.day === "2026-11-22")?.ok, true);
});

test("observation replay is idempotent and order independent", () => {
	const rows = [observation("a", "2026-11-22", true, "2026-11-22T08:00:00.000Z"), observation("b", "2026-11-22", false)];
	const text = serializeObservations([...rows, ...rows]);
	assert.deepEqual(parseObservations(text), parseObservations(serializeObservations([...rows].reverse())));
	assert.equal(parseObservations(text).length, 2);
});

test("availability is the share of observed service-days that succeeded", () => {
	const services = [service("a"), service("b")];
	const summary = measureAvailability([
		observation("a", "2026-11-21", true),
		observation("a", "2026-11-22", true),
		observation("b", "2026-11-21", false),
		observation("b", "2026-11-22", true),
	], services, "2026-11-22");
	assert.equal(summary.observedServiceDays, 4);
	assert.equal(summary.availableServiceDays, 3);
	assert.equal(summary.availabilityPct, 75);
	assert.equal(summary.coveragePct, 28.57);
	assert.equal(summary.servicesFullyObserved, 0);
});

test("measurement ignores days outside the window and services outside the perimeter", () => {
	const summary = measureAvailability([
		observation("a", "2026-11-15", true),
		observation("unknown", "2026-11-22", true),
		observation("a", "2026-11-22", true),
	], [service("a")], "2026-11-22");
	assert.equal(summary.observedServiceDays, 1);
	assert.equal(summary.availabilityPct, 100);
});

test("full seven-day coverage is reported separately from partial coverage", () => {
	const rows = dayKeys("2026-11-22").map((day) => observation("a", day, true));
	const summary = measureAvailability(rows, [service("a")], "2026-11-22");
	assert.equal(summary.servicesFullyObserved, 1);
	assert.equal(summary.coveragePct, 100);
	assert.equal(summary.perDay.length, 7);
});

test("coverage status counts unobserved days and service-days without extrapolating", () => {
	const rows = [
		observation("a", "2026-11-21", true),
		observation("a", "2026-11-22", false),
		observation("a", "2026-11-23", true),
	];
	const summary = measureAvailability(rows, [service("a")], "2026-11-23");
	const status = evaluateCoverage(summary);
	assert.equal(status.label, "partiel");
	assert.equal(status.daysObserved, 3);
	assert.equal(status.missingDays.length, 4);
	assert.equal(status.observedServiceDays, 3);
	assert.equal(status.missingServiceDays, 4);
});

test("candidate anchors span each observed day and the six following days", () => {
	const rows = [observation("a", "2026-11-21", true), observation("a", "2026-11-22", true)];
	assert.deepEqual(candidateAnchors(rows), [
		"2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24",
		"2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28",
	]);
});

test("partial observations never mark a candidate window as attained", () => {
	const services = [service("a"), service("b")];
	const rows = [
		observation("a", "2026-11-21", true), observation("b", "2026-11-21", true),
		observation("a", "2026-11-23", true), observation("b", "2026-11-23", true),
	];
	const audits = auditWindows(rows, services);
	assert.equal(audits.length, 9);
	assert.ok(audits.every((window) => window.status === "partiel"));
	assert.equal(Math.max(...audits.map((window) => window.observedServiceDays)), 4);
});

test("seven observed days produce one fully covered candidate window", () => {
	const services = [service("a"), service("b")];
	const days = dayKeys("2026-11-28", 7);
	const rows = days.flatMap((day) => services.map((item) => observation(item.id, day, true)));
	const attained = auditWindows(rows, services).filter((window) => window.status === "atteint");
	assert.deepEqual(attained.map((window) => window.anchor), ["2026-11-28"]);
	assert.equal(attained[0]?.observedServiceDays, 14);
});

test("earliest attainable anchor waits for incomplete past days to leave the window", () => {
	const services = [service("a"), service("b")];
	const rows = [
		observation("a", "2026-11-21", true), observation("b", "2026-11-21", true),
		observation("a", "2026-11-22", true),
		observation("a", "2026-11-23", true), observation("b", "2026-11-23", true),
		observation("a", "2026-11-24", true), observation("b", "2026-11-24", true),
	];
	assert.equal(earliestAttainableAnchor(rows, services, "2026-11-24"), "2026-11-29");
});
