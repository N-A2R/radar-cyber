// @vitest-environment jsdom
/**
 * Review queue — mounted component, keyboard and filter unit tests.
 *
 * These tests observe what the component actually does: which row is active,
 * which decision form opens, which POST leaves the browser, and which rows
 * remain visible. No database is touched.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewView, { type RevueQueue, type RevueRow } from "../src/components/ReviewView";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

type DecisionBody = { decision: string; raison: string; orgId?: number };
type Call = { url: string; method: string; body: DecisionBody | null };

function row(id: number, hint: string, groupe: string | null): RevueRow {
  return {
    id, source: "test-source", sourceUrl: null, groupe, orgHint: hint,
    claimedAt: "2026-11-10T12:00:00Z", receivedAt: "2026-11-10T10:00:00Z", tlp: "AMBER",
    triage: { score: 42, bucket: "tiede", suggested: "review", reasons: [] },
    candidates: [{ id: 100 + id, name: `Organisation ${id}`, score: 0.8, via: "domain", city: null, dept: null }],
    rejectRule: null, city: null, dept: null, review: [],
  };
}

const initialRows = [
  row(11, "Alpha SAS", "lockbit"),
  row(12, "beta.fr", "qilin"),
  row(13, "gamma.org", "lockbit"),
];
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

describe("ReviewView — keyboard controls and queue tools", () => {
  let calls: Call[];
  let queueBody: RevueQueue;
  let host: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    calls = [];
    queueBody = queue;
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as DecisionBody : null;
      calls.push({ url, method: init?.method ?? "GET", body });
      if (url.includes("/api/review/queue")) return response(queueBody);
      if (/\/api\/review\/\d+\/decision/.test(url)) return response({ ok: true });
      throw new Error(`unexpected call: ${url}`);
    }));
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = undefined;
    host.remove();
    vi.unstubAllGlobals();
  });

  async function mount(): Promise<void> {
    await act(async () => {
      root = createRoot(host);
      root.render(<ReviewView canWrite server />);
    });
    await flush();
  }

  function press(key: string, options: { shift?: boolean; target?: Element } = {}): void {
    const node = options.target ?? host.querySelector(".revue")!;
    act(() => {
      node.dispatchEvent(new window.KeyboardEvent("keydown", {
        key, shiftKey: options.shift ?? false, bubbles: true, cancelable: true,
      }));
    });
  }

  function buttonIn(scope: ParentNode, label: string): HTMLButtonElement {
    const found = [...scope.querySelectorAll("button")]
      .find((button) => (button.textContent ?? "").includes(label)) as HTMLButtonElement | undefined;
    if (!found) throw new Error(`button not found: ${label}`);
    return found;
  }

  function activeRowId(): string | null {
    return host.querySelector('.revue__row[data-active="true"]')?.textContent?.includes("Alpha SAS")
      ? "11"
      : host.querySelector('.revue__row[data-active="true"]')?.textContent?.includes("beta.fr") ? "12" : "13";
  }

  function decisions(): Call[] {
    return calls.filter((call) => call.url.includes("/decision"));
  }

  it("j/k move the cursor and x/Shift+A select rows", async () => {
    await mount();
    expect(activeRowId()).toBe("11");

    press("j");
    expect(activeRowId()).toBe("12");
    press("k");
    expect(activeRowId()).toBe("11");

    press("x");
    expect(host.querySelector(".revue__bulk-count")?.textContent).toContain("1 sélectionnée sur 3");
    press("A", { shift: true });
    expect(host.querySelector(".revue__bulk-count")?.textContent).toContain("3 sélectionnées sur 3");

    press("Escape");
    expect(host.querySelector(".revue__bulk-count")?.textContent).toContain("0 sélectionnée sur 3");
    expect(decisions()).toHaveLength(0);
  });

  it("a opens acceptance and posts the chosen candidate", async () => {
    await mount();
    press("a");
    expect(host.querySelector(".revue__decision-title")?.textContent).toContain("Acceptation");

    const form = host.querySelector<HTMLFormElement>(".revue__decision")!;
    setField(form.querySelector("textarea")!, "checked against the register");
    await act(async () => { form.querySelector<HTMLInputElement>('input[type="radio"]')!.click(); });
    await act(async () => { buttonIn(form, "Confirmer").click(); });
    await flush();

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0]).toMatchObject({
      url: "/api/review/11/decision",
      method: "POST",
      body: { decision: "accepter", raison: "checked against the register", orgId: 111 },
    });
    expect(host.textContent).toContain("Acceptation enregistrée");
  });

  it("r opens rejection and posts no organisation", async () => {
    await mount();
    press("r");
    expect(host.querySelector(".revue__decision-title")?.textContent).toContain("Rejet");

    const form = host.querySelector<HTMLFormElement>(".revue__decision")!;
    expect(form.querySelector('input[type="radio"]')).toBeNull();
    setField(form.querySelector("textarea")!, "outside the regional scope");
    await act(async () => { buttonIn(form, "Confirmer").click(); });
    await flush();

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0]).toMatchObject({
      url: "/api/review/11/decision",
      body: { decision: "refuser", raison: "outside the regional scope" },
    });
    expect(decisions()[0].body?.orgId).toBeUndefined();
  });

  it("c opens organisation creation", async () => {
    await mount();
    press("c");
    expect(host.querySelector(".revue__decision-title")?.textContent).toContain("Création d'organisation");

    const form = host.querySelector<HTMLFormElement>(".revue__decision")!;
    setField(form.querySelector("textarea")!, "missing from the referential");
    await act(async () => { buttonIn(form, "Confirmer").click(); });
    await flush();

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].body).toEqual({ decision: "creer", raison: "missing from the referential" });
  });

  it("? opens help and Escape closes it", async () => {
    await mount();
    press("?");
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Raccourcis clavier");
    press("j");
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    press("Escape");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("focus in a field neutralises shortcuts", async () => {
    await mount();
    press("a");
    const textarea = host.querySelector<HTMLTextAreaElement>(".revue__decision textarea")!;
    expect(document.activeElement).toBe(textarea);

    for (const key of ["j", "k", "a", "r", "c", "?", "A"]) {
      press(key, { target: textarea, shift: key === "A" });
    }
    setField(textarea, "jkarc? reasons only");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector(".revue__decision-title")?.textContent).toContain("Acceptation");
    expect(host.querySelector(".revue__bulk-count")?.textContent).toContain("0 sélectionnée sur 3");
    expect(decisions()).toHaveLength(0);

    press("Escape", { target: textarea });
    expect(host.querySelector(".revue__decision")).toBeNull();
    press("?");
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("the family filter narrows the page and clears the selection", async () => {
    await mount();
    expect(host.querySelectorAll(".revue__row")).toHaveLength(3);

    const familyGroup = host.querySelector<HTMLElement>(".revue__families")!;
    expect(buttonIn(familyGroup, "lockbit").textContent).toContain("2");
    await act(async () => { buttonIn(familyGroup, "lockbit").click(); });

    expect(host.querySelectorAll(".revue__row")).toHaveLength(2);
    expect(host.querySelector(".revue__results")?.textContent).toContain("famille : lockbit");

    const check = host.querySelector<HTMLInputElement>('.revue__row input[type="checkbox"]')!;
    await act(async () => { check.click(); });
    expect(host.querySelector(".revue__bulk-count")?.textContent).toContain("1 sélectionnée sur 2");

    await act(async () => { buttonIn(familyGroup, "qilin").click(); });
    expect(host.querySelectorAll(".revue__row")).toHaveLength(1);
    expect(host.querySelector(".revue__bulk-count")?.textContent).toContain("0 sélectionnée sur 1");
  });

  it("refresh re-reads the queue without reloading the page", async () => {
    await mount();
    expect(calls.filter((call) => call.url.includes("/api/review/queue"))).toHaveLength(1);

    const refresh = host.querySelector<HTMLButtonElement>('button[aria-label="Actualiser la file"]')!;
    await act(async () => { refresh.click(); });
    await flush();

    expect(calls.filter((call) => call.url.includes("/api/review/queue"))).toHaveLength(2);
    expect(host.querySelector(".revue__notice")?.textContent).toContain("File actualisée");
    expect(host.querySelectorAll(".revue__row")).toHaveLength(3);
  });

  it("an empty queue shows an explicit state", async () => {
    queueBody = { ...queue, rows: [], total: 0 };
    await mount();
    expect(host.querySelector(".revue__empty")?.textContent).toContain("Aucune revendication restante à examiner.");
    expect(host.querySelector(".revue__empty")?.textContent).toContain("chaque revendication publique a une décision enregistrée");
    expect(host.querySelector(".revue__count")?.textContent).toContain("0 revendications restantes");
  });
});
