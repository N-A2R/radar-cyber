// @vitest-environment jsdom
/**
 * Shell regression: the four destinations are directly reachable, legacy
 * hashes land on the right panel/tab without losing filters, and rail clicks
 * switch destinations. Workspace internals are mocked: only routing belongs
 * to this test.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { parseHash, toHash } from "../src/url-state";

vi.mock("../src/components/MapWorkspace", () => ({
  default: ({ initialPanel }: { initialPanel: string }) => (
    <div data-testid="workspace" data-workspace="map" data-panel={initialPanel} />
  ),
}));
vi.mock("../src/components/ActionWorkspace", () => ({
  default: ({ initialTab }: { initialTab: string }) => (
    <div data-testid="workspace" data-workspace="action" data-tab={initialTab} />
  ),
}));
vi.mock("../src/components/SourcesWorkspace", () => ({
  default: ({ initialTab }: { initialTab: string }) => (
    <div data-testid="workspace" data-workspace="sources" data-tab={initialTab} />
  ),
}));
vi.mock("../src/components/JournalWorkspace", () => ({
  default: ({ tab }: { tab: string }) => (
    <div data-testid="workspace" data-workspace="journal" data-tab={tab} />
  ),
}));

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

class FakeEventSource {
  addEventListener() {}
  close() {}
}

let host: HTMLDivElement;
let root: Root;

async function settle(ms = 10): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  await act(async () => { await promise; });
}

async function mount(hash: string): Promise<void> {
  window.location.hash = hash;
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<App />);
  });
  await settle();
}

function workspace(): HTMLElement {
  const found = host.querySelector<HTMLElement>('[data-testid="workspace"]');
  expect(found, "a destination workspace").toBeTruthy();
  return found!;
}

async function clickRail(label: string): Promise<void> {
  const button = [...host.querySelectorAll<HTMLElement>(".rail__nav a, .rail__nav button")]
    .find((candidate) => candidate.textContent?.includes(label));
  expect(button, `rail item "${label}"`).toBeTruthy();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

beforeEach(() => {
  localStorage.setItem("radar_token", "navigation-test-token");
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false, status: 503, json: async () => ({}),
  }) as Response));
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("direct navigation", () => {
  it("opens Carte as home", async () => {
    await mount("#/");
    expect(workspace().dataset.workspace).toBe("map");
    expect(workspace().dataset.panel).toBe("carte");
    expect(window.location.hash).toBe("#/map");
  });

  it("exposes exactly four destinations in the rail", async () => {
    await mount("#/map");
    const labels = [...host.querySelectorAll<HTMLElement>(".rail__nav a, .rail__nav button")]
      .map((element) => element.textContent?.trim() ?? "")
      .filter((label) => label && label !== "Close popover");
    expect(labels).toEqual(["Carte", "Action", "Sources", "Journal"]);
  });

  it("switches destinations from the rail", async () => {
    await mount("#/map");
    for (const [label, destination] of [
      ["Action", "action"], ["Sources", "sources"], ["Journal", "journal"], ["Carte", "map"],
    ] as const) {
      await clickRail(label);
      expect(workspace().dataset.workspace).toBe(destination);
      expect(window.location.hash).toBe(`#/${destination}`);
    }
  });
});

describe("legacy deep links", () => {
  it("maps regional screens into Carte panels", async () => {
    await mount("#/coverage");
    expect(workspace().dataset.workspace).toBe("map");
    expect(workspace().dataset.panel).toBe("couverture");
    expect(window.location.hash).toBe("#/map?panel=couverture");
  });

  it("keeps the department filter when redirecting Nouvelle-Aquitaine", async () => {
    await mount("#/na?naDept=33");
    expect(workspace().dataset.panel).toBe("regional");
    expect(window.location.hash).toBe("#/map?panel=regional&naDept=33");
  });

  it("maps attributions into a Carte panel", async () => {
    await mount("#/attributions");
    expect(workspace().dataset.workspace).toBe("map");
    expect(workspace().dataset.panel).toBe("attributions");
    expect(window.location.hash).toBe("#/map?panel=attributions");
  });

  it("maps review into Action and preserves its filters", async () => {
    await mount("#/review?bucket=chaud&q=incident");
    expect(workspace().dataset.workspace).toBe("action");
    expect(workspace().dataset.tab).toBe("review");
    expect(window.location.hash).toBe("#/action?tab=review&bucket=chaud&q=incident");
  });

  it("maps alerts into Action", async () => {
    await mount("#/alerts");
    expect(workspace().dataset.workspace).toBe("action");
    expect(workspace().dataset.tab).toBe("alerts");
    expect(window.location.hash).toBe("#/action");
  });

  it("maps health and sources-dashboard into Sources tabs", async () => {
    await mount("#/health");
    expect(workspace().dataset.workspace).toBe("sources");
    expect(workspace().dataset.tab).toBe("sante");
    expect(window.location.hash).toBe("#/sources?tab=sante");

    await act(async () => { root.unmount(); host.remove(); });
    await mount("#/sources-dashboard");
    expect(workspace().dataset.tab).toBe("indicateurs");
    expect(window.location.hash).toBe("#/sources?tab=indicateurs");
  });

  it("maps dossier into Journal and keeps the tab in the hash", async () => {
    await mount("#/dossier");
    expect(workspace().dataset.workspace).toBe("journal");
    expect(workspace().dataset.tab).toBe("dossier");
    expect(window.location.hash).toBe("#/journal?tab=dossier");
  });
});

describe("legacy URL parsing", () => {
  it("maps health and dossier to their tabs", () => {
    expect(parseHash("#/health").sourcesTab).toBe("sante");
    expect(toHash(parseHash("#/health"))).toBe("#/sources?tab=sante");
    expect(parseHash("#/dossier").journalTab).toBe("dossier");
    expect(parseHash("#/sources?tab=sante").sourcesTab).toBe("sante");
    expect(parseHash("#/journal?tab=dossier").journalTab).toBe("dossier");
    expect(toHash(parseHash("#/dossier"))).toBe("#/journal?tab=dossier");
  });
});
