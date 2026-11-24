// @vitest-environment jsdom
/**
 * Journal & dossier — le workspace est testé dans un DOM, pas seulement en
 * rendu statique : on prouve la sélection des onglets au clavier, la portée
 * des panneaux ARIA, la transmission de onUnauthorized, et que les filtres
 * et l'export du journal survivent à un aller-retour dans le dossier.
 *
 *   pnpm -F @radar/web exec vitest run test/JournalWorkspace.test.tsx
 */
import type { ComponentProps } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JournalWorkspace from "../src/components/JournalWorkspace";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

type Call = { url: string; method: string };
type Props = ComponentProps<typeof JournalWorkspace>;

const dossierPayload = {
  etat: {
    organisations: 2, sources: 3, sourcesActives: 2, sourcesMuettes: 1,
    evenements: 4, evenements30j: 1, indicateurs: 5, alertes: 0,
    journalEvenements: 6, archives: 0, regles: 1, migrations: 2,
    derniereMigration: "2026-11-01", domainesConnus: 3,
  },
  dossier: { genere: "2026-11-24T00:00:00Z", sections: [] },
};

let calls: Call[] = [];
let journalStatus = 200;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let downloads: string[] = [];
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function reply(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob(["id,q\n"], { type: "text/csv" }),
  } as unknown as Response;
}

beforeEach(() => {
  calls = [];
  downloads = [];
  journalStatus = 200;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.includes("/journal/review/export.csv")) return reply(null);
    if (url.includes("/journal/review")) {
      return reply({ rows: [], avant: null }, journalStatus);
    }
    if (url.includes("/dossier")) return reply(dossierPayload);
    return reply(null, 404);
  };
  URL.createObjectURL = vi.fn(() => "blob:journal-test");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.restoreAllMocks();
});

function mount(props: Props = {}): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<JournalWorkspace {...props} />));
  return host;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function settle(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 300);
  await act(async () => { await promise; });
  await flush();
}

function tabs(element: HTMLElement): HTMLButtonElement[] {
  return Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

function panels(element: HTMLElement): HTMLElement[] {
  return Array.from(element.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
}

function press(element: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    element.focus();
    element.dispatchEvent(event);
  });
  return event;
}

function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("JournalWorkspace", () => {
  it("expose des onglets et des panneaux accessibles", async () => {
    const element = mount();
    await flush();

    const list = element.querySelector('[role="tablist"]');
    expect(list?.getAttribute("aria-label")).toBe("Sections du journal");

    const buttons = tabs(element);
    const sections = panels(element);
    expect(buttons.map((button) => button.textContent)).toEqual(["Journal", "Dossier"]);
    expect(sections).toHaveLength(2);
    expect(buttons.map((button) => button.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1]);

    buttons.forEach((button, index) => {
      expect(button.getAttribute("aria-controls")).toBe(sections[index].id);
      expect(sections[index].getAttribute("aria-labelledby")).toBe(button.id);
      expect(sections[index].getAttribute("role")).toBe("tabpanel");
      expect(sections[index].hidden).toBe(index !== 0);
    });

    expect(sections[0].querySelector("#journal-q")).not.toBeNull();
    expect(sections[1].querySelector(".dossier")).not.toBeNull();
  });

  it("bascule à la souris et au clavier, avec le focus sur l'onglet actif", async () => {
    const element = mount();
    await flush();
    const [journalTab, dossierTab] = tabs(element);
    const [journalPanel, dossierPanel] = panels(element);

    act(() => dossierTab.click());
    expect(dossierTab.getAttribute("aria-selected")).toBe("true");
    expect(journalTab.getAttribute("aria-selected")).toBe("false");
    expect(journalPanel.hidden).toBe(true);
    expect(dossierPanel.hidden).toBe(false);
    expect(dossierTab.tabIndex).toBe(0);
    expect(journalTab.tabIndex).toBe(-1);

    const wrap = press(dossierTab, "ArrowRight");
    expect(wrap.defaultPrevented).toBe(true);
    expect(journalTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(journalTab);

    press(journalTab, "ArrowLeft");
    expect(dossierTab.getAttribute("aria-selected")).toBe("true");
    press(dossierTab, "Home");
    expect(journalTab.getAttribute("aria-selected")).toBe("true");
    press(journalTab, "End");
    expect(dossierTab.getAttribute("aria-selected")).toBe("true");

    press(tabs(element)[1], "Unknown");
    expect(dossierTab.getAttribute("aria-selected")).toBe("true");
  });

  it("accepte un onglet contrôlé par l'URL et notifie les changements", async () => {
    const onTabChange = vi.fn();
    const element = mount({ tab: "dossier", onTabChange });
    await flush();
    expect(panels(element)[1].hidden).toBe(false);

    act(() => tabs(element)[0].click());
    expect(onTabChange).toHaveBeenCalledWith("journal");
    // Sans mise à jour du prop contrôlé, le panneau reste celui de l'hôte.
    expect(panels(element)[1].hidden).toBe(false);

    act(() => root!.render(<JournalWorkspace tab="journal" onTabChange={onTabChange} />));
    expect(panels(element)[0].hidden).toBe(false);
    expect(panels(element)[1].hidden).toBe(true);
  });

  it("transmet onUnauthorized au journal", async () => {
    journalStatus = 401;
    const onUnauthorized = vi.fn();
    const element = mount({ onUnauthorized });
    await flush();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(element.textContent).toContain("session expirée");
    expect(element.textContent).toContain("/journal/review");
  });

  it("conserve filtres et export après un aller-retour dans le dossier", async () => {
    const element = mount();
    await flush();

    setValue(element.querySelector<HTMLInputElement>("#journal-q")!, "alias");
    await settle();
    expect(calls.some((call) => call.url.includes("/api/journal/review?") && call.url.includes("q=alias"))).toBe(true);

    act(() => tabs(element)[1].click());
    expect(panels(element)[0].hidden).toBe(true);
    act(() => tabs(element)[0].click());
    expect(element.querySelector<HTMLInputElement>("#journal-q")!.value).toBe("alias");

    const exportButton = Array.from(element.querySelectorAll("button"))
      .find((button) => button.textContent === "Exporter en CSV");
    expect(exportButton).toBeDefined();
    await act(async () => { exportButton!.click(); });
    await flush();

    expect(calls.some((call) => call.url.includes("/journal/review/export.csv") && call.url.includes("q=alias"))).toBe(true);
    expect(downloads).toContain("journal-review.csv");
  });
});
