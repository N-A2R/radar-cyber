/**
 * Offline audit of the seven-day windows that could reach full coverage with
 * the observations actually committed. No network, no database, no
 * extrapolation: every candidate window is measured against the same perimeter.
 */
import type { PublicService } from "./perimeter.js";
import { measureAvailability } from "./measure.js";
import { evaluateCoverage } from "./objective.js";
import type { DailyObservation } from "./probe.js";
import { dayKeys } from "./observations.js";

const DAY_MS = 86_400_000;

export type WindowAudit = {
	anchor: string;
	observedServiceDays: number;
	targetServiceDays: number;
	status: "atteint" | "partiel";
};

/** Candidate anchors: each observed day and the six days following it. */
export function candidateAnchors(observations: DailyObservation[]): string[] {
	const anchors = new Set<string>();
	for (const observation of observations) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(observation.day)) continue;
		const start = Date.parse(`${observation.day}T00:00:00.000Z`);
		if (!Number.isFinite(start)) continue;
		for (let offset = 0; offset < 7; offset += 1) {
			anchors.add(new Date(start + offset * DAY_MS).toISOString().slice(0, 10));
		}
	}
	return [...anchors].sort();
}

/** Measure every candidate window once, without adding or changing data. */
export function auditWindows(
	observations: DailyObservation[],
	services: PublicService[],
	anchors = candidateAnchors(observations)
): WindowAudit[] {
	return anchors.map((anchor) => {
		const summary = measureAvailability(observations, services, anchor);
		const coverage = evaluateCoverage(summary);
		return {
			anchor,
			observedServiceDays: coverage.observedServiceDays,
			targetServiceDays: coverage.targetServiceDays,
			status: coverage.label,
		};
	});
}

/**
 * Widest coverage reachable by any anchor in an inclusive UTC day range.
 * Only committed observations count: unobserved future days stay missing.
 */
export function maxObservedInRange(
	observations: DailyObservation[],
	services: PublicService[],
	fromDay: string,
	toDay: string
): { scannedAnchors: number; maxObservedServiceDays: number; targetServiceDays: number; fullWindows: number } {
	const start = Date.parse(`${fromDay}T00:00:00.000Z`);
	const end = Date.parse(`${toDay}T00:00:00.000Z`);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
		throw new RangeError(`Invalid scan range: ${fromDay}..${toDay}`);
	}
	const targetServiceDays = services.length * 7;
	let scannedAnchors = 0;
	let maxObservedServiceDays = 0;
	let fullWindows = 0;
	for (let time = start; time <= end; time += DAY_MS) {
		const anchor = new Date(time).toISOString().slice(0, 10);
		const { observedServiceDays } = measureAvailability(observations, services, anchor);
		scannedAnchors += 1;
		maxObservedServiceDays = Math.max(maxObservedServiceDays, observedServiceDays);
		if (observedServiceDays === targetServiceDays) fullWindows += 1;
	}
	return { scannedAnchors, maxObservedServiceDays, targetServiceDays, fullWindows };
}

/**
 * First anchor from `fromDay` whose seven-day window can still be complete:
 * every earlier day must already hold one observation per service, while days
 * from `fromDay` onward remain collectable. Nothing is fabricated or carried
 * forward: future days are only candidates for a real future collection.
 */
export function earliestAttainableAnchor(
	observations: DailyObservation[],
	services: PublicService[],
	fromDay: string,
	maxAnchors = 366
): string | null {
	const start = Date.parse(`${fromDay}T00:00:00.000Z`);
	if (!Number.isFinite(start)) throw new RangeError(`Invalid anchor day: ${fromDay}`);
	const perimeter = new Set(services.map((service) => service.id));
	const counts = new Map<string, number>();
	for (const observation of observations) {
		if (!perimeter.has(observation.serviceId)) continue;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(observation.day)) continue;
		counts.set(observation.day, (counts.get(observation.day) ?? 0) + 1);
	}
	for (let offset = 0; offset < maxAnchors; offset += 1) {
		const anchor = new Date(start + offset * DAY_MS).toISOString().slice(0, 10);
		const complete = dayKeys(anchor).every(
			(day) => day >= fromDay || (counts.get(day) ?? 0) >= services.length
		);
		if (complete) return anchor;
	}
	return null;
}

/**
 * Whether a complete seven-day window exists using only observations already
 * available by `asOfDay`. A later anchor still needs real future collections,
 * so it must not be reported as attainable today.
 */
export function attainableBy(
	observations: DailyObservation[],
	services: PublicService[],
	fromDay: string,
	asOfDay: string
): boolean {
	if (!Number.isFinite(Date.parse(`${asOfDay}T00:00:00.000Z`))) {
		throw new RangeError(`Invalid as-of day: ${asOfDay}`);
	}
	const earliest = earliestAttainableAnchor(observations, services, fromDay);
	return earliest !== null && earliest <= asOfDay;
}
