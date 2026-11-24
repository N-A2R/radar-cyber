// @vitest-environment jsdom
/**
 * Espace Action — faits observables : l'onglet Alertes est le défaut, le lien
 * profond choisit l'onglet, la navigation clavier respecte le motif ARIA, et
 * les callbacks des deux écrans d'origine arrivent intact jusqu'à eux.
 * Les vues enfants sont remplacées par des témoins : aucun réseau ici.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import ActionWorkspace, { type ActionTab, type ActionWorkspaceProps } from "../src/components/ActionWorkspace";
import type { ReviewUrlState } from "../src/url-state";

type AlertProps = {
  canWrite: boolean;
  onUnauthorized: () => void;
  onOpenEvent: (eventId: string) => void;
  refreshSignal?: number;
};
type ReviewProps = {
  canWrite: boolean;
  server: boolean;
  onUnauthorized: () => void;
  onOpenOrg?: (orgId: number) => void;
  urlState?: ReviewUrlState;
  onUrlStateChange?: (next: ReviewUrlState) => void;
};

const alertProps: AlertProps[] = [];
const reviewProps: ReviewProps[] = [];

// React est importé statiquement ; les fabriques ne l'utilisent qu'au rendu.
vi.mock("../src/components/AlertsView", () => ({
  default: (props: AlertProps) => {
    alertProps.push(props);
    return React.createElement(
      "div",
      { "data-testid": "alerts-view" },
      React.createElement("button", {
        type: "button",
        "data-testid": "alert-open-event",
        onClick: () => props.onOpenEvent("evt-1"),
      }, "open event"),
      React.createElement("button", {
        type: "button",
        "data-testid": "alert-unauthorized",
        onClick: () => props.onUnauthorized(),
      }, "unauthorized"),
    );
  },
}));

vi.mock("../src/components/ReviewView", () => ({
  default: (props: ReviewProps) => {
    reviewProps.push(props);
    return React.createElement(
      "div",
      { "data-testid": "review-view" },
      React.createElement("button", {
        type: "button",
        "data-testid": "review-open-org",
        onClick: () => props.onOpenOrg?.(42),
      }, "open org"),
      React.createElement("button", {
        type: "button",
        "data-testid": "review-url-state",
        onClick: () => props.onUrlStateChange?.({ bucket: "chaud", q: "pessac" }),
      }, "update filters"),
    );
  },
}));

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root | undefined;

async function mount(props: ActionWorkspaceProps = {}): Promise<void> {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<ActionWorkspace {...props} />);
  });
}

async function rerender(props: ActionWorkspaceProps): Promise<void> {
  await act(async () => {
    root?.render(<ActionWorkspace {...props} />);
  });
}

function tabs(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function tab(label: string): HTMLButtonElement {
  const found = tabs().find((candidate) => candidate.textContent?.trim() === label);
  expect(found, `onglet "${label}"`).toBeTruthy();
  return found!;
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function press(element: Element, key: string): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

function panel(id: ActionTab): HTMLElement {
  const found = host.querySelector<HTMLElement>(`#action-panel-${id}`);
  expect(found, `panneau "${id}"`).toBeTruthy();
  return found!;
}

beforeEach(() => {
  alertProps.length = 0;
  reviewProps.length = 0;
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = undefined;
  host?.remove();
});

describe("ActionWorkspace", () => {
  it("affiche Alertes par défaut avec la sémantique d'onglets et transmet ses callbacks", async () => {
    const onUnauthorized = vi.fn();
    const onOpenEvent = vi.fn();
    await mount({ canWrite: true, onUnauthorized, onOpenEvent, refreshSignal: 3 });

    expect(tabs().map((item) => item.textContent?.trim())).toEqual(["Alertes", "Revue"]);
    expect(host.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("Action");
    expect(tab("Alertes").getAttribute("aria-selected")).toBe("true");
    expect(tab("Alertes").tabIndex).toBe(0);
    expect(tab("Revue").getAttribute("aria-selected")).toBe("false");
    expect(tab("Revue").tabIndex).toBe(-1);
    expect(tab("Alertes").getAttribute("aria-controls")).toBe(panel("alerts").id);
    expect(panel("alerts").getAttribute("aria-labelledby")).toBe(tab("Alertes").id);
    expect(panel("alerts").hidden).toBe(false);
    expect(panel("review").hidden).toBe(true);
    expect(host.querySelector('[data-testid="alerts-view"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="review-view"]')).toBeNull();

    expect(alertProps).toHaveLength(1);
    expect(alertProps[0].canWrite).toBe(true);
    expect(alertProps[0].refreshSignal).toBe(3);
    await click(host.querySelector('[data-testid="alert-open-event"]')!);
    await click(host.querySelector('[data-testid="alert-unauthorized"]')!);
    expect(onOpenEvent).toHaveBeenCalledWith("evt-1");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("ouvre l'onglet Revue depuis un lien profond et y conserve filtres et callbacks", async () => {
    const onUnauthorized = vi.fn();
    const onOpenOrg = vi.fn();
    const onUrlStateChange = vi.fn() as Mock;
    const urlState: ReviewUrlState = { bucket: "chaud", q: "pessac" };
    await mount({
      initialTab: "revue",
      canWrite: true,
      server: false,
      onUnauthorized,
      onOpenOrg,
      urlState,
      onUrlStateChange,
    });

    expect(tab("Revue").getAttribute("aria-selected")).toBe("true");
    expect(panel("review").hidden).toBe(false);
    expect(panel("alerts").hidden).toBe(true);
    expect(host.querySelector('[data-testid="review-view"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="alerts-view"]')).toBeNull();
    expect(reviewProps).toHaveLength(1);
    expect(reviewProps[0]).toMatchObject({ canWrite: true, server: false, urlState });

    await click(host.querySelector('[data-testid="review-open-org"]')!);
    await click(host.querySelector('[data-testid="review-url-state"]')!);
    expect(onOpenOrg).toHaveBeenCalledWith(42);
    expect(onUrlStateChange).toHaveBeenCalledWith({ bucket: "chaud", q: "pessac" });
  });

  it("change d'onglet au clic et au clavier, et notifie le shell", async () => {
    const onTabChange = vi.fn();
    await mount({ onTabChange });

    await click(tab("Revue"));
    expect(tab("Revue").getAttribute("aria-selected")).toBe("true");
    expect(panel("review").hidden).toBe(false);
    expect(host.querySelector('[data-testid="review-view"]')).toBeTruthy();
    expect(onTabChange).toHaveBeenCalledWith("review");

    await press(tab("Revue"), "ArrowRight");
    expect(tab("Alertes").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("Alertes"));
    expect(panel("alerts").hidden).toBe(false);

    await press(tab("Alertes"), "End");
    expect(tab("Revue").getAttribute("aria-selected")).toBe("true");
    await press(tab("Revue"), "Home");
    expect(tab("Alertes").getAttribute("aria-selected")).toBe("true");
    expect(onTabChange).toHaveBeenCalledTimes(4);
  });

  it("suit un changement de lien profond et ignore une valeur d'onglet inconnue", async () => {
    await mount({ initialTab: "inconnu" as ActionTab });
    expect(tab("Alertes").getAttribute("aria-selected")).toBe("true");

    await rerender({ initialTab: "review" });
    expect(tab("Revue").getAttribute("aria-selected")).toBe("true");

    await rerender({ initialTab: "alertes" });
    expect(tab("Alertes").getAttribute("aria-selected")).toBe("true");
  });
});
