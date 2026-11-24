// @vitest-environment jsdom
/**
 * M4, observable côté utilisateur : changer le périmètre du fil ne doit
 * relire que /events. Aucun endpoint lourd du shell ne doit être rejoué.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "../src/App";

vi.mock("../src/map/Map3D", () => ({
  default: () => <div role="img" aria-label="Carte territoriale" />,
}));

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

class FakeEventSource {
  addEventListener() {}
  close() {}
}

type ReponseSimulee = { ok: boolean; status: number; json: () => Promise<unknown> };
function json(corps: unknown): ReponseSimulee {
  return { ok: true, status: 200, json: async () => corps };
}

async function tour(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

beforeAll(async () => {
  // Le fil n'est monté que sur Carte/Graphe : précharger le chunk évite que
  // le test mesure la transformation Vite au lieu du comportement du fil.
  await import("../src/components/TodayView");
});

describe("périmètre du fil", () => {
  let host: HTMLDivElement;
  let root: Root | undefined;
  let appels: string[];

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    host.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("ne rejoue que /events quand on passe de Région à Tout", async () => {
    appels = [];
    window.location.hash = "#/map";
    localStorage.setItem("radar_token", "jeton-de-test");
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      const url = String(input);
      appels.push(url);
      if (url.includes("/api/events")) return json([]);
      if (url.includes("/api/orgs/liees/historique")) return json({ points: [] });
      if (url.includes("/api/orgs/liees")) return json({ semaine: 0, total: 0, enAttente: 0, examinees: 0, parDepartement: [] });
      if (url.includes("/api/orgs")) return json([]);
      if (url.includes("/api/flows")) return json({ arcs: [] });
      if (url.includes("/api/graph")) return json({ nodes: [], links: [] });
      if (url.includes("/api/stats/departements")) return json({ departements: [] });
      if (url.includes("/api/stats")) return json({ orgs: 0, events: 0, indicators: 0, sources: { total: 0, active: 0, ok: 0, err: 0 }, byFamily: [], byAssertion: [] });
      if (url.includes("/api/today")) return json({ compteurs: { evenements24h: 0, organisations7j: 0, derniereCollecte: null }, evenements: [] });
      // Les autres panneaux ne sont pas sous test : on les refuse au lieu
      // d'inventer des données ; App isole chaque échec via allSettled.
      return { ok: false, status: 503, json: async () => ({}) };
    }));

    host = document.createElement("div");
    document.body.appendChild(host);
    await act(async () => {
      root = createRoot(host);
      root.render(<App />);
    });
    // Le shell ne sonde plus /stats : on attend la première lecture du fil
    // (portée Région) avant de mesurer l'effet du clic.
    for (let i = 0; i < 20 && !appels.some((url) => url.includes("portee=region")); i += 1) await tour();
    expect(appels.some((url) => url.includes("portee=region"))).toBe(true);
    // Les endpoints refusés sont rejoués par le client (250 + 500 ms) : on
    // attend la fin de cette rafale avant de mesurer l'effet du clic.
    await act(async () => { await new Promise<void>((r) => setTimeout(r, 900)); });

    const bouton = [...host.querySelectorAll<HTMLButtonElement>(".family-filter__btn")]
      .find((element) => element.textContent?.includes("Tout"));
    expect(bouton).toBeTruthy();
    appels = [];
    await act(async () => { bouton!.click(); });
    for (let i = 0; i < 20 && !appels.some((url) => url.includes("portee=toutes")); i += 1) await tour();

    expect(appels).toHaveLength(1);
    expect(appels[0]).toContain("/api/events?");
    expect(appels[0]).toContain("portee=toutes");
    for (const lourd of ["/api/stats", "/api/graph", "/api/health/detail", "/api/health/causes", "/api/na/overview", "/api/flows"]) {
      expect(appels.some((url) => url.includes(lourd)), `${lourd} ne doit pas être rejoué`).toBe(false);
    }
  }, 15_000);
});
