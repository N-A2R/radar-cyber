// @vitest-environment jsdom
/**
 * Focus des vraies surcouches Astryx (Dialog/Drawer), pas d'un faux <div>.
 *
 * Chaque test vérifie les quatre mêmes faits observables : le panneau est un
 * dialog modal, le focus entre dans le panneau, Tab/Shift+Tab restent bornés,
 * Échap ferme et rend le focus au déclencheur.
 */
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { JournalDecision } from "../src/api";
import JournalList from "../src/components/JournalListe";
import ReviewView from "../src/components/ReviewView";
import { OrgSheetContenu } from "../src/components/OrgSheet";
import Inspector from "../src/components/Inspector";

const hosts: HTMLDivElement[] = [];
const roots: Root[] = [];

beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("EventSource", class { addEventListener() {} close() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(async () => {
  for (const root of roots) {
    await act(async () => { root.unmount(); });
  }
  roots.length = 0;
  for (const host of hosts) host.remove();
  hosts.length = 0;
});

async function mount(ui: ReactNode): Promise<HTMLDivElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(ui); });
  return host;
}

async function settle(ms = 20): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  await act(async () => { await promise; });
}

/** Tab et Shift+Tab aux deux extrémités : le focus ne sort jamais du dialog. */
async function expectTrappedFocus(dialog: HTMLDialogElement): Promise<void> {
  const stops = [...dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
  )];
  expect(stops.length).toBeGreaterThan(0);
  const first = stops[0];
  const last = stops[stops.length - 1];

  await act(async () => { last.focus(); });
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  });
  expect(document.activeElement).toBe(first);

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
  });
  expect(document.activeElement).toBe(last);
  expect(dialog.contains(document.activeElement)).toBe(true);
}

/** Échap via le gestionnaire partagé d'Astryx, puis attente du retour de focus. */
async function pressEscape(host: HTMLElement, opener: HTMLElement): Promise<void> {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  const dialog = host.querySelector<HTMLDialogElement>("dialog[open]");
  if (dialog) {
    // jsdom n'anime pas la sortie : on achève la transition comme le navigateur.
    await act(async () => {
      const event = new Event("transitionend");
      Object.defineProperty(event, "propertyName", { value: "transform" });
      dialog.dispatchEvent(event);
    });
  }
  await settle();
  expect(document.activeElement).toBe(opener);
}

const row: JournalDecision = {
  id: 46, kind: "review.decided", sujet: "quarantine:21",
  acteur: "humain:analyste@radar.local", horodatage: "2026-11-21 14:03:12+00",
  decision: "accepter", indice: "Hôpital de Pessac", raison: "alias verified",
  resume: "accept by analyste", preuve: { decision: "accepter", orgId: 101 },
};

function JournalHarness() {
  const [selected, setSelected] = useState<JournalDecision | null>(null);
  return (
    <JournalList
      rows={[row]} total={1} filters={{}} onFilterChange={() => {}} onReset={() => {}}
      loading={false} error={null} page={1} pageCount={1}
      onPrevious={() => {}} onNext={() => {}}
      selected={selected} onSelect={setSelected} onCloseDetail={() => setSelected(null)}
      onExport={() => {}} exporting={false} exportError={null}
    />
  );
}

function OrgSheetHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Ouvrir la fiche</button>
      {open ? (
        <OrgSheetContenu
          state={{ status: "notfound" }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function InspectorHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Ouvrir l'inspecteur</button>
      {open ? <Inspector eventId={null} orgId={null} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

describe("focus des surcouches Astryx", () => {
  it("ouvre le détail du journal dans un vrai Drawer modal et rend le focus", async () => {
    const host = await mount(<JournalHarness />);
    const trigger = host.querySelector<HTMLButtonElement>("button.journal__open")!;
    await act(async () => { trigger.focus(); trigger.click(); });

    const dialog = host.querySelector<HTMLDialogElement>("dialog[aria-modal='true']")!;
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-label")).toContain("entrée de journal 46");
    expect(dialog.querySelector(".journal__detail-close")).toBeTruthy();
    expect(dialog.querySelector("[data-autofocus]")).toBe(document.activeElement);
    await expectTrappedFocus(dialog);
    await pressEscape(host, trigger);
    expect(host.querySelector("dialog")).toBeNull();
  });

  it("piège et rend le focus dans l'aide clavier de Revue (Dialog)", async () => {
    const host = await mount(<ReviewView server={false} canWrite={false} />);
    const section = host.querySelector<HTMLElement>("section.revue")!;
    await act(async () => {
      section.focus();
      section.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    });

    const dialog = host.querySelector<HTMLDialogElement>("dialog[aria-modal='true']")!;
    expect(dialog).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await expectTrappedFocus(dialog);
    await pressEscape(host, section);
    expect(host.querySelector("dialog[open]")).toBeNull();
  });

  it("piège et rend le focus dans la fiche organisation (Drawer)", async () => {
    const host = await mount(<OrgSheetHarness />);
    const trigger = host.querySelector<HTMLButtonElement>("button")!;
    await act(async () => { trigger.focus(); trigger.click(); });

    const dialog = host.querySelector<HTMLDialogElement>("dialog[aria-modal='true']")!;
    expect(dialog).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await expectTrappedFocus(dialog);
    await pressEscape(host, trigger);
  });

  it("piège et rend le focus dans l'inspecteur (Drawer)", async () => {
    const host = await mount(<InspectorHarness />);
    const trigger = host.querySelector<HTMLButtonElement>("button")!;
    await act(async () => { trigger.focus(); trigger.click(); });

    const dialog = host.querySelector<HTMLDialogElement>("dialog[aria-modal='true']")!;
    expect(dialog).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await expectTrappedFocus(dialog);
    await pressEscape(host, trigger);
  });
});
