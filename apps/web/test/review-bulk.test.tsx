// @vitest-environment jsdom
/**
 * Sélection multiple de la file de revue : trois lignes cochées, puis une
 * acceptation groupée, doivent produire trois POST unitaires en série avec
 * le même motif, une progression affichée et une seule relecture de la file.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewView, { type RevueQueue, type RevueRow } from "../src/components/ReviewView";

type Call = { url: string; method: string; body: Record<string, unknown> | null };

const calls: Call[] = [];
let gates: Array<() => void> = [];
let container: HTMLDivElement;
let root: Root;

function row(id: number, hint: string): RevueRow {
  return {
    id, source: "jeu-test", sourceUrl: null, groupe: null, orgHint: hint,
    claimedAt: null, receivedAt: "2026-11-21T12:00:00Z", tlp: "RED",
    triage: { score: 40, bucket: "tiede", suggested: "review", reasons: [] },
    candidates: [{ id: 100 + id, name: `Organisation ${id}`, score: 0.8, via: "domain", city: null, dept: null }],
    rejectRule: null, city: null, dept: null, review: [],
  };
}

const rows = [row(11, "Pessac"), row(12, "ACME"), row(13, "autre.fr")];

function queue(): RevueQueue {
  return {
    rows, total: rows.length, page: 0, limit: 50, window: 500, truncated: false,
    counts: { pending: rows.length }, tookMs: 1,
  };
}

async function flush(): Promise<void> {
  for (let n = 0; n < 4; n++) await act(async () => { await Promise.resolve(); });
}

function decisions(): Call[] {
  return calls.filter((call) => call.url.includes("/decision"));
}

function queues(): Call[] {
  return calls.filter((call) => call.url.includes("/api/review/queue"));
}

function text(selector: string): string {
  return container.querySelector(selector)?.textContent ?? "";
}

function buttonIn(scope: ParentNode, label: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")]
    .find((button) => button.textContent?.includes(label)) as HTMLButtonElement | undefined;
  if (!found) throw new Error(`bouton introuvable : ${label}`);
  return found;
}

beforeEach(() => {
  calls.length = 0;
  gates = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  const g = globalThis as unknown as Record<string, unknown>;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null,
    });
    if (url.includes("/api/review/queue")) {
      return { ok: true, status: 200, json: async () => queue() } as unknown as Response;
    }
    if (/\/api\/review\/\d+\/decision/.test(url)) {
      // Chaque décision n'avance que quand le test ouvre son guichet : on voit
      // la progression et on prouve qu'il n'y a jamais deux POST en vol.
      const gate = Promise.withResolvers<void>();
      gates.push(gate.resolve);
      await gate.promise;
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    }
    throw new Error(`appel inattendu : ${url}`);
  }));
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("ReviewView — actions groupées", () => {
  it("sélectionne 3 lignes et accepter envoie 3 POST en série, puis rafraîchit la file", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(<ReviewView canWrite server />);
    });
    await flush();
    expect(queues()).toHaveLength(1);

    const boxes = [...container.querySelectorAll<HTMLInputElement>(".revue__row input[type=checkbox]")];
    expect(boxes).toHaveLength(3);
    act(() => { boxes[0].click(); });
    expect(text(".revue__selection")).toContain("1 ligne sélectionnée sur 3");
    expect(container.querySelector<HTMLInputElement>(".revue__pick input")?.indeterminate).toBe(true);
    act(() => { boxes[1].click(); boxes[2].click(); });
    expect(text(".revue__selection")).toContain("3 lignes sélectionnées sur 3");
    expect(container.querySelector<HTMLInputElement>(".revue__pick input")?.indeterminate).toBe(false);

    act(() => { buttonIn(container.querySelector(".revue__bulk")!, "Accepter la sélection").click(); });
    await flush();
    expect(container.querySelectorAll(".revue__bulk-form select")).toHaveLength(3);

    const reason = container.querySelector<HTMLTextAreaElement>("#revue-bulk-raison")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(reason, "motif commun");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();

    const confirm = buttonIn(container.querySelector(".revue__bulk-form")!, "Confirmer (3)");
    await act(async () => { confirm.click(); });
    await flush();
    for (let pending = 1; pending <= 3; pending++) {
      // Un seul POST en vol, et la progression correspond aux décisions reçues.
      expect(decisions()).toHaveLength(pending);
      expect(gates).toHaveLength(1);
      expect(text(".revue__progress")).toContain(`${pending - 1}/3`);
      await act(async () => { gates.shift()!(); });
      await flush();
    }
    expect(decisions()).toHaveLength(3);
    expect(gates).toHaveLength(0);
    await flush();

    expect(decisions().map((call) => call.url)).toEqual([
      "/api/review/11/decision",
      "/api/review/12/decision",
      "/api/review/13/decision",
    ]);
    expect(decisions().every((call) => call.method === "POST")).toBe(true);
    expect(decisions().map((call) => call.body)).toEqual(rows.map((item) => ({
      decision: "accepter", raison: "motif commun", orgId: 100 + item.id,
    })));
    expect(queues()).toHaveLength(2);
    expect(text(".revue__selection")).toContain("0 ligne sélectionnée sur 3");
  });
});
