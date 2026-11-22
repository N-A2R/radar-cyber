// @vitest-environment jsdom
/**
 * Santé — aucun zéro avant la réponse.
 *
 * Le défaut constaté : tant que `GET /api/health/sources` n'avait pas répondu,
 * l'écran annonçait « 0 flux · 0 ok · 0 en erreur ». Ces tests prouvent que
 * l'absence de donnée affiche un squelette et jamais des compteurs, qu'un échec
 * laisse un message et un bouton « Réessayer », et qu'une réponse remplit le
 * résumé et le tableau.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HealthView from "../src/components/HealthView";
import type { HealthSources } from "../src/api";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

function reponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function page(): HealthSources {
  return {
    ok: true,
    generatedAt: "2026-11-22T12:00:00.000Z",
    total: 2506,
    counts: { ok: 19, error: 3, pending: 2484 },
    families: [
      { family: "cti", sources: 1200 },
      { family: "leaks", sources: 306 },
    ],
    matching: 2,
    page: 1,
    pageSize: 50,
    pages: 1,
    items: [
      {
        id: "src-1",
        name: "CERT-FR avis",
        family: "cert_fr",
        url: "https://exemple.invalid/cert",
        enabled: true,
        status: "ok",
        lastOkAt: "2026-11-22T10:00:00.000Z",
        lastErrorAt: null,
        lastError: null,
        lastItems: 12,
      },
      {
        id: "src-2",
        name: "Flux muet",
        family: "leaks",
        url: "https://exemple.invalid/muet",
        enabled: true,
        status: "error",
        lastOkAt: null,
        lastErrorAt: "2026-11-22T09:00:00.000Z",
        lastError: "HTTP 503",
        lastItems: null,
      },
    ],
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("HealthView — pas de zéros avant la donnée", () => {
  let host: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    root = undefined;
    host.remove();
    vi.unstubAllGlobals();
  });

  async function monter(): Promise<void> {
    await act(async () => {
      root = createRoot(host);
      root.render(<HealthView />);
    });
    await flush();
  }

  it("affiche un squelette et aucun compteur tant que la réponse n'est pas arrivée", async () => {
    // Une requête qui ne se résout jamais : le premier rendu doit rester muet.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    await monter();

    expect(host.querySelectorAll(".skeleton__line").length).toBeGreaterThan(0);
    expect(host.textContent).toContain("lecture des sources…");
    expect(host.textContent).not.toContain("0 flux");
    expect(host.textContent).not.toContain("0 ok");
    expect(host.textContent).not.toMatch(/\d+ flux ·/);
  });

  it("un échec laisse un message et un bouton Réessayer qui relance l'appel", async () => {
    const fetchMock = vi.fn(async () => reponse({ erreur: "base indisponible" }, 503));
    vi.stubGlobal("fetch", fetchMock);
    await monter();

    expect(host.textContent).toContain("sources indisponibles");
    expect(host.textContent).not.toContain("0 flux");
    const bouton = [...host.querySelectorAll("button")].find((b) => b.textContent === "Réessayer");
    expect(bouton).toBeTruthy();

    const avant = fetchMock.mock.calls.length;
    await act(async () => {
      bouton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(avant);
  });

  it("une réponse remplit le résumé et le tableau, sans squelette résiduel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse(page())));
    await monter();

    // Les espaces insécables de `toLocaleString("fr-FR")` sont normalisées.
    const texte = (host.textContent ?? "").replace(/\s/g, " ");
    expect(host.querySelectorAll(".skeleton__line").length).toBe(0);
    expect(texte).toContain("2 506 flux");
    expect(texte).toContain("19 ok");
    expect(texte).toContain("3 en erreur");
    expect(texte).toContain("CERT-FR avis");
    expect(texte).toContain("HTTP 503");
    expect(texte).not.toContain("lecture des sources…");
  });
});
