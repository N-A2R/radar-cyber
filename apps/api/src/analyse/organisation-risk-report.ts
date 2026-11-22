/**
 * Reader for the published organisation risk measurement.
 *
 * The measurement script writes one JSON file; both the API and the report
 * read that file, so the ROC curve, AUC and the model used to score an
 * organisation always come from the same verified run.
 */
import { readFileSync } from "node:fs";
import type { RiskModel, RiskSignals } from "./organisation-risk.js";

export const RISK_NA_DEPARTMENTS = [
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;
export const RISK_REFERENCE_DATE = "2026-11-22";

export type PublishedRiskReport = {
	generatedAt: string;
	command: string;
	referenceDate: string;
	definitions: Record<string, string>;
	snapshot: Record<string, number>;
	population: { totalOrganisations: number; incidentOrganisations: number };
	cohort: { total: number; positives: number; negatives: number; folds: number };
	model: RiskModel;
	evaluation: {
		auc: number;
		rocArea: number;
		rocPoints: Array<{ threshold: number | null; truePositiveRate: number; falsePositiveRate: number }>;
		scoreBuckets: Array<{ from: number; to: number; organisations: number }>;
	};
};

export type RiskSignalRow = {
	ambient_events: number | string;
	ambient_sources: number | string;
	max_severity: number | string;
	days_ago: number | string | null;
	has_public_domain: number | string;
	is_services: number | string;
	is_commerce: number | string;
	is_construction: number | string;
	is_sante: number | string;
	is_industrie: number | string;
};

const REPORT_URL = new URL("../../../../bench/results/organisation-risk.json", import.meta.url);

export function loadRiskReport(): PublishedRiskReport {
	return JSON.parse(readFileSync(REPORT_URL, "utf8")) as PublishedRiskReport;
}

/** Numeric-only public aggregates; no organisation or victim text is read. */
export function riskSignalsFromRow(row: RiskSignalRow): RiskSignals {
	const flag = (value: number | string): 0 | 1 => (Number(value) === 1 ? 1 : 0);
	return {
		ambientEvents: Number(row.ambient_events),
		ambientSources: Number(row.ambient_sources),
		maxSeverity: Number(row.max_severity),
		lastObservedDaysAgo: row.days_ago === null ? null : Number(row.days_ago),
		hasPublicDomain: flag(row.has_public_domain),
		isServices: flag(row.is_services),
		isCommerce: flag(row.is_commerce),
		isConstruction: flag(row.is_construction),
		isSante: flag(row.is_sante),
		isIndustrie: flag(row.is_industrie),
	};
}
