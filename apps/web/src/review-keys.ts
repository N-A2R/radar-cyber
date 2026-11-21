/**
 * Keyboard decisions for the review queue — pure function.
 *
 * Kept out of the component so it can be tested without a DOM: this is a
 * triage workstation, and a shortcut deciding on the analyst's behalf would
 * be a fundamental bug, not a layout detail. The component applies the
 * intent; this module only computes it.
 */
import type { ReviewAction } from "./api.js";

export type ReviewKeyState = {
	count: number;
	active: number;
	selected: ReadonlySet<number>;
	ids: readonly number[];
	rejecting: boolean;
	/** Help is open: only Escape answers, to close it. */
	help?: boolean;
	/** Focus is in a field: characters belong to the text. */
	typing?: boolean;
};

export type ReviewDecisionKey = "accepter" | "creer";

export type ReviewIntent =
	| { kind: "none" }
	| { kind: "move"; active: number }
	| { kind: "toggle"; id: number }
	| { kind: "selectAll" }
	| { kind: "clear" }
	| { kind: "askReject" }
	| { kind: "cancelReject" }
	| { kind: "decide"; decision: ReviewDecisionKey }
	| { kind: "help" }
	| { kind: "act"; action: ReviewAction; ids: number[] };

/** Fields where a letter is text, not a shortcut. */
export function isReviewTypingTarget(target: EventTarget | null): boolean {
	if (!target) return false;
	const el = target as { tagName?: string; isContentEditable?: boolean };
	const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}


/** Targets of a decision: the selection when present, otherwise the current row. */
export function reviewTargets(state: ReviewKeyState): number[] {
	if (state.selected.size > 0) return [...state.selected];
	const id = state.ids[state.active];
	return id === undefined ? [] : [id];
}

/**
 * Turns a raw key into an intent. `shift` is used for Shift+A and `?`.
 * Inside a field no key decides — except Escape, which closes help or the
 * decision form.
 */
export function reviewIntent(key: string, shift: boolean, state: ReviewKeyState): ReviewIntent {
	if (state.typing && key !== "Escape") return { kind: "none" };
	if (state.help) return key === "Escape" ? { kind: "help" } : { kind: "none" };
	if (state.rejecting) {
		return key === "Escape" ? { kind: "cancelReject" } : { kind: "none" };
	}
	const k = key.length === 1 ? key.toLowerCase() : key;
	if (k === "?" || (k === "/" && shift)) return { kind: "help" };
	if (k === "ArrowDown" || k === "j") {
		return { kind: "move", active: Math.min(state.active + 1, Math.max(0, state.count - 1)) };
	}
	if (k === "ArrowUp" || k === "k") {
		return { kind: "move", active: Math.max(state.active - 1, 0) };
	}
	if (k === "x") {
		const id = state.ids[state.active];
		return id === undefined ? { kind: "none" } : { kind: "toggle", id };
	}
	if ((k === "A" && shift) || (k === "a" && shift)) return { kind: "selectAll" };
	if (k === "a") return { kind: "decide", decision: "accepter" };
	if (k === "c") return { kind: "decide", decision: "creer" };
	if (k === "Escape") return { kind: "clear" };
	if (k === "r") return reviewTargets(state).length ? { kind: "askReject" } : { kind: "none" };
	const actions: Record<string, ReviewAction> = { p: "promote", m: "review", u: "undo" };
	const action = actions[k];
	if (action) {
		const ids = reviewTargets(state);
		return ids.length ? { kind: "act", action, ids } : { kind: "none" };
	}
	return { kind: "none" };
}

/** Applique les intentions de navigation et de sélection à l'état local. */
export function reduceSelection(
	intent: ReviewIntent,
	state: ReviewKeyState,
): { active: number; selected: Set<number> } {
	const selected = new Set(state.selected);
	switch (intent.kind) {
		case "move":
			return { active: intent.active, selected };
		case "toggle":
			if (selected.has(intent.id)) selected.delete(intent.id);
			else selected.add(intent.id);
			return { active: state.active, selected };
		case "selectAll":
			return { active: state.active, selected: new Set(state.ids) };
		case "clear":
			return { active: state.active, selected: new Set() };
		default:
			return { active: state.active, selected };
	}
}
