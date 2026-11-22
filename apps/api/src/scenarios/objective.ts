/** Measurable objective for the crisis-scenario chantier. */

export type ObjectiveInputs = {
	baseline: { organizations: number; sources: number; events: number };
	scenarioCount: number;
	outsideNaCount: number;
	personalDataCount: number;
	paidServiceCount: number;
	unsourcedCount: number;
};

export const OBJECTIVE = {
	minScenarios: 10,
	minOrganizations: 1_000_000,
	minSources: 300,
	minEvents: 20_000,
	maxOutsideNa: 0,
	maxPersonalData: 0,
	maxPaidServices: 0,
	maxUnsourced: 0,
} as const;

export type ObjectiveCheck = { label: string; expected: string; observed: string; passed: boolean };
export type ObjectiveVerdict = { met: boolean; checks: ObjectiveCheck[] };

export function assessObjective(inputs: ObjectiveInputs): ObjectiveVerdict {
	const checks: ObjectiveCheck[] = [
		{
			label: "scenarios produced from real data",
			expected: `>= ${OBJECTIVE.minScenarios}`,
			observed: String(inputs.scenarioCount),
			passed: inputs.scenarioCount >= OBJECTIVE.minScenarios,
		},
		{
			label: "baseline organizations",
			expected: `>= ${OBJECTIVE.minOrganizations}`,
			observed: String(inputs.baseline.organizations),
			passed: inputs.baseline.organizations >= OBJECTIVE.minOrganizations,
		},
		{
			label: "baseline sources",
			expected: `>= ${OBJECTIVE.minSources}`,
			observed: String(inputs.baseline.sources),
			passed: inputs.baseline.sources >= OBJECTIVE.minSources,
		},
		{
			label: "baseline events",
			expected: `>= ${OBJECTIVE.minEvents}`,
			observed: String(inputs.baseline.events),
			passed: inputs.baseline.events >= OBJECTIVE.minEvents,
		},
		{
			label: "scenarios outside Nouvelle-Aquitaine",
			expected: String(OBJECTIVE.maxOutsideNa),
			observed: String(inputs.outsideNaCount),
			passed: inputs.outsideNaCount === OBJECTIVE.maxOutsideNa,
		},
		{
			label: "scenarios carrying victim personal data",
			expected: String(OBJECTIVE.maxPersonalData),
			observed: String(inputs.personalDataCount),
			passed: inputs.personalDataCount === OBJECTIVE.maxPersonalData,
		},
		{
			label: "scenarios relying on a paid service",
			expected: String(OBJECTIVE.maxPaidServices),
			observed: String(inputs.paidServiceCount),
			passed: inputs.paidServiceCount === OBJECTIVE.maxPaidServices,
		},
		{
			label: "scenarios without a real source",
			expected: String(OBJECTIVE.maxUnsourced),
			observed: String(inputs.unsourcedCount),
			passed: inputs.unsourcedCount === OBJECTIVE.maxUnsourced,
		},
	];
	return { met: checks.every((check) => check.passed), checks };
}
