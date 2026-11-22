// @vitest-environment jsdom
/**
 * Timeline « Aujourd'hui » — le clic sur une tranche filtre réellement le
 * tableau sur sa plage de deux heures, et l'état actif reste visible par
 * `aria-pressed` (bordure en CSS), pas seulement par une couleur de fond.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TodayView from "../src/components/TodayView";
import type { TodayEvent } from "../src/api";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const REFERENCE = Date.UTC(2026, 10, 21, 15, 37);

function evenement(id: string, titre: string, date: string): TodayEvent {
  return {
    id, titre, famille: "cti", severite: 3, date, dateSource: "observee",
    source: "jeu-test", url: null, orgId: null, organisation: null, dept: null,
  };
}

// 13:05 et 13:59 UTC tombent dans la tranche 12h–14h ; 15:36 dans 14h–16h.
const evenements = [
  evenement("a", "événement de midi", "2026-11-21T13:05:00Z"),
  evenement("b", "événement de 13 h", "2026-11-21T13:59:00Z"),
  evenement("c", "événement de 15 h", "2026-11-21T15:36:00Z"),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <TodayView
        data={{ compteurs: { evenements24h: 3, organisations7j: 0, derniereCollecte: null }, evenements }}
        loading={false} error={null} family={null} dept={null} departements={[]}
        maintenant={REFERENCE}
        onFamily={() => {}} onDept={() => {}} onOpenOrg={() => {}} onOpenEvent={() => {}} />,
    );
  });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

function titres(): string[] {
  return [...container.querySelectorAll(".today__lien-titre")].map((n) => n.textContent ?? "");
}

function bouton(label: string): HTMLButtonElement {
  const b = [...container.querySelectorAll<HTMLButtonElement>(".today__timeline-bouton")]
    .find((n) => n.getAttribute("aria-label")?.startsWith(label));
  if (!b) throw new Error(`tranche ${label} absente`);
  return b;
}

describe("timeline cliquable", () => {
  it("filtre le tableau sur la plage de la tranche puis revient à toute la période", async () => {
    expect(titres()).toHaveLength(3);

    const tranche = bouton("12h");
    expect(tranche.getAttribute("aria-pressed")).toBe("false");
    await act(async () => { tranche.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    expect(tranche.getAttribute("aria-pressed")).toBe("true");
    expect(titres()).toEqual(["événement de 13 h", "événement de midi"]);
    expect(container.querySelector(".today__timeline-filtre")?.textContent).toContain("12h → 14h");

    const reset = container.querySelector<HTMLButtonElement>(".today__timeline-reset");
    expect(reset).not.toBeNull();
    await act(async () => { reset?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    expect(tranche.getAttribute("aria-pressed")).toBe("false");
    expect(titres()).toHaveLength(3);
  });
});
