/**
 * Measurement layer for the reconnaissance-phase detector.
 *
 * Reads the three observation stores through `loadReconnaissanceInput()`, runs
 * the pure `detectReconnaissance()` rule and publishes only identifiers,
 * department codes, signal names and counters. No organization name, hostname,
 * IP address or victim payload is returned.
 */
import { detectReconnaissance, type Detection, type ReconSignal } from "./detect.js";
import { loadReconnaissanceInput, type ReconBaseline } from "./load.js";

export type ReconObservations = {
	exposures: number;
	subdomains: number;
	dns: number;
};

export type ReconMeasurement = {
	scope: "nouvelle-aquitaine";
	basis: "observable-attack-surface";
	/** Distinct organizations with at least one verified signal. */
	count: number;
	candidates: number;
	falsePositives: number;
	falsePositiveRate: number;
	signals: Record<ReconSignal, number>;
	candidateSignals: Record<ReconSignal, number>;
	observations: ReconObservations;
	baseline: ReconBaseline;
	detections: Detection[];
	measuredAt: string;
};

export async function measureReconnaissance(): Promise<ReconMeasurement> {
	const { input, baseline } = await loadReconnaissanceInput();
	const result = detectReconnaissance(input);
	return {
		scope: "nouvelle-aquitaine",
		basis: "observable-attack-surface",
		count: result.detections.length,
		candidates: result.candidates,
		falsePositives: result.falsePositives,
		falsePositiveRate: result.falsePositiveRate,
		signals: result.signals,
		candidateSignals: result.candidateSignals,
		observations: {
			exposures: input.exposures.length,
			subdomains: input.subdomains.length,
			dns: input.dns.length,
		},
		baseline,
		detections: result.detections,
		measuredAt: new Date().toISOString(),
	};
}
