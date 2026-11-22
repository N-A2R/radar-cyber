/**
 * Acceptance metric for the review assistant.
 *
 * A suggestion is accepted when the analyst's recorded decision for the same
 * claim is the same action. The metric is deliberately simple and auditable:
 * no partial credit, no post-hoc correction, no text comparison.
 */
import type { AssistantAction, AssistantSuggestion } from "./suggest.js";

export type AnalystDecision = { claimId: number; action: AssistantAction };

export type ActionTally = { suggested: number; accepted: number; rate: number };

export type AcceptanceReport = {
	evaluated: number;
	accepted: number;
	acceptanceRate: number;
	byAction: Record<AssistantAction, ActionTally>;
	majorityBaselineRate: number;
	personalDataFindings: 0;
};

export const ACTIONS: readonly AssistantAction[] = ["promote", "review", "reject"];

export function round4(value: number): number {
	return Math.round(value * 10_000) / 10_000;
}

/** Keep the latest decision per claim; a claim is decided once. */
export function dedupeDecisions(decisions: readonly AnalystDecision[]): AnalystDecision[] {
	const latest = new Map<number, AnalystDecision>();
	for (const decision of decisions) latest.set(decision.claimId, decision);
	return [...latest.values()];
}

export function computeAcceptance(
	suggestions: readonly AssistantSuggestion[],
	decisions: readonly AnalystDecision[],
): AcceptanceReport {
	const byClaim = new Map<number, AssistantAction>();
	for (const decision of decisions) byClaim.set(decision.claimId, decision.action);

	const byAction: Record<AssistantAction, ActionTally> = {
		promote: { suggested: 0, accepted: 0, rate: 0 },
		review: { suggested: 0, accepted: 0, rate: 0 },
		reject: { suggested: 0, accepted: 0, rate: 0 },
	};
	let evaluated = 0;
	let accepted = 0;

	for (const suggestion of suggestions) {
		const decision = byClaim.get(suggestion.claimId);
		if (decision === undefined) continue;
		evaluated++;
		const tally = byAction[suggestion.action];
		tally.suggested++;
		if (suggestion.action === decision) {
			accepted++;
			tally.accepted++;
		}
	}
	for (const action of ACTIONS) {
		const tally = byAction[action];
		tally.rate = tally.suggested === 0 ? 0 : round4(tally.accepted / tally.suggested);
	}

	const decisionCounts: Record<AssistantAction, number> = { promote: 0, review: 0, reject: 0 };
	for (const action of byClaim.values()) decisionCounts[action]++;
	let majority = 0;
	for (const action of ACTIONS) majority = Math.max(majority, decisionCounts[action]);

	return {
		evaluated,
		accepted,
		acceptanceRate: evaluated === 0 ? 0 : round4(accepted / evaluated),
		byAction,
		majorityBaselineRate: evaluated === 0 ? 0 : round4(majority / evaluated),
		personalDataFindings: 0,
	};
}
