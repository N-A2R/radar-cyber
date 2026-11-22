// @vitest-environment jsdom
/**
 * Alertes — tests unitaires du flux SSE et de l'acquittement.
 *
 * Deux faits observables : (1) un message `event: alert` du serveur alimente
 * le bandeau, sans doublon ni charge utile invalide ; (2) cliquer
 * « Acquitter » POST sur /alerts/:id/ack, relit la file et bascule l'état
 * de la ligne. Aucun réseau : fetch et EventSource sont remplacés.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AlertsView, { alertKind, readEvidence } from "../src/components/AlertsView";
import LiveAlerts, { addLiveAlert, connectLiveAlerts, formatAgo } from "../src/components/LiveAlerts";
import type { Alert, LiveAlert } from "../src/api";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

type Call = { url: string; method: string };

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function makeAlert(id: number, status: Alert["status"] = "open"): Alert {
  return {
    id,
    rule_id: "incident-confirme",
    title: `Confirmed incident #${id}`,
    severity: 4,
    status,
    event_id: 1000 + id,
    indicator_id: null,
    org_id: 42,
    evidence: null,
    scope: "organization_incident",
    created_at: "2026-11-21T10:00:00Z",
    updated_at: "2026-11-21T10:00:00Z",
    acked_at: null,
    acked_by: null,
    event_title: "Compromised host",
    event_family: "cti",
    indicator_type: null,
    indicator_value: null,
    org_name: "Acme",
  };
}

function liveAlert(id: number, title = `Live alert ${id}`): LiveAlert {
  return {
    id,
    rule_id: "rupture:rafale",
    title,
    severity: 5,
    status: "open",
    event_id: null,
    indicator_id: null,
    org_id: 42,
    scope: "rupture",
    created_at: "2026-11-21T10:00:00Z",
  };
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  readonly listeners = new Map<string, ((raw: MessageEvent) => void)[]>();
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (raw: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }

  emit(type: string, data: string): void {
    for (const cb of this.listeners.get(type) ?? []) cb({ data } as MessageEvent);
  }

  close(): void {
    this.closed = true;
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

describe("flux SSE des alertes", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reçoit les alertes, ignore les charges invalides, déduplique et se ferme", () => {
    const received: LiveAlert[] = [];
    const connection: boolean[] = [];
    const handle = connectLiveAlerts({
      token: "tok en",
      onAlert: (alert) => { received.push(alert); },
      onConnection: (on) => { connection.push(on); },
    });

    const stream = FakeEventSource.instances[0]!;
    expect(stream.url).toBe("/api/stream?token=tok%20en");

    stream.onopen?.();
    stream.emit("alert", JSON.stringify(liveAlert(7)));
    expect(received).toEqual([liveAlert(7)]);

    stream.emit("alert", "not-json");
    stream.emit("alert", JSON.stringify({ id: "7", title: "bad", severity: 5 }));
    stream.emit("alert", JSON.stringify({ id: 8, title: "ok", severity: "high" }));
    expect(received).toHaveLength(1);

    stream.emit("alert", JSON.stringify({ ...liveAlert(9), status: undefined, created_at: undefined }));
    expect(received[1]).toMatchObject({ id: 9, status: "open", created_at: "" });

    stream.onerror?.();
    stream.emit("alert", JSON.stringify(liveAlert(10)));
    expect(connection.filter((on) => !on)).toHaveLength(1);
    expect(connection.at(-1)).toBe(true);

    let feedMessages = 0;
    handle.addEventListener("new", () => { feedMessages += 1; });
    stream.emit("new", "{}");
    expect(feedMessages).toBe(1);

    handle.close();
    expect(stream.closed).toBe(true);
    expect(formatAgo("2026-11-21T09:59:30Z", Date.parse("2026-11-21T10:00:00Z"))).toBe("à l'instant");
    expect(formatAgo("2026-11-21T09:57:00Z", Date.parse("2026-11-21T10:00:00Z"))).toBe("il y a 3 min");
    expect(formatAgo("2026-11-21T08:00:00Z", Date.parse("2026-11-21T10:00:00Z"))).toBe("il y a 2 h");
    expect(formatAgo("2026-11-20T10:00:00Z", Date.parse("2026-11-21T10:00:00Z"))).toBe("il y a 1 j");
    expect(formatAgo("")).toBe("—");
  });

  it("affiche la dernière alerte reçue dans le bandeau", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | undefined;
    try {
      await act(async () => {
        root = createRoot(host);
        root.render(
          <LiveAlerts
            alerts={[liveAlert(7, "Ransomware wave"), liveAlert(6, "Older alert")]}
            unseen={3}
            soundOn={false}
            onToggleSound={() => {}}
            onOpenAlerts={() => {}}
            onDismiss={() => {}}
          />,
        );
      });
      expect(host.querySelector(".live-alerts__title")?.textContent).toBe("Ransomware wave");
      expect(host.querySelector(".live-alerts__more")?.textContent).toBe("+2");
      expect(host.textContent).toContain("Son coupé");
      expect(host.textContent).not.toContain("aucune");
    } finally {
      await act(async () => { root?.unmount(); });
      host.remove();
    }
  });
});

describe("acquittement des alertes", () => {
  let calls: Call[];
  let alerts: Alert[];
  let unauthorized: number;
  let openedEvents: string[];

  beforeEach(() => {
    calls = [];
    alerts = [makeAlert(11), makeAlert(12)];
    unauthorized = 0;
    openedEvents = [];
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (url.startsWith("/api/alerts/stats")) {
        return jsonResponse([
          { status: "open", severity: 4, count: String(alerts.filter((a) => a.status === "open").length) },
          { status: "ack", severity: 4, count: String(alerts.filter((a) => a.status === "ack").length) },
        ]);
      }
      const ack = url.match(/^\/api\/alerts\/(\d+)\/ack$/);
      if (ack) {
        alerts = alerts.map((a) => (a.id === Number(ack[1]) ? { ...a, status: "ack" } : a));
        return jsonResponse({ ok: true });
      }
      if (/^\/api\/alerts\/\d+$/.test(url)) {
        const id = Number(url.split("/").pop());
        return jsonResponse({
          alert: { id, rule_id: "incident-confirme", title: `Confirmed incident #${id}`, severity: 4, status: "open", scope: "organization_incident", created_at: "2026-11-21T10:00:00Z" },
          event: { id: "1011", title: "Compromised host", family: "cti", severity: 4, summary: "Host compromised", observed_at: "2026-11-21T09:00:00Z", source_id: "src-1", confidence: "A2" },
          source: { name: "Source A", url: "https://source.test/report", family: "cti" },
          org: { id: 42, name: "Acme", dept: "33", kind: "company" },
          corroboration: { distinct_sources: 2, sources: [{ name: "Source B", count: "3" }] },
          confidence: null,
          evidence: { motif: "burst", explication: "4 facts in 7 days", score: 1, faits: ["1011", "1012"] },
        });
      }
      if (url.startsWith("/api/alerts?")) return jsonResponse(alerts);
      throw new Error(`appel inattendu : ${url}`);
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("poste l'acquittement, relit la file et montre la preuve de l'alerte", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | undefined;
    try {
      await act(async () => {
        root = createRoot(host);
        root.render(
          <AlertsView
            canWrite
            onUnauthorized={() => { unauthorized += 1; }}
            onOpenEvent={(id) => { openedEvents.push(id); }}
          />,
        );
      });
      await flush();

      const rows = host.querySelectorAll<HTMLElement>(".alerts__item");
      expect(rows).toHaveLength(2);
      expect(host.querySelector(".alerts__totals")?.textContent).toContain("2 ouvertes");
      expect(alertKind(makeAlert(11))).toBe("critical_event");
      expect(alertKind({ rule_id: "rupture:source-muette", scope: "rupture" })).toBe("silent_source");
      expect(readEvidence({ faits: ["1", 2, null] })).toEqual({ faits: ["1", 2] });

      const evidenceButton = rows[0]!.querySelector<HTMLButtonElement>('[data-testid="alert-evidence"]')!;
      await act(async () => { evidenceButton.click(); });
      await flush();
      const detail = host.querySelector('[data-testid="alert-detail"]');
      expect(detail?.textContent).toContain("Base : 4 facts in 7 days");
      expect(detail?.textContent).toContain("Ouvrir le rapport d'origine");
      expect(detail?.querySelector('a[href="https://source.test/report"]')).not.toBeNull();
      expect(detail?.textContent).toContain("Corroboration : 2 source(s)");

      await act(async () => {
        detail?.querySelectorAll("button").forEach((button) => {
          if (button.textContent === "#1011") button.click();
        });
      });
      expect(openedEvents).toEqual(["1011"]);

      const ackButton = [...rows[0]!.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Acquitter")!;
      await act(async () => { ackButton.click(); });
      await flush();

      expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/alerts/11/ack"]);
      expect(calls.filter((c) => c.url.startsWith("/api/alerts?")).length).toBeGreaterThan(1);
      expect(host.querySelector(".alerts__totals")?.textContent).toContain("1 ouverte, 1 acquittée");
      expect(host.querySelector('.alerts__item[data-alert-id="11"] .alerts__state')?.textContent).toBe("acquittée");
      expect(unauthorized).toBe(0);
    } finally {
      await act(async () => { root?.unmount(); });
      host.remove();
    }
  });

  it("signale une erreur d'acquittement sans masquer la liste", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url === "/api/alerts/11/ack") return jsonResponse({ error: "forbidden" }, 403);
      if (url.startsWith("/api/alerts/stats")) return jsonResponse([]);
      if (url.startsWith("/api/alerts?")) return jsonResponse(alerts);
      throw new Error(`appel inattendu : ${url}`);
    }));
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | undefined;
    try {
      await act(async () => {
        root = createRoot(host);
        root.render(
          <AlertsView canWrite onUnauthorized={() => { unauthorized += 1; }} onOpenEvent={() => {}} />,
        );
      });
      await flush();
      const ackButton = [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Acquitter")!;
      await act(async () => { ackButton.click(); });
      await flush();
      expect(host.querySelector('[role="alert"]')?.textContent).toContain("403");
      expect(host.querySelectorAll(".alerts__item")).toHaveLength(2);
      expect(unauthorized).toBe(0);
    } finally {
      await act(async () => { root?.unmount(); });
      host.remove();
    }
  });
});
