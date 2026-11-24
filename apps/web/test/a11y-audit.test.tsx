// @vitest-environment jsdom
/**
 * Reproducible WCAG 2.0/2.1 A+AA audit of every screen of the web app.
 *
 * The app runs in mock mode: no network, no victim data. axe-core is the
 * measurement engine; the HTML shell (title, language) is copied from the
 * real index.html so that the jsdom run reflects the shipped page.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import axe from "axe-core";

vi.mock("../src/map/Map3D", () => ({
  default: () => <div role="img" aria-label="Carte territoriale" />,
}));

// The module reads VITE_DATA_MODE at import time: a static import would fix
// the environment before the stub is installed.
type AppType = typeof import("../src/App").default;

// Le rail ne porte plus que quatre destinations ; chaque écran historique est
// un onglet ou un panneau de l'une d'elles. Le libellé reste celui du rapport.
const DESTINATIONS = ["Carte", "Action", "Sources", "Journal"] as const;
type Destination = (typeof DESTINATIONS)[number];

const MAP_TABS = "Panneau de la Carte";
const MAP_REGION = "Panneau régional";
const MAP_GRAPH = "Vue du graphe";

// La destination Carte porte un panneau imbriqué par onglet : le contrôle
// régional n'existe que dans « carte », et « attributions » que dans « graphe ».
const VIEW_ROOTS: Record<Destination, string> = {
  Carte: "section.map-workspace",
  Action: "section.action-workspace",
  Sources: ".sws",
  Journal: "section.journal-workspace",
};
type Segment = { group: string; value: string };
type Screen = {
  label: string;
  view: Destination;
  tab?: string;
  segments?: readonly Segment[];
  /** État final attendu de `section.map-workspace[data-panel]`. */
  panel?: string;
};

const SCREENS: readonly Screen[] = [

  { label: "Carte — fil d'événements", view: "Carte", panel: "carte", segments: [{ group: MAP_TABS, value: "carte" }] },
  { label: "Carte — couverture", view: "Carte", panel: "couverture", segments: [
    { group: MAP_TABS, value: "carte" }, { group: MAP_REGION, value: "couverture" },
  ] },
  { label: "Carte — région", view: "Carte", panel: "regional", segments: [
    { group: MAP_TABS, value: "carte" }, { group: MAP_REGION, value: "regional" },
  ] },
  { label: "Carte — concerné", view: "Carte", panel: "affected", segments: [
    { group: MAP_TABS, value: "carte" }, { group: MAP_REGION, value: "affected" },
  ] },
  { label: "Graphe", view: "Carte", panel: "graph", segments: [{ group: MAP_TABS, value: "graphe" }] },
  { label: "Attributions", view: "Carte", panel: "attributions", segments: [
    { group: MAP_TABS, value: "graphe" }, { group: MAP_GRAPH, value: "attributions" },
  ] },
  { label: "Annuaire", view: "Carte", panel: "directory", segments: [{ group: MAP_TABS, value: "organisations" }] },
  { label: "Alertes", view: "Action", tab: "Alertes" },
  { label: "Revue", view: "Action", tab: "Revue" },
  { label: "Sources", view: "Sources", tab: "Registre" },
  { label: "Tableau de bord sources", view: "Sources", tab: "Indicateurs" },
  { label: "Santé", view: "Sources", tab: "Santé" },
  { label: "Corpus", view: "Sources", tab: "Corpus" },
  { label: "Journal", view: "Journal", tab: "Journal" },
  { label: "Dossier", view: "Journal", tab: "Dossier" },
];


const AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const INDEX_FILE = "index.html";

let App: AppType;
let host: HTMLDivElement;
let root: Root;

async function settle(ms = 40): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  await act(async () => { await promise; });
}

async function waitForHost<T extends HTMLElement>(
  description: string,
  query: () => T | null | undefined,
  timeoutMs = 5_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let element = query();
  while (!element && Date.now() < deadline) {
    await settle(20);
    element = query();
  }
  expect(element, description).toBeTruthy();
  return element!;
}

async function clickElement(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function selectSegment(groupLabel: string, value: string): Promise<void> {
  // Les contrôles segmentés sont imbriqués : le groupe régional n'existe que
  // dans l'onglet « carte », et « attributions » que dans « graphe ». On attend
  // le groupe puis son état coché, sans délai fixe après le clic.
  const group = await waitForHost(`panneau "${groupLabel}"`, () =>
    host.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${groupLabel}"]`));
  const segment = await waitForHost(`segment "${groupLabel} / ${value}"`, () =>
    group.querySelector<HTMLElement>(`[role="radio"][data-value="${value}"]`));
  await clickElement(segment);
  await waitForHost(`segment coché "${groupLabel} / ${value}"`, () =>
    host.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${groupLabel}"]`)
      ?.querySelector<HTMLElement>(`[role="radio"][data-value="${value}"][aria-checked="true"]`));
}

async function selectTab(label: string): Promise<void> {
  // Les onglets (Action, Sources, Journal) sont des boutons role="tab".
  const tab = await waitForHost(`onglet "${label}"`, () =>
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((candidate) => candidate.textContent?.trim() === label));
  await clickElement(tab);
  const selected = await waitForHost(`onglet sélectionné "${label}"`, () =>
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((candidate) => candidate.textContent?.trim() === label
        && candidate.getAttribute("aria-selected") === "true"));
  const panelId = selected.getAttribute("aria-controls");
  if (panelId) {
    await waitForHost(`panneau de l'onglet "${label}"`, () => document.getElementById(panelId));
  }
}

async function selectScreen(label: string): Promise<void> {
  const screen = SCREENS.find((candidate) => candidate.label === label);
  expect(screen, `écran "${label}"`).toBeTruthy();
  // Une destination à item unique (Action) peut porter un badge : son texte
  // commence par le libellé sans lui être strictement égal.
  const rail = [...host.querySelectorAll<HTMLElement>("nav.rail__nav a, nav.rail__nav button")]
    .find((candidate) => (candidate.textContent?.trim() ?? "").startsWith(screen!.view));
  expect(rail, `destination "${screen!.view}"`).toBeTruthy();
  await clickElement(rail!);
  await waitForHost(`destination "${screen!.view}"`, () =>
    host.querySelector<HTMLElement>(VIEW_ROOTS[screen!.view]));
  if (screen!.tab) await selectTab(screen!.tab);
  for (const segment of screen!.segments ?? []) await selectSegment(segment.group, segment.value);
  if (screen!.panel) {
    await waitForHost(`panneau Carte "${screen!.panel}"`, () =>
      host.querySelector<HTMLElement>(`section.map-workspace[data-panel="${screen!.panel}"]`));
  }
}

beforeAll(async () => {
  vi.stubEnv("VITE_DATA_MODE", "mock");
  vi.stubGlobal("EventSource", class { addEventListener() {} close() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
  const html = readFileSync(resolve(INDEX_FILE), "utf8");
  document.documentElement.lang = html.match(/<html[^>]*\blang="([^"]+)"/)?.[1] ?? "";
  document.title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
  App = (await import("../src/App")).default;
  (globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  localStorage.clear();
});

async function mountApp(): Promise<void> {
  localStorage.setItem("radar_token", "a11y-audit-token");
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<App />);
  });
  await waitForHost("rail du shell", () => host.querySelector<HTMLElement>("nav.rail__nav"));
}

async function openPalette(): Promise<void> {
  await mountApp();
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  });
  await waitForHost("recherche globale", () =>
    document.querySelector<HTMLInputElement>("input[role='combobox']"));
}

describe("WCAG AA audit", () => {
  it("measures zero axe A/AA violations on every consolidated screen", async () => {
    await mountApp();
    const screens: {
      label: string;
      violations: number;
      rules: string[];
      incomplete: number;
      incompleteRules: string[];
    }[] = [];
    for (const screen of SCREENS) {
      await selectScreen(screen.label);
      const result = await axe.run(document, { runOnly: { type: "tag", values: AA_TAGS } });
      screens.push({
        label: screen.label,
        violations: result.violations.reduce((total, rule) => total + rule.nodes.length, 0),
        rules: result.violations.map((rule) => rule.id).sort(),
        // `incomplete` n'est pas une violation, mais en jsdom la règle
        // color-contrast y est typiquement indéterminée : on l'enregistre.
        incomplete: result.incomplete.reduce((total, rule) => total + rule.nodes.length, 0),
        incompleteRules: result.incomplete.map((rule) => rule.id).sort(),
      });
    }
    const violations = screens.reduce((total, screen) => total + screen.violations, 0);
    const incomplete = screens.reduce((total, screen) => total + screen.incomplete, 0);
    const summary = {
      command: "cd apps/web && ./node_modules/.bin/vitest run test/a11y-audit.test.tsx test/a11y-shell-status.test.tsx --reporter=dot",
      screens: screens.length,
      axeTags: AA_TAGS,
      violations,
      // Aucune écriture : bench/results/na-a11y-aa.json est versionné.
      incomplete,
      screensDetail: screens,
    };
    console.log(`A11Y_AA_AUDIT screens=${summary.screens} violations=${violations} incomplete=${incomplete}`);
    console.log(`A11Y_AA_INCOMPLETE ${JSON.stringify(summary.screensDetail.map((s) => ({ label: s.label, rules: s.incompleteRules })))}`);
    expect(violations).toBe(0);
  }, 90_000);

  it("bypasses the rail with a skip button that focuses main without changing the route", async () => {
    await mountApp();
    const button = host.querySelector<HTMLButtonElement>("button.skip-link");
    const main = host.querySelector<HTMLElement>("main#main");
    expect(button).toBeTruthy();
    expect(main).toBeTruthy();
    expect(main!.tabIndex).toBe(-1);
    const hashBefore = window.location.hash;
    await act(async () => { button!.click(); });
    expect(window.location.hash).toBe(hashBefore);
    expect(document.activeElement).toBe(main);
  });

  it("declares French as the page language", () => {
    expect(readFileSync(resolve(INDEX_FILE), "utf8")).toContain('<html lang="fr-FR"');
  });

  it("gives feed rows a valid pressed state instead of aria-selected", async () => {
    await mountApp();
    await selectScreen("Carte — fil d'événements");
    const rows = host.querySelectorAll<HTMLButtonElement>("button.feed__row");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.hasAttribute("aria-selected")).toBe(false);
      expect(row.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("names the global search combobox", async () => {
    await openPalette();
    const input = document.querySelector<HTMLInputElement>("input[role='combobox']");
    expect(input?.getAttribute("aria-label")).toBe("Recherche globale");
  });


  it("makes every health sort header keyboard operable", async () => {
    await mountApp();
    await selectScreen("Santé");
    const buttons = host.querySelectorAll<HTMLButtonElement>("th button[data-sort]");
    expect(buttons.length).toBeGreaterThan(0);
    // Les aria-labels de tri sont en français (« Trier par … ») depuis la
    // traduction de l'interface.
    for (const button of buttons) expect(button.getAttribute("aria-label")).toMatch(/^Trier par /);
    const firstHeader = buttons[0].closest("th")!;
    const before = firstHeader.getAttribute("aria-sort");
    await act(async () => { buttons[0].click(); });
    expect(firstHeader.getAttribute("aria-sort")).not.toBe(before);
  });

  it("follows the tabs pattern with arrow keys and a labelled panel", async () => {
    await mountApp();
    await selectScreen("Graphe");
    const tabs = host.querySelectorAll<HTMLButtonElement>("[role='tab']");
    expect([...tabs].map((tab) => tab.id)).toEqual(["gv-network-tab", "gv-matrix-tab"]);
    for (const tab of tabs) expect(tab.getAttribute("aria-controls")).toBe("gv-panel");
    expect(tabs[0].tabIndex).toBe(0);
    expect(tabs[1].tabIndex).toBe(-1);
    await act(async () => {
      tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    expect(host.querySelector("[role='tabpanel'][aria-labelledby='gv-matrix-tab']")).toBeTruthy();
  });

  it("moves focus into the review keyboard help dialog", async () => {
    await mountApp();
    await selectScreen("Revue");
    const section = host.querySelector<HTMLElement>("section.revue")!;
    await act(async () => {
      section.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    });
    const dialog = host.querySelector<HTMLElement>(".revue__help")!.closest("dialog")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog.querySelector("button"));
  });
});
