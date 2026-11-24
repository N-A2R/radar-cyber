// @vitest-environment jsdom
/**
 * Reproducible WCAG 2.0/2.1 A+AA audit of every screen of the web app.
 *
 * The app runs in mock mode: no network, no victim data. axe-core is the
 * measurement engine; the HTML shell (title, language) is copied from the
 * real index.html so that the jsdom run reflects the shipped page.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { keepFocusInDialog } from "../src/a11y/dialog-focus";
vi.mock("../src/map/Map3D", () => ({
  default: () => <div role="img" aria-label="Carte territoriale" />,
}));

// The module reads VITE_DATA_MODE at import time: a static import would fix
// the environment before the stub is installed.
import type AppType from "../src/App";

// Libellés métier audités ; le rail Astryx les regroupe en six entrées.
const SCREEN_LABELS = [
  "Aujourd'hui", "Couverture", "Nouvelle-Aquitaine", "Suis-je concerné ?",
  "Revue", "Journal", "Corpus", "Dossier", "Sources", "Tableau de bord sources",
  "Santé", "Carte", "Graphe", "Annuaire", "Alertes", "Attributions",
] as const;

const NAV_GROUP: Record<string, string> = {
  "Aujourd'hui": "Observatoire",
  Couverture: "Observatoire",
  "Nouvelle-Aquitaine": "Observatoire",
  "Suis-je concerné ?": "Observatoire",
  Revue: "Analyse",
  Journal: "Analyse",
  Corpus: "Analyse",
  Dossier: "Analyse",
  Sources: "Sources",
  "Tableau de bord sources": "Sources",
  Santé: "Sources",
  Carte: "Explorer",
  Graphe: "Explorer",
  Annuaire: "Explorer",
};

const AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const RESULT_FILE = "../../bench/results/na-a11y-aa.json";
const INDEX_FILE = "index.html";

let App: AppType;
let host: HTMLDivElement;
let root: Root;

async function settle(ms = 40): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  await act(async () => { await promise; });
}

async function selectScreen(label: string): Promise<void> {
  const group = NAV_GROUP[label];
  const button = [...host.querySelectorAll<HTMLElement>("nav.rail__nav button, nav.rail__nav a")]
    .find((candidate) => candidate.textContent?.trim() === (group ?? label));
  expect(button, `navigation button "${group ?? label}"`).toBeTruthy();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  if (!group) return;
  await settle();
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .find((candidate) => candidate.textContent?.includes(label));
  expect(item, `menu item "${label}"`).toBeTruthy();
  await act(async () => {
    item!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
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
  await settle();
}

async function openPalette(): Promise<void> {
  await mountApp();
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  });
  await settle();
}

describe("WCAG AA audit", () => {
  it("measures zero axe A/AA violations on all sixteen screens", async () => {
    await mountApp();
    const screens: { label: string; violations: number; rules: string[] }[] = [];
    for (const label of SCREEN_LABELS) {
      await selectScreen(label);
      const result = await axe.run(document, { runOnly: { type: "tag", values: AA_TAGS } });
      screens.push({
        label,
        violations: result.violations.reduce((total, rule) => total + rule.nodes.length, 0),
        rules: result.violations.map((rule) => rule.id).sort(),
      });
    }
    const violations = screens.reduce((total, screen) => total + screen.violations, 0);
    const summary = {
      command: "cd apps/web && ./node_modules/.bin/vitest run test/a11y-audit.test.tsx test/a11y-shell-status.test.tsx --reporter=dot",
      screens: screens.length,
      axeTags: AA_TAGS,
      violations,
      screensDetail: screens,
    };
    writeFileSync(resolve(RESULT_FILE), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`A11Y_AA_AUDIT screens=${summary.screens} violations=${violations}`);
    expect(violations).toBe(0);
  }, 90_000);

  it("bypasses the rail with a skip link to the main landmark", async () => {
    await mountApp();
    expect(host.querySelector("a.skip-link")?.getAttribute("href")).toBe("#main");
    expect(host.querySelector("main#main")).toBeTruthy();
  });

  it("declares French as the page language", () => {
    expect(readFileSync(resolve(INDEX_FILE), "utf8")).toContain('<html lang="fr-FR"');
  });

  it("gives feed rows a valid pressed state instead of aria-selected", async () => {
    await mountApp();
    await selectScreen("Carte");
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

  it("wraps Tab focus inside a modal dialog", () => {
    const dialog = document.createElement("div");
    dialog.innerHTML = '<button id="first">First</button><button id="last">Last</button>';
    document.body.appendChild(dialog);
    const [first, last] = [...dialog.querySelectorAll("button")];
    const event = (shiftKey: boolean) => ({
      key: "Tab",
      currentTarget: dialog,
      shiftKey,
      preventDefault() {},
    }) as unknown as Parameters<typeof keepFocusInDialog>[0];
    last.focus();
    keepFocusInDialog(event(false));
    expect(document.activeElement).toBe(first);
    keepFocusInDialog(event(true));
    expect(document.activeElement).toBe(last);
    dialog.remove();
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
