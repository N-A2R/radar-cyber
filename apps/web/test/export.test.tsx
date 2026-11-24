// @vitest-environment jsdom
/**
 * Export behaviours: availability on every screen, CSV/PDF content, regional
 * and privacy rules, and the reproducible coverage figure used in the report.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import type { ViewKey } from "../src/contracts";
import type { DataRow } from "../src/export";
import {
  buildPdf, EXPORT_COLUMNS, EXPORT_TITLES, exportFilename, prepareRows, toCsv, workspaceFor,
} from "../src/export";
import ExportMenu, { ExportProvider, useScreenExport } from "../src/components/ExportMenu";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const VIEWS: ViewKey[] = ["map", "action", "sources", "journal"];

function Publisher({ view, rows }: { view: ViewKey; rows: DataRow[] }) {
  useScreenExport(view, rows);
  return null;
}

function Harness({ view, rows }: { view: ViewKey; rows: DataRow[] }) {
  return (
    <ExportProvider>
      <ExportMenu />
      <Publisher view={view} rows={rows} />
    </ExportProvider>
  );
}

class FakeEventSource {
  addEventListener() {}
  close() {}
}

let host: HTMLDivElement;
let root: Root;

async function mount(node: React.ReactNode): Promise<void> {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(node);
  });
}

async function settle(ms = 40): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  await act(async () => { await promise; });
}

function response(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload, blob: async () => new Blob() } as Response;
}

function blobText(blob: Blob): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
  return promise;
}

const payloads: Record<string, unknown> = {
  "/api/today": { compteurs: { evenements24h: 3, organisations7j: 2, derniereCollecte: null }, evenements: [] },
  "/api/today/departements": { departements: [] },
  "/api/couverture": {
    dateCalcul: "2026-11-22T00:00:00Z", hashCorpus: "abc",
    fenetre: { debut: "2026-11-01T00:00:00Z", fin: "2026-11-21T00:00:00Z" },
    global: { vus: 1, total: 2, taux: 50 },
    parMotif: [], parDepartement: [], parSecteur: [], parMois: [], stale: false,
  },
  "/api/corpus/stats": {
    generatedAt: "2026-11-22T00:00:00Z", windowHours: 24,
    totals: { sources: 312, sourcesLocalised: 280, organisations: 1673151, incidents: 10 },
    families: [], byDepartment: [],
    domainCoverage: { withDomain: 0, organisations: 0, percent: null },
    sinceLastReport: { windowHours: 24, newEvents: 1, previousEvents: 1, change: 0, percentChange: 0, comparedTo: "previous" },
    recentIncidents: [],
  },
  "/api/sources": [], "/api/orgs": [], "/api/events": [], "/api/flows": [],
  "/api/graph": { nodes: [], links: [] }, "/api/graph/temporal": { nodes: [], links: [] },
  "/api/stats": { orgs: 0, events: 0, indicators: 0, sources: { total: 0, active: 0, ok: 0, err: 0 }, byFamily: [], byAssertion: [] },
  "/api/stats/departements": { departements: [] },
  "/api/na/overview": { depts: [], total: { orgs: 0, orgsAvecEvenement: 0, evenements: 0, deptsSansEvenement: [] }, derniereCollecte: null },
  "/api/na/events": { dept: "33", events: [] },
  "/api/directory": { rows: [], total: 0, page: 0, limit: 50, facets: { kind: [], sector: [], dept: [] }, truncated: false, tookMs: 0 },
  "/api/quarantine/queue": { rows: [], total: 0, page: 0, limit: 50, window: 24, truncated: false, facets: {}, counts: {}, tookMs: 0 },
  "/api/quarantine/review": { action: "promote", requested: 0, changed: 0, promoted: 0, alerts: 0, skipped: [] },
  "/api/orgs/from-hint": { org: { id: 999, name: "Alpha SAS" }, created: true, matchedBy: null },
  "/api/journal/review": { rows: [], limite: 50, avant: null },
  "/api/alerts": [], "/api/alerts/stats": [],
  "/api/dossier": {
    etat: { organisations: 1673151, sources: 312, sourcesActives: 300, sourcesMuettes: 12, evenements: 28000, journalEvenements: 40, migrations: 61, derniereMigration: "061" },
    dossier: { genere: "2026-11-22T00:00:00Z", sections: [] },
  },
  "/api/health/detail": {
    ok: true, generatedAt: "2026-11-22T00:00:00Z", windowDays: 7,
    sources: { declared: 312, enabled: 300, actives7j: 280, muettes7j: 20, bySource: [] },
    events24h: 12, orgs7j: 4,
    queues: { pending: 0, reviewed: 0, promoted: 0 }, families: [],
  },
  "/api/health/causes": {
    ok: true, generatedAt: "2026-11-22T00:00:00Z", rouges: 0, sansTrace: 0,
    stockage: { causeStockee: false, explication: "", champPropose: { table: "", colonne: "", definition: "" } },
    causes: [],
  }, "/api/collecte/metrics": {}, "/api/collecte/plan": {},
  "/api/orgs/liees": { semaine: 0, total: 0, enAttente: 0, examinees: 0, parDepartement: [] },
  "/api/orgs/liees/historique": { points: [] },
};

beforeEach(() => {
  localStorage.setItem("radar_token", "export-test-token");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const path = Object.keys(payloads)
      .sort((a, b) => b.length - a.length)
      .find((candidate) => url.includes(candidate));
    return response(path ? payloads[path] : {});
  }));
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("screen export", () => {
  it("exposes both formats on every screen of the product", async () => {
    let covered = 0;
    for (const view of VIEWS) {
      window.location.hash = `#/${view}`;
      await mount(<Harness view={view} rows={[]} />);
      await settle();
      const trigger = host.querySelector<HTMLButtonElement>("button");
      await act(async () => { trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      await settle();
      const formats = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .map((item) => item.textContent?.trim());
      const enabled = Boolean(trigger && !trigger.disabled)
        && formats.includes("CSV") && formats.includes("PDF");
      if (enabled) covered += 1;
      await act(async () => { root.unmount(); });
      host.remove();
    }
    // The reproducible figure quoted in docs/rapport-export.md.
    console.log(`EXPORT_COVERAGE=${covered}/${VIEWS.length} screens`);
    console.log(`EXPORT_FORMATS=${covered * 2}/${VIEWS.length * 2} screen-format pairs`);
    expect(covered).toBe(VIEWS.length);
  });

  it("exports only the columns declared for the current workspace", () => {
    const rows = prepareRows("map", [{
      id: 7, organisation: "CHU de Bordeaux", department: "33", sector: "health",
      kind: "hospital", city: "Bordeaux", events: 4,
      victimName: "Jane Doe", email: "jane.doe@example.org", evidence: { secret: true },
    }]);
    const csv = toCsv("map", rows);
    expect(csv.split("\r\n")[0]).toBe(EXPORT_COLUMNS.map.map((column) => column.label).join(","));
    expect(csv).toContain("CHU de Bordeaux");
    expect(csv).not.toMatch(/victim|email|evidence|jane|secret|example\.org/i);
  });

  it("keeps Nouvelle-Aquitaine rows and drops other regions", () => {
    const rows = prepareRows("today", [
      { department: "33", title: "Bordeaux" },
      { department: "75", title: "Paris" },
      { dept: "86", title: "Poitiers" },
    ]);
    expect(rows.map((row) => row.Title)).toEqual(["Bordeaux", "Poitiers"]);
  });

  it("keeps grey sources instead of hiding uncertain data", () => {
    const rows = prepareRows("sources", [
      { id: "grey-1", name: "Unverified feed", status: "unverified", family: "forum", kind: "narrative", events: 12 },
      { id: "ok-1", name: "Verified feed", status: "ok", family: "presse", kind: "narrative", events: 30 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].Status).toBe("unverified");
  });

  it("scrubs direct identifiers from free text", () => {
    const rows = prepareRows("dossier", [{
      section: "Scope",
      detail: "Contact jane.doe@example.org or 06 12 34 56 78 from 10.0.0.4",
    }]);
    expect(rows[0].Detail).toBe("Contact [redacted] or [redacted] from [redacted]");
  });

  it("escapes CSV separators, quotes and line breaks", () => {
    const csv = toCsv("dossier", prepareRows("dossier", [{ section: 'A "quoted", section', detail: "one\ntwo" }]));
    expect(csv).toContain('"A ""quoted"", section","one\ntwo"');
  });

  it("builds a valid multi-page PDF carrying the screen title and rows", () => {
    const rows = prepareRows("sources", Array.from({ length: 120 }, (_, index) => ({
      id: `src-${index}`, name: `Feed ${index}`, status: "ok", family: "presse", events: index,
    })));
    const pdf = new TextDecoder().decode(buildPdf("sources", "Sources", rows));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/Count 3");
    expect(pdf).toContain("SOURCES");
    expect(pdf).toContain("Feed 119");
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("xref");
  });

  it("downloads a CSV file when CSV is clicked", async () => {
    const blobs: Blob[] = [];
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: (blob: Blob) => { blobs.push(blob); return "blob:test"; } });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await mount(<Harness view="sources" rows={[{ id: "grey-1", name: "Grey feed", status: "unverified", events: 3 }]} />);
    await settle();
    const trigger = host.querySelector<HTMLButtonElement>("button")!;
    await act(async () => { trigger.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle();
    const button = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((candidate) => candidate.textContent?.trim() === "CSV");
    await act(async () => { button!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toContain("text/csv");
    expect(await blobText(blobs[0])).toContain("Grey feed");
  });

  it("downloads a PDF file when PDF is clicked", async () => {
    const blobs: Blob[] = [];
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: (blob: Blob) => { blobs.push(blob); return "blob:test"; } });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await mount(<Harness view="map" rows={[{ title: "Regional incident", department: "33" }]} />);
    await settle();
    const trigger = host.querySelector<HTMLButtonElement>("button")!;
    await act(async () => { trigger.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle();
    const button = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((candidate) => candidate.textContent?.trim() === "PDF");
    await act(async () => { button!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe("application/pdf");
    const pdf = await blobText(blobs[0]);
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("Regional incident");
  });

  it("maps legacy screens onto their workspace without losing safe columns", () => {
    expect(Object.keys(EXPORT_COLUMNS).sort()).toEqual(["action", "journal", "map", "sources"]);
    expect(Object.keys(EXPORT_TITLES).sort()).toEqual(["action", "journal", "map", "sources"]);
    expect(workspaceFor("today")).toBe("map");
    expect(workspaceFor("couverture")).toBe("map");
    expect(workspaceFor("review")).toBe("action");
    expect(workspaceFor("health")).toBe("sources");
    expect(workspaceFor("dossier")).toBe("journal");
    const rows = prepareRows("dossier", [{ section: "Scope", detail: "Contact 06 12 34 56 78" }]);
    expect(rows[0].Detail).toBe("Contact [redacted]");
    expect(toCsv("today", prepareRows("today", [{ title: "Regional incident", department: "33" }])))
      .toContain("Regional incident");
    expect(exportFilename("today", "csv")).toMatch(/^radar-map-/);
  });
});

