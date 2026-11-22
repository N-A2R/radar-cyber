// @vitest-environment jsdom
/**
 * Revue — un seul état de file à la fois.
 *
 * Le défaut constaté : quand /api/review/queue ne répond pas, l'écran montrait
 * simultanément « 0 affichées sur 0 dans la file » (état vide) et un squelette
 * de chargement qui ne s'arrêtait jamais. Ces deux tests prouvent que le
 * composant quitte le chargement au bout du délai, ou dès le rejet, et laisse
 * une action « Réessayer » qui relance réellement la requête.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewView, { type RevueQueue, type RevueRow } from "../src/components/ReviewView";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

function row(id: number, hint: string): RevueRow {
  return {
    id, source: "jeu-test", sourceUrl: null, groupe: null, orgHint: hint,
    claimedAt: "2026-11-10T12:00:00Z", receivedAt: "2026-11-10T10:00:00Z", tlp: "AMBER",
    triage: { score: 42, bucket: "tiede", suggested: "review", reasons: [] },
    candidates: [{ id: 100 + id, name: `Organisation ${id}`, score: 0.8, via: "domain", city: null, dept: null }],
    rejectRule: null, city: null, dept: null, review: [],
  };
}

const queue: RevueQueue = {
  rows: [row(11, "Commune de Pessac")], total: 1, page: 0, limit: 50,
  window: 500, truncated: false, counts: { pending: 1 }, tookMs: 4,
};

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

describe("ReviewView — un seul état à la fois", () => {
  let host: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = undefined;
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function mount(): Promise<void> {
    await act(async () => {
      root = createRoot(host);
      root.render(<ReviewView server />);
    });
    await flush();
  }

  it("quitte le chargement après 10 s sans réponse et propose de réessayer", async () => {
    // Une promesse qui ne se résout jamais : exactement la panne observée.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    await mount();

    expect(host.textContent).toContain("Chargement de la file de revue…");
    expect(host.textContent).not.toContain("affichées sur");

    await act(async () => { vi.advanceTimersByTime(10_000); });
    await flush();

    expect(host.querySelector(".revue__error")?.textContent).toContain("La file de revue ne répond pas.");
    expect(host.querySelector<HTMLButtonElement>(".revue__retry")?.textContent).toBe("Réessayer");
    expect(host.textContent).not.toContain("Chargement de la file de revue…");
    expect(host.textContent).not.toContain("affichées sur");
    expect(host.querySelector(".revue__empty")).toBeNull();
  });

  it("affiche une promesse rejetée, puis Réessayer relance et rend la file", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("panne réseau"))
      .mockResolvedValueOnce(response(queue));
    vi.stubGlobal("fetch", fetchMock);
    await mount();

    expect(host.querySelector(".revue__error")?.textContent).toContain("panne réseau");
    expect(host.querySelector(".revue__retry")).not.toBeNull();
    expect(host.textContent).not.toContain("Chargement de la file de revue…");
    expect(host.textContent).not.toContain("affichées sur");

    await act(async () => {
      host.querySelector<HTMLButtonElement>(".revue__retry")!.click();
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.querySelector(".revue__error")).toBeNull();
    expect(host.querySelector(".revue__results")?.textContent).toContain("1 affichées sur 1");
    expect(host.textContent).toContain("Commune de Pessac");
  });
});
