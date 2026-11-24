// @vitest-environment jsdom
/**
 * L'espace Sources doit garder les quatre destinations historiques sans
 * perdre leurs données ni leurs callbacks : registre, indicateurs, santé et
 * corpus. Ces tests vérifient le contrat visible (panneaux, ARIA, clavier)
 * et que les props du shell arrivent bien jusqu'aux vues existantes.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SourcesWorkspace, {
  type SourcesWorkspaceProps,
  type WarcProof,
} from "../src/components/SourcesWorkspace";
import type { CollecteMetrics, CorpusStats, HealthDetail, Source } from "../src/api";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const ilYaUneHeure = () => new Date(Date.now() - 3_600_000).toISOString();

function source(id: string, overrides: Partial<Source> = {}): Source {
  return {
    id,
    name: `Source ${id}`,
    family: "cti",
    url: `https://example.invalid/${id}`,
    kind: "narrative",
    format: "rss",
    enabled: true,
    intervalSec: 3600,
    lastOkAt: ilYaUneHeure(),
    lastEventAt: ilYaUneHeure(),
    lastErrorAt: null,
    lastError: null,
    itemsTotal: 100,
    lastItems: 12,
    ok: true,
    disabledAt: null,
    disabledReason: null,
    entrees: 100,
    rejets: 0,
    evenements30j: 7,
    evenementsTotal: 70,
    dernierRun: ilYaUneHeure(),
    dernierRunStatut: "ok",
    rendement: 0.07,
    motifs: null,
    motifDominant: null,
    ...overrides,
  };
}

const sources: Source[] = [
  source("a", { name: "Flux productif" }),
  source("b", {
    name: "Flux en erreur",
    family: "cert_fr",
    lastOkAt: "2020-01-01T00:00:00.000Z",
    lastEventAt: null,
    lastErrorAt: ilYaUneHeure(),
    lastError: "HTTP 503",
    ok: false,
    evenements30j: 0,
    dernierRunStatut: "error",
  }),
  source("c", {
    name: "Flux jamais collecté",
    family: "phishing",
    lastOkAt: null,
    lastEventAt: null,
    dernierRun: null,
    dernierRunStatut: null,
    ok: false,
    evenements30j: 0,
    entrees: null,
    itemsTotal: null,
    lastItems: null,
    rendement: null,
  }),
];

const metrics: CollecteMetrics = {
  generatedAt: "2026-11-24T08:00:00.000Z",
  fenetreHeures: 24,
  resume: {
    cycles: 12,
    cyclesEchoues: 1,
    dureeMoyenneMs: 4200,
    dureeMaxMs: 9000,
    sourcesOk: 9,
    sourcesError: 1,
    itemsIn: 340,
    itemsNew: 21,
    memoireMaxOctets: 128 * 1024 * 1024,
  },
  cycles: [{
    id: 1,
    startedAt: "2026-11-24T07:59:00.000Z",
    finishedAt: "2026-11-24T08:00:00.000Z",
    dureeMs: 4200,
    statut: "ok",
    sourcesOk: 9,
    sourcesError: 0,
    itemsIn: 34,
    itemsNew: 2,
    memoireRssOctets: 128 * 1024 * 1024,
    memoireHeapOctets: 40 * 1024 * 1024,
    memoireDeltaOctets: 1024,
    erreur: null,
  }],
  alertes: [],
};

const healthDetail: HealthDetail = {
  ok: true,
  generatedAt: "2026-11-24T08:00:00.000Z",
  windowDays: 7,
  sources: { declared: 3, enabled: 3, actives7j: 1, muettes7j: 2 },
  events24h: 4,
  orgs7j: 2,
  queues: { pending: 1, reviewed: 2, promoted: 3 },
  families: [],
};

const corpusData: CorpusStats = {
  generatedAt: "2026-11-24T08:00:00.000Z",
  windowHours: 24,
  totals: { sources: 3, sourcesLocalised: 3, organisations: 12, incidents: 2 },
  families: ["cti"],
  byDepartment: [],
  domainCoverage: { withDomain: 8, organisations: 12, percent: 66.6 },
  sinceLastReport: {
    windowHours: 24,
    newEvents: 2,
    previousEvents: 1,
    change: 1,
    percentChange: 100,
    comparedTo: "24 h précédentes",
  },
  recentIncidents: [{
    id: "incident-1",
    title: "Incident vérifié",
    organisation: "CHU de Bordeaux",
    department: "33",
    date: "2026-11-23",
    type: "confirmed_incident",
    family: "cti",
    sourceName: "Flux productif",
    sourceUrl: "https://example.invalid/article",
  }],
};

const warcProof: WarcProof = {
  recordId: "<urn:uuid:radar-1>",
  targetUri: "https://example.invalid/article",
  date: "2026-11-23T12:00:00.000Z",
  digest: "sha1:ABCDEF",
  identifiedPayloadType: "application/json",
  blockLength: 2048,
};

let host: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  // HealthView interroge son API dès qu'il est monté : une requête qui ne
  // répond jamais garde le squelette et n'introduit pas de résultat fictif.
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

async function mount(props: Partial<SourcesWorkspaceProps> = {}): Promise<void> {
  await act(async () => {
    root = createRoot(host);
    root.render(
      <SourcesWorkspace
        sources={sources}
        loading={false}
        error={null}
        metrics={metrics}
        healthDetail={healthDetail}
        corpusData={corpusData}
        {...props}
      />,
    );
  });
}

function tabs(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function tab(label: string): HTMLButtonElement {
  const button = tabs().find((candidate) => candidate.textContent === label);
  expect(button, `onglet ${label}`).toBeTruthy();
  return button!;
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function press(element: Element, key: string): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  });
}

describe("SourcesWorkspace", () => {
  it("présente quatre panneaux et garde le registre actif par défaut", async () => {
    await mount();

    expect(tabs().map((button) => button.textContent)).toEqual([
      "Registre", "Indicateurs", "Santé", "Corpus",
    ]);
    expect(tab("Registre").getAttribute("aria-selected")).toBe("true");
    expect(tab("Indicateurs").getAttribute("aria-selected")).toBe("false");

    const panels = [...host.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(panels).toHaveLength(4);
    for (const button of tabs()) {
      const panel = host.querySelector<HTMLElement>(`#${button.getAttribute("aria-controls")}`);
      expect(panel).toBeTruthy();
      expect(panel!.getAttribute("aria-labelledby")).toBe(button.id);
    }
    expect(panels.filter((panel) => !panel.hidden)).toHaveLength(1);
    expect(host.querySelector(".sources-view")).toBeTruthy();
  });

  it("montre les indicateurs et transmet la relance", async () => {
    const onRetry = vi.fn();
    const onTabChange = vi.fn();
    await mount({ onRetry, onTabChange });

    await click(tab("Indicateurs"));

    expect(onTabChange).toHaveBeenCalledWith("indicateurs");
    expect(host.textContent).toContain("Indicateurs du registre");
    expect(host.querySelector(".sws-dashboard__kpi dd")?.firstChild?.textContent).toBe("3");
    expect(host.querySelector('[aria-label="supervision de la collecte"]')).toBeTruthy();

    await click(host.querySelector(".sws-retry")!);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("garde le résumé de santé, le tableau des sources et leur relance", async () => {
    const onRetry = vi.fn();
    await mount({ onRetry });

    await click(tab("Santé"));

    expect(host.querySelector('[aria-label="état détaillé du système"]')).toBeTruthy();
    expect(host.querySelector(".health-view")).toBeTruthy();
    const recharger = [...host.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Recharger l'état"));
    expect(recharger).toBeTruthy();
    await click(recharger!);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("montre le corpus et la preuve d'archive fournie", async () => {
    await mount({ initialTab: "corpus", warcProof });

    expect(tab("Corpus").getAttribute("aria-selected")).toBe("true");
    expect(host.textContent).toContain("Corpus / vue d'ensemble");
    expect(host.textContent).toContain("Incidents dans le corpus");
    const card = host.querySelector(".sws-warc")!;
    expect(card.textContent).toContain("<urn:uuid:radar-1>");
    expect(card.textContent).toContain("sha1:ABCDEF");
    const link = card.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://example.invalid/article");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("n'invente aucune preuve quand le shell n'en fournit pas", async () => {
    await mount({ initialTab: "corpus" });

    expect(host.textContent).toContain("Aucune preuve d’archive jointe à cette vue.");
    expect(host.querySelector(".sws-warc__fields")).toBeNull();
  });

  it("navigue au clavier entre les panneaux", async () => {
    const onTabChange = vi.fn();
    await mount({ onTabChange });

    await press(tab("Registre"), "ArrowRight");
    expect(tab("Indicateurs").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("Indicateurs"));

    await press(tab("Indicateurs"), "End");
    expect(tab("Corpus").getAttribute("aria-selected")).toBe("true");

    await press(tab("Corpus"), "Home");
    expect(tab("Registre").getAttribute("aria-selected")).toBe("true");
    expect(onTabChange.mock.calls.map((call) => call[0])).toEqual([
      "indicateurs", "corpus", "registre",
    ]);
  });
});
