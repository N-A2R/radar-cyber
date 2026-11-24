// @vitest-environment jsdom
/**
 * Flux direct : le jeton ne doit jamais apparaître dans l'URL du SSE (cookie
 * httpOnly envoyé par EventSource), et une nouvelle alerte est annoncée une
 * seule fois par la région live dédiée d'Astryx — pas par le Banner.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LiveAlerts, { connectLiveAlerts } from "../src/components/LiveAlerts";
import type { LiveAlert } from "../src/api";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, ((raw: MessageEvent) => void)[]>();

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
  close(): void { this.closed = true; }
}

function alerte(id: number): LiveAlert {
  return {
    id, rule_id: "test", title: `Alerte ${id}`, severity: 4, status: "open",
    event_id: null, indicator_id: null, org_id: null, scope: "organization_incident",
    created_at: "2026-11-24T10:00:00Z",
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  localStorage.setItem("radar_token", "secret-de-session");
  // Astryx pousse le texte de l'annonce dans la frame suivante.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("flux direct et annonces", () => {
  it("souscrit /api/stream sans jeton dans l'URL", () => {
    const recus: LiveAlert[] = [];
    const handle = connectLiveAlerts({ onAlert: (a) => { recus.push(a); } });
    const stream = FakeEventSource.instances[0]!;
    expect(stream.url).toBe("/api/stream");
    expect(stream.url).not.toContain("secret-de-session");
    stream.emit("alert", JSON.stringify(alerte(7)));
    expect(recus).toEqual([alerte(7)]);
    handle.close();
    expect(stream.closed).toBe(true);
  });

  it("annonce la nouvelle alerte une seule fois, hors du Banner", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | undefined;
    const rendre = async (alerts: LiveAlert[]) => {
      await act(async () => {
        if (!root) root = createRoot(host);
        root.render(
          <LiveAlerts
            alerts={alerts}
            unseen={alerts.length}
            soundOn={false}
            onToggleSound={() => {}}
            onOpenAlerts={() => {}}
            onDismiss={() => {}}
          />,
        );
      });
    };
    try {
      await rendre([]);
      await rendre([alerte(7)]);
      await rendre([alerte(8), alerte(7)]);

      const region = document.querySelector<HTMLElement>('[data-astryx-live-region="polite"]');
      expect(region?.textContent).toBe("Alerte de sévérité 4 : Alerte 8");
      expect(document.querySelectorAll('[data-astryx-live-region="polite"]')).toHaveLength(1);
      expect(region?.textContent?.match(/Alerte 8/g)).toHaveLength(1);
      expect(host.querySelector('[data-testid="live-alerts"]')?.getAttribute("aria-live")).toBeNull();
    } finally {
      await act(async () => { root?.unmount(); });
      host.remove();
    }
  });
});
