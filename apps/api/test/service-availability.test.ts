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
import { probeAll, probeCampaign, probeService, type DailyObservation } from "../src/serviceAvailability/probe.js";
import { measureAvailability } from "../src/serviceAvailability/measure.js";
import { evaluateCoverage, probeGaps } from "../src/serviceAvailability/objective.js";
import { attainableBy, auditWindows, candidateAnchors, earliestAttainableAnchor, maxObservedInRange } from "../src/serviceAvailability/audit.js";
import {
	normalizeProofUrl,
	observationsFromDbProofs,
	observationsFromExpositionProofs,
} from "../src/serviceAvailability/dbProofs.js";
import {
	archiveAuditVerdict,
	capturableServiceDays,
	parseArchiveCaptures,
} from "../src/serviceAvailability/archiveProofs.js";

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

test("a transient timeout is retried and the successful probe is kept", async () => {
	const attempts = new Map<string, number>();
	const flaky = (async (url: string) => {
		attempts.set(url, (attempts.get(url) ?? 0) + 1);
		if (url.endsWith("/a") && attempts.get(url) === 1) {
			const error = new Error("timed out");
			error.name = "TimeoutError";
			throw error;
		}
		return { status: 200, body: { cancel: async () => undefined } };
	}) as unknown as typeof fetch;
	const campaign = await probeCampaign([service("a"), service("b")], {
		fetchImpl: flaky,
		retries: 1,
		deadlineMs: 60_000,
		concurrency: 2,
		now: () => new Date("2026-11-22T09:00:00.000Z"),
	});
	assert.deepEqual([...attempts.values()], [2, 1]);
	const rows = mergeDaily(campaign.observations);
	assert.equal(rows.length, 2);
	assert.ok(rows.every((row) => row.ok));
	assert.deepEqual(campaign.missingServiceIds, []);
});

test("retries are bounded and a persistent transport failure stays visible", async () => {
	let calls = 0;
	const timingOut = (async () => {
		calls += 1;
		const error = new Error("timed out");
		error.name = "TimeoutError";
		throw error;
	}) as unknown as typeof fetch;
	const campaign = await probeCampaign([service("a")], {
		fetchImpl: timingOut,
		retries: 2,
		deadlineMs: 60_000,
		now: () => new Date("2026-11-22T09:00:00.000Z"),
	});
	assert.equal(calls, 3);
	const [row] = mergeDaily(campaign.observations);
	assert.equal(row?.ok, false);
	assert.equal(row?.failure, "timeout");
	assert.deepEqual(campaign.missingServiceIds, []);
});

test("a real HTTP error is one observation and is never retried", async () => {
	let calls = 0;
	const errorResponse = (async () => {
		calls += 1;
		return { status: 503, body: { cancel: async () => undefined } };
	}) as unknown as typeof fetch;
	const campaign = await probeCampaign([service("a")], {
		fetchImpl: errorResponse,
		retries: 3,
		deadlineMs: 60_000,
		now: () => new Date("2026-11-22T09:00:00.000Z"),
	});
	assert.equal(calls, 1);
	const [row] = campaign.observations;
	assert.equal(row?.ok, false);
	assert.equal(row?.status, 503);
	assert.equal(row?.failure, null);
});

test("services left by the deadline are reported missing, never invented", async () => {
	let clock = Date.parse("2026-11-22T09:00:00.000Z");
	const advancingFetch = (async () => {
		clock += 1_000;
		return { status: 200, body: { cancel: async () => undefined } };
	}) as unknown as typeof fetch;
	const partial = await probeCampaign([service("a"), service("b")], {
		fetchImpl: advancingFetch,
		concurrency: 1,
		deadlineMs: 1_000,
		now: () => new Date(clock),
	});
	assert.equal(partial.observations.length, 1);
	assert.deepEqual(partial.missingServiceIds, ["b"]);

	let calls = 0;
	const counting = (async () => {
		calls += 1;
		return { status: 200, body: { cancel: async () => undefined } };
	}) as unknown as typeof fetch;
	const expired = await probeCampaign([service("a"), service("b")], { deadlineMs: 0, fetchImpl: counting });
	assert.deepEqual(expired.observations, []);
	assert.deepEqual(expired.missingServiceIds, ["a", "b"]);
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

test("a fictitious replay keeps every success, exposes a failure and is idempotent", async () => {
	const services = [service("a"), service("b"), service("c")];
	const attempts = new Map<string, number>();
	const fetchImpl = (async (url: string) => {
		const id = url.slice(url.lastIndexOf("/") + 1);
		attempts.set(id, (attempts.get(id) ?? 0) + 1);
		if (id === "a" && attempts.get(id) === 1) {
			const error = new Error("timed out");
			error.name = "TimeoutError";
			throw error;
		}
		return { status: id === "a" ? 200 : 503, body: { cancel: async () => undefined } };
	}) as unknown as typeof fetch;
	const campaign = await probeCampaign(services, {
		fetchImpl,
		retries: 1,
		deadlineMs: 60_000,
		concurrency: 3,
		now: () => new Date("2026-11-22T10:00:00.000Z"),
	});
	const previous = [
		observation("a", "2026-11-22", false, "2026-11-22T09:00:00.000Z"),
		observation("b", "2026-11-22", true, "2026-11-22T12:00:00.000Z"),
	];
	const stored = serializeObservations([...previous, ...campaign.observations]);
	const replayed = serializeObservations([...parseObservations(stored), ...campaign.observations]);
	assert.equal(replayed, stored);
	const rows = parseObservations(stored);
	assert.deepEqual(rows.map((row) => [row.serviceId, row.ok]), [
		["a", true], ["b", true], ["c", false],
	]);
	assert.equal(rows.find((row) => row.serviceId === "b")?.status, 200);
	assert.equal(rows.find((row) => row.serviceId === "c")?.failure, null);
	const summary = measureAvailability(rows, services, "2026-11-22");
	assert.equal(summary.observedServiceDays, 3);
	assert.equal(summary.availableServiceDays, 2);
	assert.deepEqual(probeGaps(summary), dayKeys("2026-11-21").slice(1).map((day) => ({ day, missing: 3 })));
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

test("probe gaps expose unobserved service-days without turning them into outages", () => {
	const services = [service("a"), service("b"), service("c")];
	const summary = measureAvailability([
		observation("a", "2026-11-22", true),
		observation("b", "2026-11-22", false),
	], services, "2026-11-22");
	assert.deepEqual(probeGaps(summary), [
		...dayKeys("2026-11-21").slice(1).map((day) => ({ day, missing: 3 })),
		{ day: "2026-11-22", missing: 1 },
	]);
	assert.equal(summary.observedServiceDays, 2);
	assert.equal(summary.availabilityPct, 50);
	assert.equal(summary.coveragePct, 9.52);
});

test("a partial 500-service day reports its exact missing probes", () => {
	const services = Array.from({ length: 500 }, (_, index) => service(`svc-${index}`));
	const rows = services.slice(0, 420).map((item) => observation(item.id, "2026-11-22", true));
	const summary = measureAvailability(rows, services, "2026-11-22");
	assert.equal(summary.observedServiceDays, 420);
	assert.equal(summary.availableServiceDays, 420);
	assert.deepEqual(probeGaps(summary), [
		...dayKeys("2026-11-21").slice(1).map((day) => ({ day, missing: 500 })),
		{ day: "2026-11-22", missing: 80 },
	]);
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

test("attainability excludes an anchor that still needs real future collections", () => {
	const services = [service("a"), service("b")];
	const rows = dayKeys("2026-11-24", 4).flatMap((day) =>
		services.map((item) => observation(item.id, day, true))
	);
	assert.equal(attainableBy(rows, services, "2026-11-24", "2026-11-24"), false);
	assert.equal(attainableBy(rows, services, "2026-11-24", "2026-11-26"), false);
	assert.equal(attainableBy(rows, services, "2026-11-24", "2026-11-27"), true);
	assert.throws(
		() => attainableBy(rows, services, "2026-11-24", "not-a-day"),
		RangeError
	);
});

test("an anchor scan reports the real ceiling and never invents a complete window", () => {
	const services = [service("a"), service("b")];
	const partial = dayKeys("2026-11-24", 4).flatMap((day) =>
		services.map((item) => observation(item.id, day, true))
	);
	assert.deepEqual(maxObservedInRange(partial, services, "2026-11-21", "2026-11-30"), {
		scannedAnchors: 10,
		maxObservedServiceDays: 8,
		targetServiceDays: 14,
		fullWindows: 0,
	});
	const complete = dayKeys("2026-11-27").flatMap((day) =>
		services.map((item) => observation(item.id, day, true))
	);
	assert.equal(maxObservedInRange(complete, services, "2026-11-27", "2026-11-27").fullWindows, 1);
});

test("a real database proof becomes a dated observation for the matching service", () => {
	const target = service("na-edu-001");
	const rows = [{
		url: "https://EXAMPLE.FR/na-edu-001/",
		code_http: 200,
		verifie_at: "2026-11-22T07:18:27.202Z",
		ms: 312,
	}];
	assert.deepEqual(observationsFromDbProofs(rows, [target]), [{
		serviceId: target.id,
		day: "2026-11-22",
		ok: true,
		status: 200,
		latencyMs: 312,
		observedAt: "2026-11-22T07:18:27.202Z",
		failure: null,
	}]);
});

test("a database proof with an HTTP error is unavailable, not missing", () => {
	const target = service("na-edu-002");
	const rows = [{ url: target.url, code_http: 503, verifie_at: "2026-11-22T09:00:00.000Z", ms: null }];
	const [result] = observationsFromDbProofs(rows, [target]);
	assert.equal(result.ok, false);
	assert.equal(result.failure, "http_error");
	assert.equal(result.status, 503);
});

test("database proofs outside the perimeter or without a valid UTC date are skipped", () => {
	const target = service("na-edu-003");
	const rows = [
		{ url: "https://other.fr/", code_http: 200, verifie_at: "2026-11-22T09:00:00.000Z", ms: 10 },
		{ url: target.url, code_http: 200, verifie_at: "not-a-date", ms: 10 },
	];
	assert.deepEqual(observationsFromDbProofs(rows, [target]), []);
	assert.equal(normalizeProofUrl(" HTTPS://EXAMPLE.FR/path/ "), "https://example.fr/path");
});

test("an exposition HTTP proof becomes a dated observation for every service sharing its URL", () => {
	const shared = service("na-edu-010");
	const alias = { ...service("na-edu-011"), url: "https://WWW.EXAMPLE.FR/na-edu-010/" };
	const rows = [
		{ url: "http://example.fr/na-edu-010/", status: 200, consulted_at: "2026-11-22T02:56:10.309Z" },
	];
	assert.deepEqual(observationsFromExpositionProofs(rows, [shared, alias]), [
		{
			serviceId: "na-edu-010", day: "2026-11-22", ok: true, status: 200,
			latencyMs: 0, observedAt: "2026-11-22T02:56:10.309Z", failure: null,
		},
		{
			serviceId: "na-edu-011", day: "2026-11-22", ok: true, status: 200,
			latencyMs: 0, observedAt: "2026-11-22T02:56:10.309Z", failure: null,
		},
	]);
});

test("an exposition proof on the corpus final URL maps to its service", () => {
	const target = { ...service("na-edu-033"), url: "https://lycee-foyen.fr", proofUrl: "https://app.lycee-foyen.fr/" };
	const rows = [
		{ url: "https://APP.LYCEE-FOYEN.FR", status: 200, consulted_at: "2026-11-22T03:25:37.499Z" },
	];
	assert.deepEqual(observationsFromExpositionProofs(rows, [target]), [
		{
			serviceId: "na-edu-033", day: "2026-11-22", ok: true, status: 200,
			latencyMs: 0, observedAt: "2026-11-22T03:25:37.499Z", failure: null,
		},
	]);
});

test("a Wayback CDX matrix becomes dated HTTP captures", () => {
	const rows = [
		["timestamp", "original", "statuscode"],
		["20261118123456", "http://example.fr/a", "200"],
		["invalid", "http://example.fr/b", "200"],
	];
	assert.deepEqual(parseArchiveCaptures(rows), [
		{ timestamp: "20261118123456", original: "http://example.fr/a", status: 200 },
	]);
});

test("only successful in-window archive captures yield perimeter service-days", () => {
	const target = service("na-edu-040");
	const captures = [
		{ timestamp: "20261119010203", original: "https://WWW.EXAMPLE.FR/na-edu-040/", status: 301 },
		{ timestamp: "20261118110203", original: "https://example.fr/na-edu-040/", status: 503 },
		{ timestamp: "20261117110203", original: "https://example.fr/na-edu-040/", status: 200 },
		{ timestamp: "20261120110203", original: "https://other.fr/page", status: 200 },
	];
	assert.deepEqual(
		[...capturableServiceDays(captures, [target], "2026-11-18", "2026-11-20")],
		["na-edu-040\u00002026-11-19"]
	);
});

test("an incomplete archive sweep is reported as indeterminate", () => {
	assert.equal(archiveAuditVerdict(1, 0), "indeterminate");
	assert.equal(archiveAuditVerdict(0, 0), "no_captures");
	assert.equal(archiveAuditVerdict(0, 2), "captures_found");
});
