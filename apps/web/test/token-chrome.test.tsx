// @vitest-environment jsdom
/**
 * M10 : les surfaces réparées ne portent plus de chrome codé en dur.
 * Les styles inline sont vérifiés sur le DOM rendu ; les feuilles sont lues
 * uniquement pour ce que jsdom ne peut pas calculer sans moteur CSS.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MapLegend } from "../src/components/MapLegend";
import HealthView from "../src/components/HealthView";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const pont = readFileSync(resolve("src/styles.css"), "utf8");
const sante = readFileSync(resolve("src/components/health-view.css"), "utf8");
const sources = readFileSync(resolve("src/components/sources.css"), "utf8");

function regle(feuille: string, selecteur: string): string {
  const debut = feuille.indexOf(selecteur);
  if (debut < 0) throw new Error(`règle introuvable : ${selecteur}`);
  const fin = feuille.indexOf("}", debut);
  return feuille.slice(debut, fin);
}

beforeAll(() => {
  // HealthView en mode démo ne part pas chercher /api/health/sources.
  vi.stubEnv("VITE_DATA_MODE", "mock");
});

afterEach(() => vi.unstubAllEnvs());

describe("chrome à jetons", () => {
  let host: HTMLDivElement;
  let root: Root | undefined;

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    host?.remove();
  });

  it("ne rend aucun style inline de chrome sur les surfaces réparées", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    await act(async () => {
      root = createRoot(host);
      root.render(
        <>
          <HealthView sources={[]} loading={false} />
          <MapLegend families={["cert_fr", "ransomware", "phishing"]} />
        </>,
      );
    });

    const styles = [...host.querySelectorAll<HTMLElement>("[style]")];
    // Astryx pose ses propres variables de débordement : seules les
    // propriétés de chrome (couleur, police, rayon) sont interdites en inline.
    const chrome = styles.filter((element) =>
      /(?:^|;)\s*(?:color|background|background-color|font(?:-family|-size)?|border-radius)\s*:/i
        .test(element.getAttribute("style") ?? ""));
    expect(chrome).toEqual([]);
    for (const element of host.querySelectorAll<HTMLElement>("[class*='health-view__'], [class*='map-legend__']")) {
      expect(element.hasAttribute("style"), element.outerHTML.slice(0, 120)).toBe(false);
    }
  });
  it("résout badge et pastilles par jetons, sans couleur ni rayon codés en dur", () => {
    for (const selecteur of [
      ".live-map-badge", ".skip-link", ".map-legend__dot", ".map-legend__chip",
      ".map-legend__dot[data-sev=\"1\"]", ".map-legend__chip[data-family=\"ransomware\"]",
    ]) {
      const corps = regle(pont, selecteur);
      expect(corps, selecteur).not.toMatch(/(?:color|background|border-radius|font)\s*:\s*(?:#|rgba?\(|[\w-]+\s+px)/i);
    }
    expect(regle(pont, ".map-legend__dot[data-sev=\"1\"]")).toContain("var(--sev-1)");
    expect(regle(pont, ".map-legend__chip[data-family=\"ransomware\"]")).toContain("var(--family-ransomware)");
  });

  it("remplace les anciens inline styles par des règles à jetons", () => {
    const toolbar = regle(sante, ".health-view__toolbar");
    expect(toolbar).toContain("display: flex");
    expect(toolbar).toContain("var(--space-3)");
    expect(regle(sante, ".health-view__toolbar label")).toContain("var(--text-label)");
    expect(regle(sante, "table.data th[data-num=\"true\"]")).toContain("text-align: right");
    expect(regle(sources, ".sources-view__summary[data-tone=\"error\"]")).toContain("var(--text-error)");
  });
});
