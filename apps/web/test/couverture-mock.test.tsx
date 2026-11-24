// @vitest-environment jsdom
/**
 * Mode démonstration : ouvrir « Couverture » doit rendre la fixture simulée
 * sans jamais appeler GET /api/couverture, comme les autres écrans de démo.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type AppType from "../src/App";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

class FakeEventSource {
  addEventListener() {}
  close() {}
}

// `VITE_DATA_MODE` est lu à l'évaluation du module App : on le pose avant
// l'import, qui reste dynamique pour cette raison précise.
let App: typeof AppType;

beforeAll(async () => {
  vi.stubEnv("VITE_DATA_MODE", "mock");
  // Les deux modules sont chargés ici, hors du test chronométré : sous la
  // suite complète, la transformation Vite des chunks lazy peut dépasser 5 s,
  // et le hook n'a donc pas le droit d'échouer sur le délai Vitest par défaut.
  await import("../src/components/CouvertureView");
  App = (await import("../src/App")).default;
}, 30_000);

async function waitForSelector(host: HTMLElement, selector: string): Promise<HTMLElement> {
  const initial = host.querySelector<HTMLElement>(selector);
  if (initial) return initial;
  const attente = Promise.withResolvers<void>();
  const observateur = new MutationObserver(() => {
    if (host.querySelector(selector)) attente.resolve();
  });
  observateur.observe(host, { childList: true, subtree: true, characterData: true });
  const garde = setTimeout(attente.resolve, 8_000);
  try {
    await act(async () => { await attente.promise; });
  } finally {
    observateur.disconnect();
    clearTimeout(garde);
  }
  const trouve = host.querySelector<HTMLElement>(selector);
  if (!trouve) throw new Error(`"${selector}" never appeared in the DOM`);
  return trouve;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Couverture en mode démonstration", () => {
  it("rend la mesure simulée sans requête réseau", async () => {
    window.location.hash = "#/coverage";
    localStorage.clear();
    const fetchMock = vi.fn(() => Promise.reject(new Error("aucun appel réseau en démo")));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource);

    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | undefined;
    try {
      await act(async () => {
        root = createRoot(host);
        root.render(<App />);
      });
      await waitForSelector(host, "#coverage-title");
      await waitForSelector(host, ".radar-map-unavailable");
      expect(host.querySelector("#coverage-title")?.textContent).toBe("Couverture");
      expect(host.querySelector(".coverage__hero-number")?.textContent).toContain("80");
      expect(host.textContent).toContain("Mode démonstration, données simulées");
      expect(host.querySelector(".radar-map-unavailable")?.textContent).toContain("WebGL2");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await act(async () => { root?.unmount(); });
      host.remove();
    }
  }, 15_000);
});
