/**
 * Coverage of the seven-day window, kept separate from availability.
 *
 * A day without any observation is missing data, never a service outage. This
 * module only counts what the committed observations contain: it never fills a
 * gap by extrapolation or by carrying an older observation forward.
 */
import { type AvailabilitySummary, WINDOW_DAYS } from "./measure.js";

export type CoverageStatus = {
	label: "atteint" | "partiel";
	daysObserved: number;
	targetDays: number;
	observedServiceDays: number;
	targetServiceDays: number;
	missingDays: string[];
	missingServiceDays: number;
};

/** Compare a measured window with the seven-day coverage target. */
export function evaluateCoverage(summary: AvailabilitySummary): CoverageStatus {
	const missingDays = summary.perDay.filter((day) => day.observed === 0).map((day) => day.day);
	const targetDays = summary.perDay.length || WINDOW_DAYS;
	const targetServiceDays = summary.perimeterSize * targetDays;
	const observedServiceDays = summary.observedServiceDays;
	return {
		label: missingDays.length === 0 && observedServiceDays === targetServiceDays ? "atteint" : "partiel",
		daysObserved: targetDays - missingDays.length,
		targetDays,
		observedServiceDays,
		targetServiceDays,
		missingDays,
		missingServiceDays: targetServiceDays - observedServiceDays,
	};
}
