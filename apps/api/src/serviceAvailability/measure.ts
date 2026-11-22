/**
 * Seven-day availability measurement, computed offline from committed daily
 * observations. No network, no database and no victim data are involved.
 *
 * A service-day is one service observed on one UTC day of the window. The
 * published availability is the share of observed service-days with a
 * successful HTTP response. Coverage is published next to it so a low number
 * of observed days can never be mistaken for a service outage.
 */
import { dayKeys, mergeDaily } from "./observations.js";
import type { DailyObservation } from "./probe.js";
import type { PublicService } from "./perimeter.js";

export const WINDOW_DAYS = 7;

export type DaySummary = {
	day: string;
	observed: number;
	available: number;
	availabilityPct: number;
};

export type AvailabilitySummary = {
	anchor: string;
	window: string[];
	perimeterSize: number;
	servicesObserved: number;
	servicesFullyObserved: number;
	servicesNeverAvailable: number;
	observedServiceDays: number;
	availableServiceDays: number;
	availabilityPct: number;
	coveragePct: number;
	perDay: DaySummary[];
};

function percent(numerator: number, denominator: number): number {
	if (denominator === 0) return 0;
	return Math.round((10_000 * numerator) / denominator) / 100;
}

export function measureAvailability(
	observations: DailyObservation[],
	services: PublicService[],
	anchor: string,
	windowDays = WINDOW_DAYS
): AvailabilitySummary {
	const window = dayKeys(anchor, windowDays);
	const allowed = new Set(window);
	const perimeter = new Set(services.map((service) => service.id));
	const daily = mergeDaily(observations).filter(
		(row) => allowed.has(row.day) && perimeter.has(row.serviceId)
	);

	const byDay = new Map<string, DaySummary>();
	for (const day of window) byDay.set(day, { day, observed: 0, available: 0, availabilityPct: 0 });
	const perService = new Map<string, { observed: number; available: number }>();
	let observedServiceDays = 0;
	let availableServiceDays = 0;

	for (const row of daily) {
		const day = byDay.get(row.day);
		if (day === undefined) continue;
		day.observed += 1;
		if (row.ok) day.available += 1;
		observedServiceDays += 1;
		if (row.ok) availableServiceDays += 1;
		const stat = perService.get(row.serviceId) ?? { observed: 0, available: 0 };
		stat.observed += 1;
		if (row.ok) stat.available += 1;
		perService.set(row.serviceId, stat);
	}

	return {
		anchor,
		window,
		perimeterSize: services.length,
		servicesObserved: perService.size,
		servicesFullyObserved: [...perService.values()].filter((stat) => stat.observed === windowDays).length,
		servicesNeverAvailable: [...perService.values()].filter((stat) => stat.available === 0).length,
		observedServiceDays,
		availableServiceDays,
		availabilityPct: percent(availableServiceDays, observedServiceDays),
		coveragePct: percent(observedServiceDays, services.length * windowDays),
		perDay: window.map((day) => {
			const stat = byDay.get(day) ?? { day, observed: 0, available: 0, availabilityPct: 0 };
			return { ...stat, availabilityPct: percent(stat.available, stat.observed) };
		}),
	};
}
