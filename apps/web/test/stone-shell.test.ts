// @vitest-environment jsdom
/**
 * Le shell du radar est un pont de jetons Stone : la structure à quatre
 * destinations et le verre du chrome sont vérifiés sur les feuilles elles-mêmes.
 * Aucun rendu navigateur n'est nécessaire pour ces invariants de cascade.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const feuilles = Object.fromEntries(
  ["styles.css", "components/feed.css", "components/alerts.css", "components/sources.css",
    "components/live-alerts.css", "components/login.css"]
    .map((chemin) => [chemin, readFileSync(resolve("src", chemin), "utf8")]),
) as Record<string, string>;

const shell = feuilles["styles.css"];

function regle(feuille: string, selecteur: string): string {
  const debut = feuille.indexOf(selecteur);
  if (debut < 0) throw new Error(`règle introuvable : ${selecteur}`);
  const fin = feuille.indexOf("}", debut);
  return feuille.slice(debut, fin);
}

describe("shell Stone à quatre destinations", () => {
  it("alias le thème Stone et ne garde aucune référence à Gothic", () => {
    expect(shell).toContain("theme-stone");
    expect(shell).not.toContain("theme-gothic");
    expect(shell).toContain("--bg: var(--color-background-body)");
    expect(shell).toContain("--muted: var(--color-text-secondary)");
  });

  it("pose un verre à jetons, sans couleur de chrome codée en dur", () => {
    expect(shell).toContain("--glass: color-mix(");
    expect(shell).toContain("--glass-line: color-mix(");
    expect(regle(shell, ".shell__stage")).toContain("var(--glass-line)");
    expect(regle(shell, ".rail")).toContain("var(--glass-strong)");
    for (const [chemin, contenu] of Object.entries(feuilles)) {
      expect(contenu, chemin).not.toMatch(/linear-gradient|radial-gradient/);
    }
  });

  it("style la navigation segmentée et les contrôles en pilules", () => {
    expect(regle(shell, ".rail__nav")).toContain("var(--radius-full)");
    expect(regle(shell, ".rail__nav")).toContain("var(--surface-3)");
    expect(shell).toContain('[data-selected="selected"]');
    // La recherche ne se rétracte plus : elle garde sa taille intrinsèque et
    // la déconnexion conserve son libellé entier, même en navigation étroite.
    expect(regle(shell, ".rail__spacer + .astryx-button")).toContain("flex: 0 0 auto");
    expect(regle(shell, ".rail > .astryx-button:last-child")).toContain("min-width: max-content");
    expect(regle(shell, ".rail > .astryx-button:last-child")).toContain("white-space: nowrap");
    expect(regle(feuilles["components/feed.css"], ".family-filter__btn")).toContain("var(--control-h)");
  });

  it("garde le tiroir et les colonnes adapts sur les points de rupture", () => {
    expect(shell).toContain("@media (max-width: 1024px)");
    expect(shell).toContain("shell-drawer-in");
    expect(shell).toContain("@media (min-width: 1025px)");
    expect(shell).toContain('[data-feed="rail"][data-inspector="open"]');
    expect(shell).toContain("@media (max-width: 860px)");
  });
});
