// @vitest-environment jsdom
/**
 * Déconnexion : le bouton révoque d'abord la session côté serveur, puis
 * oublie le jeton côté client. Si la révocation échoue, le jeton reste et un
 * état « session distante encore active » propose un réessai ou une
 * déconnexion locale explicite. Sur un 401, la session est déjà invalide.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

class FakeEventSource {
  addEventListener() {}
  close() {}
}

type Call = { url: string; method: string; token?: string | null };
type LogoutBehavior = "ok" | "network" | "unauthorized";
let calls: Call[];
let logoutBehavior: LogoutBehavior;
let logoutCalls: number;
let logoutGate: Promise<void> | undefined;
let host: HTMLDivElement;
let root: Root | undefined;

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

/**
 * Le shell affiche LoginScreen via lazy() : sous la suite complète, la
 * transformation du chunk peut dépasser les sondages à intervalles fixes.
 * On attend donc une mutation réelle du DOM, avec une garde bornée.
 */
async function waitForText(text: string): Promise<void> {
  if (host.textContent?.includes(text)) return;
  const attente = Promise.withResolvers<void>();
  const observateur = new MutationObserver(() => {
    if (host.textContent?.includes(text)) attente.resolve();
  });
  observateur.observe(host, { childList: true, subtree: true, characterData: true });
  const garde = setTimeout(attente.resolve, 8_000);
  try {
    await act(async () => { await attente.promise; });
  } finally {
    observateur.disconnect();
    clearTimeout(garde);
  }
  if (!host.textContent?.includes(text)) throw new Error(`"${text}" never appeared in the DOM`);
}

async function mount(hash: string, alerts401 = false, behavior: LogoutBehavior = "ok"): Promise<void> {
  logoutBehavior = behavior;
  logoutCalls = 0;
  window.location.hash = hash;
  localStorage.setItem("radar_token", "jeton-de-session");
  vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const call: Call = { url, method };
    calls.push(call);
    if (alerts401 && url.includes("/api/alerts")) return json({ error: "expired" }, 401);
    if (url === "/api/auth/logout") {
      logoutCalls += 1;
      call.token = localStorage.getItem("radar_token");
      if (logoutGate) await logoutGate;
      if (logoutBehavior === "network") throw new Error("réseau indisponible");
      if (logoutBehavior === "unauthorized") return json({ error: "expired" }, 401);
      return json({ ok: true });
    }
    if (url.includes("/api/events")) return json([]);
    if (url === "/api/orgs/liees") return json({ semaine: 0, total: 0, enAttente: 0, examinees: 0, parDepartement: [] });
    if (url.includes("/api/orgs")) return json([]);
    if (url === "/api/na/overview") return json({
      depts: [],
      total: { orgs: 0, orgsAvecEvenement: 0, evenements: 0, deptsSansEvenement: [] },
      derniereCollecte: null,
    });
    if (url.includes("/api/sources")) return json([]);
    if (url.includes("/api/graph")) return json({ nodes: [], links: [] });
    if (url.includes("/api/stats/departements")) return json({ departements: [] });
    if (url.includes("/api/stats")) return json({ sources: { total: 0 }, byFamily: [], byAssertion: [] });
    if (url.includes("/api/today")) return json({ compteurs: { evenements24h: 0, organisations7j: 0, derniereCollecte: null }, evenements: [] });
    if (url.includes("/api/flows")) return json({ arcs: [] });
    return json({});
  }));
  await act(async () => {
    root = createRoot(host);
    root.render(<App />);
  });
  await flush();
}

function findButton(texte: string): HTMLElement {
  const bouton = [...host.querySelectorAll<HTMLElement>("button")]
    .find((element) => (element.getAttribute("aria-label") ?? element.textContent ?? "").includes(texte));
  if (!bouton) throw new Error(`Bouton "${texte}" introuvable`);
  return bouton;
}
beforeAll(async () => {
  // Préchauffer les chunks lazy : le test mesure la déconnexion, pas le temps
  // de transformation Vite des écrans sous charge de la suite complète.
  await Promise.all([
    import("../src/components/LoginScreen"),
    import("../src/components/AlertsView"),
    import("../src/components/TodayView"),
  ]);
});

beforeEach(() => {
  calls = [];
  logoutGate = undefined;
  host = document.createElement("div");
  document.body.appendChild(host);
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = undefined;
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("déconnexion", () => {
  it("appelle POST /auth/logout avant de supprimer le jeton local", async () => {
    await mount("#/today");
    const bouton = findButton("Déconnexion");

    await act(async () => { bouton.click(); });
    await flush();
    await waitForText("Se connecter");

    const logout = calls.find((call) => call.url === "/api/auth/logout");
    expect(logout?.method).toBe("POST");
    expect(logout?.token).toBe("jeton-de-session");
    expect(localStorage.getItem("radar_token")).toBeNull();
    expect(host.textContent).toContain("Se connecter");
  }, 15_000);

  it("sur 401, vide le jeton sans appeler /auth/logout", async () => {
    await mount("#/alerts", true);
    await waitForText("Se connecter");
    expect(localStorage.getItem("radar_token")).toBeNull();
    expect(calls.some((call) => call.url === "/api/auth/logout")).toBe(false);
    expect(host.textContent).toContain("Se connecter");
  }, 15_000);

  it("si la révocation échoue, garde le jeton et propose le réessai", async () => {
    await mount("#/today", false, "network");
    await act(async () => { findButton("Déconnexion").click(); });
    await flush();

    expect(logoutCalls).toBe(1);
    expect(localStorage.getItem("radar_token")).toBe("jeton-de-session");
    expect(host.textContent).toMatch(/session distante encore active/i);
    expect(host.textContent).not.toContain("Se connecter");

    logoutBehavior = "ok";
    await act(async () => { findButton("Réessayer").click(); });
    await flush();
    await waitForText("Se connecter");
    expect(logoutCalls).toBe(2);
    expect(localStorage.getItem("radar_token")).toBeNull();
  }, 15_000);

  it("sur 401 de la révocation, considère la session déjà invalide", async () => {
    await mount("#/today", false, "unauthorized");
    await act(async () => { findButton("Déconnexion").click(); });
    await flush();
    await waitForText("Se connecter");

    expect(logoutCalls).toBe(1);
    expect(localStorage.getItem("radar_token")).toBeNull();
    expect(host.textContent).not.toMatch(/session distante encore active/i);
  }, 15_000);

  it("après échec, la déconnexion locale explicite prévient que la session distante reste active", async () => {
    await mount("#/today", false, "network");
    await act(async () => { findButton("Déconnexion").click(); });
    await flush();
    expect(localStorage.getItem("radar_token")).toBe("jeton-de-session");

    await act(async () => { findButton("Se déconnecter quand même").click(); });
    await waitForText("Se connecter");
    expect(localStorage.getItem("radar_token")).toBeNull();
    expect(host.textContent).toMatch(/session distante encore active/i);
  }, 15_000);
});
