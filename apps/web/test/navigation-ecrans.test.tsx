// @vitest-environment jsdom
/**
 * Navigation contract of the four destinations. Legacy hash routes are mapped
 * to their workspace and panel/tab without dropping their query filters.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import App from "../src/App";
import { parseHash, toHash } from "../src/url-state";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

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

async function waitForHash(hash: string): Promise<void> {
  for (let attempt = 0; attempt < 40 && window.location.hash !== hash; attempt += 1) {
    await settle();
  }
  expect(window.location.hash).toBe(hash);
}

function railLabels(): string[] {
  return [...host.querySelectorAll<HTMLElement>("nav.rail__nav a, nav.rail__nav button")]
    .filter((element) => !element.closest('[role="menu"]'))
    .map((element) => element.textContent?.trim() ?? "")
    .filter((label) => label && label !== "Close popover");
}

async function clickRail(label: string): Promise<void> {
  const trigger = [...host.querySelectorAll<HTMLElement>("nav.rail__nav a, nav.rail__nav button")]
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(trigger, `navigation "${label}"`).toBeTruthy();
  await act(async () => {
    trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const payloads: Record<string, unknown> = {
  "/api/today": { compteurs: { evenements24h: 3, organisations7j: 2, derniereCollecte: null }, evenements: [] },
  "/api/today/departements": { departements: [] },
  "/api/couverture": {
    dateCalcul: "2026-11-21T09:30:00Z", hashCorpus: "abc",
    fenetre: { debut: "2026-11-01T00:00:00Z", fin: "2026-11-21T00:00:00Z" },
    global: { vus: 0, total: 0, taux: 0 }, parMotif: [], parDepartement: [], parType: [], stale: false,
  },
  "/api/corpus/stats": {
    generatedAt: "2026-11-21T18:00:00.000Z", windowHours: 24,
    totals: { sources: 0, sourcesLocalised: 0, organisations: 0, incidents: 0 },
    families: [], byDepartment: [],
    domainCoverage: { withDomain: 0, organisations: 0, percent: null },
    sinceLastReport: { windowHours: 24, newEvents: 0, previousEvents: 0, change: 0, percentChange: 0, comparedTo: "previous" },
    recentIncidents: [],
  },
  "/api/sources": [], "/api/orgs": [], "/api/events": [], "/api/flows": [],
  "/api/graph": { nodes: [], links: [] }, "/api/graph/temporal": { nodes: [], links: [] },
  "/api/stats": { orgs: 0, events: 0, indicators: 0, sources: { total: 0, active: 0, ok: 0, err: 0 }, byFamily: [], byAssertion: [] },
  "/api/stats/departements": { departements: [] },
  "/api/sources/dashboard": { generatedAt: "2026-11-21T18:00:00Z", lignes: [] },
  "/api/na/overview": { depts: [], total: { orgs: 0, orgsAvecEvenement: 0, evenements: 0, deptsSansEvenement: [] }, derniereCollecte: null },
  "/api/na/events": { dept: "33", events: [] },
  "/api/directory": { rows: [], total: 0, page: 0, limit: 50, facets: { kind: [], sector: [], dept: [] }, truncated: false, tookMs: 0 },
  "/api/quarantine/queue": { rows: [], total: 0, page: 0, limit: 50, window: 24, truncated: false, facets: {}, counts: {}, tookMs: 0 },
  "/api/journal/review": { rows: [], limite: 50, avant: null },
  "/api/alerts": [], "/api/alerts/stats": [],
  "/api/actor-attributions": { attributions: [], generatedAt: "2026-11-21T18:00:00Z" },
  "/api/orgs/liees": { semaine: 0, total: 0, enAttente: 0, examinees: 0, parDepartement: [] },
  "/api/orgs/liees/historique": { points: [] },
  "/api/health/detail": {
    ok: true, generatedAt: "2026-11-21T18:00:00Z", windowDays: 7,
    sources: { declared: 0, enabled: 0, actives7j: 0, muettes7j: 0, bySource: [] },
    events24h: 0, orgs7j: 0, queues: { pending: 0, reviewed: 0, promoted: 0 }, families: [],
  },
  "/api/health/causes": {
    ok: true, generatedAt: "2026-11-21T18:00:00Z", rouges: 0, sansTrace: 0,
    stockage: { causeStockee: false, explication: "", champPropose: { table: "", colonne: "", definition: "" } }, causes: [],
  },
  "/api/collecte/metrics": {}, "/api/collecte/plan": {},
};

beforeEach(() => {
  localStorage.setItem("radar_token", "nav-test-token");
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const path = Object.keys(payloads)
      .sort((a, b) => b.length - a.length)
      .find((candidate) => url.includes(candidate));
    if (!path) {
      return { ok: false, status: 503, json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, json: async () => payloads[path] } as Response;
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

describe("four destinations", () => {
  const LEGACY: Array<[string, string]> = [
    ["#/today?family=cyber&dept=33", "#/map?family=cyber&dept=33"],
    ["#/coverage?dept=33", "#/map?panel=couverture&dept=33"],
    ["#/na?naDept=33", "#/map?panel=regional&naDept=33"],
    ["#/directory?q=acme&dept=33", "#/map?panel=directory&q=acme&dept=33"],
    ["#/graph", "#/map?panel=graph"],
    ["#/affected", "#/map?panel=affected"],
    ["#/attributions", "#/map?panel=attributions"],
    ["#/review?bucket=chaud&q=php", "#/action?tab=review&bucket=chaud&q=php"],
    ["#/alerts", "#/action"],
    ["#/health", "#/sources?tab=sante"],
    ["#/sources-dashboard", "#/sources?tab=indicateurs"],
    ["#/corpus", "#/sources?tab=corpus"],
    ["#/dossier", "#/journal?tab=dossier"],
  ];

  it("lists exactly the four destinations in the rail", async () => {
    await mount("#/map");
    await settle();
    expect(railLabels()).toEqual(["Carte", "Action", "Sources", "Journal"]);
  });

  it("maps every legacy route to its workspace and keeps its filters", () => {
    for (const [legacy, expected] of LEGACY) {
      expect(toHash(parseHash(legacy)), legacy).toBe(expected);
    }
  });

  it("rewrites a legacy hash without losing its department filter", async () => {
    await mount("#/coverage?dept=33");
    await waitForHash("#/map?panel=couverture&dept=33");
    expect(parseHash(window.location.hash).mapPanel).toBe("couverture");
    expect(parseHash(window.location.hash).today.dept).toBe("33");
  });

  it("navigates between destinations from the rail", async () => {
    await mount("#/map");
    await settle();
    await clickRail("Sources");
    await waitForHash("#/sources");
    await clickRail("Journal");
    await waitForHash("#/journal");
  });

  it("Retour revient à la destination précédente sans réinitialiser ses filtres", async () => {
    await mount("#/map?panel=directory&q=acme");
    await settle(40);
    const push = vi.spyOn(window.history, "pushState");

    await clickRail("Sources");
    await waitForHash("#/sources");
    expect(push).toHaveBeenCalled();

    await act(async () => { window.history.back(); });
    await waitForHash("#/map?panel=directory&q=acme");
    expect(parseHash(window.location.hash).directory.q).toBe("acme");
    push.mockRestore();
  });
});
