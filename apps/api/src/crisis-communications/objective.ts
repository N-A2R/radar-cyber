/** Measurable objective for the crisis-communication chantier. */

export type ObjectiveInputs = {
	detections: number;
	datedDetections: number;
	pressPagesAccepted: number;
	outsideNaAccepted: number;
};

export const OBJECTIVE = {
	minDetections: 17,
	minDatedDelays: 8,
	maxPressPagesAccepted: 0,
	maxOutsideNaAccepted: 0,
} as const;

export type ObjectiveVerdict = {
	met: boolean;
	checks: { label: string; expected: string; observed: string; passed: boolean }[];
};

export function assessObjective(inputs: ObjectiveInputs): ObjectiveVerdict {
	const checks = [
		{
			label: "first-party crisis pages detected",
			expected: `>= ${OBJECTIVE.minDetections}`,
			observed: String(inputs.detections),
			passed: inputs.detections >= OBJECTIVE.minDetections,
		},
		{
			label: "incident-to-publication delays measured",
			expected: `>= ${OBJECTIVE.minDatedDelays}`,
			observed: String(inputs.datedDetections),
			passed: inputs.datedDetections >= OBJECTIVE.minDatedDelays,
		},
		{
			label: "press pages wrongly accepted",
			expected: String(OBJECTIVE.maxPressPagesAccepted),
			observed: String(inputs.pressPagesAccepted),
			passed: inputs.pressPagesAccepted <= OBJECTIVE.maxPressPagesAccepted,
		},
		{
			label: "out-of-region pages wrongly accepted",
			expected: String(OBJECTIVE.maxOutsideNaAccepted),
			observed: String(inputs.outsideNaAccepted),
			passed: inputs.outsideNaAccepted <= OBJECTIVE.maxOutsideNaAccepted,
		},
	];
	return { met: checks.every((check) => check.passed), checks };
}
