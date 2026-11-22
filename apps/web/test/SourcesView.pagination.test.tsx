// @vitest-environment jsdom
/**
 * Le registre Sources ne monte plus ses ~2 500 lignes d'un bloc : il pagine
 * 50 lignes après filtre et tri. Ce test vérifie le contrat visible — nombre
 * de lignes rendues, compteur « début–fin sur total », navigation et filtre.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import SourcesView, { PAGE_SIZE } from "../src/components/SourcesView";
import type { Source } from "../src/api";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const base: Source = {
  id: "s0",
  name: "Source neutre",
  family: "cti",
  url: "https://example.invalid",
  kind: "narrative",
  format: "rss",
  enabled: true,
  intervalSec: 3600,
  lastOkAt: null,
  lastErrorAt: null,
  lastError: null,
  itemsTotal: null,
  lastItems: null,
  ok: false,
  disabledAt: null,
  disabledReason: null,
  entrees: null,
  rejets: null,
  evenements30j: 0,
  evenementsTotal: 0,
  dernierRun: null,
  dernierRunStatut: null,
  rendement: null,
  motifs: null,
  motifDominant: null,
};

const sources: Source[] = Array.from({ length: 120 }, (_, index) => ({
  ...base,
  id: `source-${index + 1}`,
  name: `Source ${String(index + 1).padStart(3, "0")}`,
}));

let host: HTMLDivElement;
let root: Root;

function mount(): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(<SourcesView sources={sources} loading={false} error={null} />);
  });
}

function rows(): HTMLTableRowElement[] {
  return [...host.querySelectorAll<HTMLTableRowElement>("tbody tr")];
}

function counter(): string {
  return host.querySelector(".sources-view__count")?.textContent?.replace(/\u202f|\u00a0/g, " ").trim() ?? "";
}

async function clickPage(label: string): Promise<void> {
  const button = host.querySelector<HTMLButtonElement>(`nav[aria-label="Pagination du registre des sources"] button[aria-label="${label}"]`);
  expect(button, `bouton ${label}`).toBeTruthy();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function search(value: string): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  mount();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("SourcesView — pagination", () => {
  it("ne monte que 50 lignes sur 120 et compte le résultat filtré", () => {
    expect(PAGE_SIZE).toBe(50);
    expect(rows()).toHaveLength(50);
    expect(counter()).toBe("1–50 sur 120");
    expect(host.textContent).toContain("page 1 sur 3");
  });

  it("pagine sans perdre l'ordre trié et met à jour le compteur", async () => {
    expect(rows()[0].textContent).toContain("Source 001");
    await clickPage("Page suivante");
    expect(rows()).toHaveLength(50);
    expect(rows()[0].textContent).toContain("Source 051");
    expect(counter()).toBe("51–100 sur 120");
    expect(host.textContent).toContain("page 2 sur 3");

    await clickPage("Dernière page");
    expect(rows()).toHaveLength(20);
    expect(rows()[0].textContent).toContain("Source 101");
    expect(counter()).toBe("101–120 sur 120");
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Page suivante"]')!.disabled).toBe(true);
  });

  it("applique la recherche avant la tranche et ramène à la première page", async () => {
    await clickPage("Page suivante");
    expect(counter()).toBe("51–100 sur 120");

    await search("Source 12");
    expect(rows()).toHaveLength(1);
    expect(counter()).toBe("1–1 sur 1");
    expect(host.querySelector('nav[aria-label="Pagination du registre des sources"]')).toBeNull();
  });

  it("dit l'absence de résultat filtré", async () => {
    await search("introuvable");
    expect(rows()).toHaveLength(1);
    expect(counter()).toBe("aucune ligne");
    expect(host.textContent).toContain("aucune source ne correspond à la recherche");
  });
});
