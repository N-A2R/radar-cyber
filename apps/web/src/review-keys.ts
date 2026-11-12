/**
 * Décisions clavier de la file de revue — fonction pure.
 *
 * Sortie du composant pour être testable sans DOM : le poste de triage se
 * pilote au clavier, et un raccourci qui décide à la place de l'analyste est
 * un bug de fond, pas de mise en page. Le composant applique l'intention ;
 * ce module ne fait que la calculer.
 */
import type { ReviewAction } from "./api.js";

export type ReviewKeyState = {
	count: number;
	active: number;
	selected: ReadonlySet<number>;
	ids: readonly number[];
	rejecting: boolean;
};

export type ReviewIntent =
	| { kind: "none" }
	| { kind: "move"; active: number }
	| { kind: "toggle"; id: number }
	| { kind: "selectAll" }
	| { kind: "clear" }
	| { kind: "askReject" }
	| { kind: "cancelReject" }
	| { kind: "act"; action: ReviewAction; ids: number[] };

/** Cibles d'une décision : la sélection si elle existe, sinon le fait courant. */
export function reviewTargets(state: ReviewKeyState): number[] {
	if (state.selected.size > 0) return [...state.selected];
	const id = state.ids[state.active];
	return id === undefined ? [] : [id];
}

/**
 * Traduit une touche en intention. `key` est la valeur brute de l'événement ;
 * `shift` n'est lu que pour Maj+A. Pendant la saisie d'un motif de rejet,
 * aucune touche ne décide : l'analyste écrit du texte.
 */
export function reviewIntent(key: string, shift: boolean, state: ReviewKeyState): ReviewIntent {
	if (state.rejecting) {
		return key === "Escape" ? { kind: "cancelReject" } : { kind: "none" };
	}
	const k = key.length === 1 ? key.toLowerCase() : key;
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
