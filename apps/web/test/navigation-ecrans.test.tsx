// @vitest-environment jsdom
/**
 * DOM test of the product rail: Coverage and Corpus are reachable from their
 * hash routes and from the navigation, in the documented order. Both screens
 * are fed by a fake API response; nothing here touches the network.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import App from "../src/App";
import type { CouvertureResponse, CorpusStats } from "../src/api";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const coverage: CouvertureResponse = {
  dateCalcul: "2026-11-21T09:30:00Z",
  hashCorpus: "0123456789abcdef",
  fenetre: { debut: "2026-11-01T00:00:00Z", fin: "2026-11-10T23:59:59Z" },
  global: { vus: 27, total: 42, taux: 64.3 },
  parMotif: [{ motif: "vu", incidents: 27, part: 64.3 }],
  parDepartement: [{ departement: "33", vus: 12, total: 18, taux: 66.7 }],
  parSecteur: [{ secteur: "sante", vus: 10, total: 14, taux: 71.4 }],
  parMois: [{ mois: "2026-10", vus: 27, total: 42, taux: 64.3 }],
  stale: false,
};

const corpus: CorpusStats = {
  generatedAt: "2026-11-21T18:00:00.000Z",
  windowHours: 24,
  totals: { sources: 312, sourcesLocalised: 280, organisations: 1_673_151, incidents: 1_732 },
  families: ["presse"],
  byDepartment: [{ department: "33", label: "Gironde", total: 4, families: { presse: 4 } }],
  domainCoverage: { withDomain: 88, organisations: 1_673_151, percent: 0.0053 },
  sinceLastReport: {
    windowHours: 24,
    newEvents: 1281,
    previousEvents: 4506,
    change: -3225,
    percentChange: -71.6,
    comparedTo: "previous 24 hours",
  },
  recentIncidents: [{
    id: "1",
    title: "Hospital incident",
    organisation: "CHU de Bordeaux",
    department: "33",
    date: "2026-11-20",
    type: "confirmed_incident",
    family: "presse",
    sourceName: "Sud Ouest",
    sourceUrl: "https://example.invalid/article",
  }],
};

class FakeEventSource {
  addEventListener() {}
  close() {}
}

let host: HTMLDivElement;
let root: Root;
let fetchMock: Mock;

async function mount(hash: string): Promise<void> {
  window.location.hash = hash;
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<App />);
  });
}

async function settle(ms = 20): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  await act(async () => { await promise; });
}

async function waitForText(text: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (host.textContent?.includes(text)) return;
    await settle();
  }
  throw new Error(`"${text}" never appeared in the DOM`);
}

const NAV_GROUP: Record<string, string> = {
  Couverture: "Observatoire",
  Corpus: "Analyse",
};

async function clickRail(label: string): Promise<void> {
  const group = NAV_GROUP[label];
  const trigger = [...host.querySelectorAll<HTMLElement>("nav.rail__nav button, nav.rail__nav a")]
    .find((candidate) => candidate.textContent?.trim() === (group ?? label));
  expect(trigger, `navigation button "${group ?? label}"`).toBeTruthy();
  await act(async () => {
    trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  if (!group) return;
  await settle();
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .find((candidate) => candidate.textContent?.includes(label));
  expect(item, `menu item "${label}"`).toBeTruthy();
  await act(async () => {
    item!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.setItem("radar_token", "dom-test-token");
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/couverture")) {
      return { ok: true, status: 200, json: async () => coverage } as Response;
    }
    if (url.includes("/api/corpus/stats")) {
      return { ok: true, status: 200, json: async () => corpus } as Response;
    }
    // Other panels are not under test here: fail them explicitly instead of
    // inventing data. App catches those failures and still renders the rail.
    return { ok: false, status: 503, json: async () => ({}) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Coverage and Corpus navigation", () => {
  it("lists the screens in the product order", async () => {
    await mount("#/coverage");
    const labels = [...host.querySelectorAll<HTMLElement>("nav.rail__nav button, nav.rail__nav a")]
      .filter((element) => !element.closest('[role="menu"]'))
      .map((element) => element.textContent?.trim() ?? "")
      .filter((label) => label && label !== "Close popover");
    // Le rail est regroupé en six entrées Astryx plutôt qu'en une liste plate.
    expect(labels).toEqual([
      "Observatoire", "Analyse", "Sources", "Explorer", "Alertes", "Attributions",
    ]);
  });

  it("opens the Coverage screen from #/coverage and calls GET /api/couverture", async () => {
    await mount("#/coverage");
    await waitForText("Couverture");
    await waitForText("64.3%");
    expect(window.location.hash).toBe("#/coverage");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/couverture"))).toBe(true);
  });

  it("reaches the Corpus screen from the rail and calls GET /api/corpus/stats", async () => {
    await mount("#/coverage");
    await waitForText("Couverture");
    await clickRail("Corpus");
    await waitForText("Le corpus progresse-t-il ?");
    await waitForText("CHU de Bordeaux");
    expect(window.location.hash).toBe("#/corpus");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/corpus/stats"))).toBe(true);
  });

  it("opens the Corpus screen directly from #/corpus", async () => {
    await mount("#/corpus");
    await waitForText("Sources par département");
    expect(window.location.hash).toBe("#/corpus");
  });
});
