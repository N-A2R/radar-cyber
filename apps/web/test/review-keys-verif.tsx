/**
 * Module de touches de la file de revue — 8 cas, sans DOM.
 *
 *   pnpm -F @radar/web run test:keys
 */
import { isReviewTypingTarget, reviewIntent, type ReviewKeyState } from "../src/review-keys";

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  checks++;
  if (ok) console.log(`OK   ${label}`);
  else {
    failures++;
    console.error(`FAIL ${label}`, detail === undefined ? "" : detail);
  }
}

const base: ReviewKeyState = {
  count: 4,
  active: 1,
  selected: new Set(),
  ids: [11, 12, 13, 14],
  rejecting: false,
};
const intent = (key: string, shift = false, state: ReviewKeyState = base) => reviewIntent(key, shift, state);
const activeAfter = (key: string, state: ReviewKeyState = base): number | undefined => {
  const next = intent(key, false, state);
  return next.kind === "move" ? next.active : undefined;
};

const down = intent("j");
const up = intent("k");
check("J descend, K monte", down.kind === "move" && down.active === 2
  && up.kind === "move" && up.active === 0, { down, up });

check("navigation bornée en haut et en bas",
  activeAfter("j", { ...base, active: 3 }) === 3 && activeAfter("k", { ...base, active: 0 }) === 0);

const accept = intent("a");
check("A accepte le fait courant", accept.kind === "decide" && accept.decision === "accepter", accept);

check("R ouvre le refus", intent("r").kind === "askReject");

const create = intent("c");
check("C ouvre la création d'organisation", create.kind === "decide" && create.decision === "creer", create);

const helpOpen: ReviewKeyState = { ...base, help: true };
check("? affiche l'aide, Échap la ferme et bloque le reste",
  intent("?").kind === "help" && intent("Escape", false, helpOpen).kind === "help"
  && intent("j", false, helpOpen).kind === "none");

check("Échap ferme la décision en cours",
  intent("Escape", false, { ...base, rejecting: true }).kind === "cancelReject");

const textarea = { tagName: "TEXTAREA" } as unknown as EventTarget;
const input = { tagName: "INPUT" } as unknown as EventTarget;
const div = { tagName: "DIV" } as unknown as EventTarget;
const typing: ReviewKeyState = { ...base, typing: true, rejecting: true };
check("champ de saisie : aucune touche sauf Échap",
  isReviewTypingTarget(textarea) && isReviewTypingTarget(input) && !isReviewTypingTarget(div)
  && ["j", "k", "a", "r", "c", "?"].every((key) => intent(key, false, typing).kind === "none")
  && intent("Escape", false, typing).kind === "cancelReject");

console.log(`\n${checks - failures}/${checks} cas du module de touches passent.`);
process.exit(failures > 0 ? 1 : 0);
