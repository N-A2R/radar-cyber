/**
 * Offline audit of the seven-day windows that could reach full coverage with
 * the observations actually committed. No network, no database, no
 * extrapolation: every candidate window is measured against the same perimeter.
 */
import type { PublicService } from "./perimeter.js";
import { measureAvailability } from "./measure.js";
import { evaluateCoverage } from "./objective.js";
import type { DailyObservation } from "./probe.js";

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
