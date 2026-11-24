import type { KeyboardEvent } from "react";

/**
 * Keep Tab and Shift+Tab inside an open modal dialog. The dialog itself owns
 * the keydown handler; only its first and last controls need wrap-around.
 * Astryx-compatible : piège de focus uniquement, sans surface de design
 * (ni couleur, ni chrome) à tokeniser.
 */
export function keepFocusInDialog(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Tab") return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
    "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
  )];
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
