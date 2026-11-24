/** Trace durable des refus du moteur de détection dans le journal de vérité. */
import { MOTEURS, consigner, type JournalEntry } from "../journal/index.js";

export type DetectionStage =
	| "scope_gate"
	| "global_threshold"
	| "rule_threshold"
	| "cross_flow_dedup"
	| "false_event";

export type DetectionDecision = {
	stage: DetectionStage;
	reason: string;
	verdict: "refuse" | "indisponible";
	eventId?: number;
	ruleId?: string;
	score?: number;
	threshold?: number;
	model?: string;
	scope?: string;
};

/** Consigne un refus : aucun rejet du détecteur ne reste sans trace durable. */
export async function recordDetectionDecision(decision: DetectionDecision): Promise<void> {
	const payload: Record<string, unknown> = {
		stage: decision.stage,
		reason: decision.reason,
		verdict: decision.verdict,
	};
	if (decision.ruleId !== undefined) payload.ruleId = decision.ruleId;
	if (decision.score !== undefined) payload.score = decision.score;
	if (decision.threshold !== undefined) payload.threshold = decision.threshold;
	if (decision.model !== undefined) payload.model = decision.model;
	if (decision.eventId !== undefined) payload.eventId = decision.eventId;
	if (decision.scope !== undefined) payload.scope = decision.scope;

	const entry: JournalEntry = {
		kind: "detection.decision",
		subject: decision.eventId !== undefined ? `event:${decision.eventId}` : "event:inconnu",
		summary: `${decision.stage} : ${decision.reason} (${decision.verdict})`,
		actor: `moteur:${MOTEURS.detection}`,
		payload,
	};
	const result = await consigner(entry);
	if (!result.ok) {
		console.warn(JSON.stringify({ detect: "decision_journal_failed", stage: decision.stage, error: result.error }));
	}
}
