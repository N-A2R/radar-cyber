// @vitest-environment jsdom
/**
 * Revue de masse — test du composant monté en DOM.
 *
 * Prouve le fait observable demandé : sélectionner trois lignes puis
 * « Accepter la sélection » envoie trois POST, un par ligne, en série, avec
 * le même motif, puis relit la file. Le premier POST est retenu le temps de
 * vérifier l'indicateur de progression.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewView, { type RevueQueue, type RevueRow } from "../src/components/ReviewView";

// React exige ce drapeau pour act() lors d'un montage DOM piloté par le test.
const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

type DecisionBody = { decision: string; raison: string; orgId?: number };
type Call = { url: string; method: string; body: DecisionBody | null };

function row(id: number, hint: string): RevueRow {
  return {
    id, source: "jeu-test", sourceUrl: null, groupe: null, orgHint: hint,
    claimedAt: "2026-11-10T12:00:00Z", receivedAt: "2026-11-10T10:00:00Z", tlp: "AMBER",
    triage: { score: 42, bucket: "tiede", suggested: "review", reasons: [] },
    candidates: [{ id: 100 + id, name: `Organisation ${id}`, score: 0.8, via: "domain", city: null, dept: null }],
    rejectRule: null, city: null, dept: null, review: [],
  };
}

const initialRows = [row(11, "Commune de Pessac"), row(12, "acme.com"), row(13, "autre.fr")];
const queue: RevueQueue = {
  rows: initialRows, total: initialRows.length, page: 0, limit: 50,
  window: 500, truncated: false, counts: { pending: 3 }, tookMs: 4,
};

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function setField(element: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

describe("ReviewView — décisions groupées", () => {
  let calls: Call[];
  let active: number;
  let maxActive: number;
  let firstDecision: PromiseWithResolvers<void>;
  beforeEach(() => {
    calls = [];
    active = 0;
    maxActive = 0;
    firstDecision = Promise.withResolvers<void>();
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as DecisionBody : null;
      calls.push({ url, method: init?.method ?? "GET", body });
      if (url.includes("/api/review/queue")) return response(queue);
      if (/\/api\/review\/\d+\/decision/.test(url)) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          if (calls.filter((call) => call.url.includes("/decision")).length === 1) await firstDecision.promise;
          return response({ ok: true });
        } finally {
          active -= 1;
        }
      }
      throw new Error(`appel inattendu : ${url}`);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sélectionne 3 lignes puis accepter envoie 3 appels avec le motif commun", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | undefined;
    try {
      await act(async () => {
        root = createRoot(host);
        root.render(<ReviewView canWrite server />);
      });
      await flush();

      const rowChecks = [...host.querySelectorAll<HTMLInputElement>('.revue__row input[type="checkbox"]')];
      expect(rowChecks).toHaveLength(3);
      for (const check of rowChecks) {
        await act(async () => { check.click(); });
      }
      expect(host.querySelector(".revue__bulk-count")?.textContent).toContain("3 sélectionnées sur 3");
      expect(host.querySelector<HTMLInputElement>('input[aria-label="Tout sélectionner"]')?.checked).toBe(true);

      const accept = [...host.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Accepter la sélection"));
      expect(accept?.disabled).toBe(true);
      setField(host.querySelector<HTMLTextAreaElement>("#revue-bulk-raison")!, "rattachement vérifié au registre");
      expect(accept?.disabled).toBe(false);

      await act(async () => { accept!.click(); });
      await flush();
      expect(host.textContent).toContain("Décisions 0/3 envoyées");

      await act(async () => { firstDecision.resolve(); });
      await flush();

      const decisions = calls.filter((call) => call.url.includes("/decision"));
      expect(decisions).toHaveLength(3);
      expect(decisions.map((call) => call.url)).toEqual([
        "/api/review/11/decision",
        "/api/review/12/decision",
        "/api/review/13/decision",
      ]);
      expect(decisions.every((call) => call.method === "POST")).toBe(true);
      expect(decisions.map((call) => call.body)).toEqual([
        { decision: "accepter", raison: "rattachement vérifié au registre", orgId: 111 },
        { decision: "accepter", raison: "rattachement vérifié au registre", orgId: 112 },
        { decision: "accepter", raison: "rattachement vérifié au registre", orgId: 113 },
      ]);
      expect(maxActive).toBe(1);
      expect(calls.filter((call) => call.url.includes("/api/review/queue"))).toHaveLength(2);
      expect(host.querySelector(".revue__notice")?.textContent).toContain("Acceptations enregistrées");
      expect(host.querySelector(".revue__bulk-count")?.textContent).toContain("0 sélectionnée sur 3");
    } finally {
      await act(async () => { root?.unmount(); });
      host.remove();
    }
  });
});
