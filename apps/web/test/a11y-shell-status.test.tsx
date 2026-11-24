// @vitest-environment jsdom
/** API failures and stale snapshots must be announced, not only painted. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

// The module reads VITE_DATA_MODE at import time; the failing API is installed
// first so the App exercises its real error path.
import type AppType from "../src/App";

let App: AppType;
const hosts: HTMLDivElement[] = [];

beforeAll(async () => {
  vi.stubGlobal("EventSource", class { addEventListener() {} close() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
  App = (await import("../src/App")).default;
  (globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const host of hosts) host.remove();
  hosts.length = 0;
  localStorage.clear();
});

/**
 * Réactive le rendu pendant l'attente : sous IS_REACT_ACT_ENVIRONMENT, les
 * effets sont différés à la sortie d'act() — un simple setTimeout dans un
 * act() unique n'observe jamais un état issu d'un effet. Chaque boucle
 * enveloppe son attente dans son propre act(), comme le fait
 * test/navigation-ecrans.test.tsx (waitForText), pour laisser progresser
 * fetch → retry (250 + 500 ms) → setError → re-render.
 */
async function settle(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  await act(async () => { await promise; });
}

async function waitFor(selector: string, ms = 4_000): Promise<HTMLElement | null> {
  const deadline = Date.now() + ms;
  let el: HTMLElement | null = null;
  while (Date.now() < deadline) {
    el = hosts[hosts.length - 1]?.querySelector<HTMLElement>(selector) ?? null;
    if (el) return el;
    await settle(50);
  }
  return el;
}

async function renderShell(): Promise<HTMLDivElement> {
  localStorage.setItem("radar_token", "a11y-status-token");
  const host = document.createElement("div");
  document.body.appendChild(host);
  hosts.push(host);
  await act(async () => {
    createRoot(host).render(<App />);
  });
  return host;
}

it("announces an API failure as an assertive status message", async () => {
  const host = await renderShell();
  const error = await waitFor("p.shell__error");
  expect(error, "p.shell__error doit apparaître après l'échec des tentatives").toBeTruthy();
  expect(error!.getAttribute("role")).toBe("alert");
  expect(error!.getAttribute("aria-live")).toBe("assertive");
}, 15_000);

it("announces stale offline data as a polite status message", async () => {
  localStorage.setItem("radar:instantane:carte", JSON.stringify({
    at: Date.now() - 30 * 60_000,
    data: { orgs: [{}], events: [] },
  }));
  const host = await renderShell();
  const offline = await waitFor("p.shell__offline");
  expect(offline, "p.shell__offline doit apparaître pour un instantané périmé").toBeTruthy();
  expect(offline!.getAttribute("role")).toBe("status");
  expect(offline!.getAttribute("aria-live")).toBe("polite");
}, 15_000);
