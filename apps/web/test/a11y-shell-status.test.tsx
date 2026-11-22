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

async function renderShell(): Promise<HTMLDivElement> {
  localStorage.setItem("radar_token", "a11y-status-token");
  const host = document.createElement("div");
  document.body.appendChild(host);
  hosts.push(host);
  const { promise, resolve } = Promise.withResolvers<void>();
  await act(async () => {
    createRoot(host).render(<App />);
    setTimeout(resolve, 80);
    await promise;
  });
  return host;
}

it("announces an API failure as an assertive status message", async () => {
  const host = await renderShell();
  const error = host.querySelector<HTMLElement>("p.shell__error");
  expect(error).toBeTruthy();
  expect(error!.getAttribute("role")).toBe("alert");
  expect(error!.getAttribute("aria-live")).toBe("assertive");
});

it("announces stale offline data as a polite status message", async () => {
  localStorage.setItem("radar:instantane:carte", JSON.stringify({
    at: Date.now() - 30 * 60_000,
    data: { orgs: [{}], events: [] },
  }));
  const host = await renderShell();
  const offline = host.querySelector<HTMLElement>("p.shell__offline");
  expect(offline).toBeTruthy();
  expect(offline!.getAttribute("role")).toBe("status");
  expect(offline!.getAttribute("aria-live")).toBe("polite");
});
