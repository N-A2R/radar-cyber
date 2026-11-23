// @vitest-environment jsdom
/**
 * Le bouton « Registre des traitements (CSV) » de la toolbar Sources doit
 * déclencher un vrai téléchargement, avec le nom annoncé par le serveur (ou
 * un nom daté en secours). Sans cette preuve, un bouton rendu mais sans
 * gestionnaire passerait les tests de mise en page.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SourcesView from "../src/components/SourcesView";

const globals = globalThis as unknown as Record<string, unknown>;
globals.IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let downloads: string[];

function reponseCsv(headers: HeadersInit = {}): Response {
  return {
    ok: true,
    headers: new Headers(headers),
    blob: async () => new Blob(["source_id;source_nom\n"], { type: "text/csv" }),
  } as Response;
}

async function cliquerExport(): Promise<void> {
  const bouton = [...host.querySelectorAll<HTMLButtonElement>(".sources-view__toolbar button")]
    .find((candidat) => candidat.textContent?.includes("Registre des traitements"));
  expect(bouton, "bouton d'export présent dans la toolbar").toBeDefined();
  await act(async () => { bouton!.click(); });
  // Le gestionnaire est asynchrone : on laisse fetch()/blob() se résoudre.
  const attente = Promise.withResolvers<void>();
  setTimeout(attente.resolve, 0);
  await act(async () => { await attente.promise; });
}

beforeEach(() => {
  downloads = [];
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:test" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    if (this.download) downloads.push(this.download);
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(<SourcesView sources={[]} loading={false} error={null} />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SourcesView — export du registre des traitements", () => {
  it("télécharge le CSV nommé par le serveur au clic du bouton", async () => {
    const fetchMock = vi.fn(async () => reponseCsv({
      "Content-Disposition": 'attachment; filename="registre_traitements_2026-11-23.csv"',
    }));
    vi.stubGlobal("fetch", fetchMock);

    await cliquerExport();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/registre-traitements/export.csv",
      expect.objectContaining({ headers: expect.anything() }),
    );
    expect(downloads).toEqual(["registre_traitements_2026-11-23.csv"]);
  });

  it("utilise un nom daté si le serveur n'annonce pas de nom", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponseCsv()));

    await cliquerExport();

    expect(downloads[0]).toMatch(/^registre_traitements_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
