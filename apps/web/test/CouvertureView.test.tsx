// @vitest-environment jsdom
/**
 * Rendering test for the coverage screen, using a fake GET /api/couverture
 * response. No API, no network: the fixture alone drives the figure, the
 * reason bars, both breakdown tables and the calculation date.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import CouvertureView from "../src/components/CouvertureView";
import type { CouverturePublique } from "../src/api";
import type { CouvertureViewProps } from "../src/contracts";
import { parseHash, toHash } from "../src/url-state";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const fakeResponse: CouverturePublique = {
  dateCalcul: "2026-11-15T09:30:00Z",
  hashCorpus: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  fenetre: { debut: "2026-11-01T00:00:00Z", fin: "2026-11-10T23:59:59Z" },
  global: { vus: 27, total: 42, taux: 64.3 },
  parMotif: [
    { motif: "vu", incidents: 27, part: 64.3 },
    { motif: "pas_admis", incidents: 6, part: 14.3 },
    { motif: "pas_rattache", incidents: 6, part: 14.3 },
    { motif: "hors_fenetre", incidents: 3, part: 7.1 },
  ],
  parDepartement: [
    { departement: "33", vus: 12, total: 18, taux: 66.7 },
    { departement: "86", vus: 5, total: 9, taux: 55.6 },
    { departement: "non renseigné", vus: 0, total: 1, taux: 0 },
  ],
  parSecteur: [
    { secteur: "sante", vus: 10, total: 14, taux: 71.4 },
    { secteur: "collectivite", vus: 7, total: 12, taux: 58.3 },
  ],
};

async function mount(props: CouvertureViewProps): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(host);
    root.render(<CouvertureView {...props} />);
  });
  return { host, root: root! };
}

async function unmount(host: HTMLDivElement, root: Root): Promise<void> {
  await act(async () => { root.unmount(); });
  host.remove();
}

describe("CouvertureView", () => {
  it("renders the figure, the calculation date and every breakdown from the fake response", async () => {
    const { host, root } = await mount({ data: fakeResponse, loading: false, error: null });
    try {
      expect(host.querySelector("h1")?.textContent).toBe("Coverage");
      expect(host.querySelector(".couverture__figure")?.textContent).toBe("64.3%");
      expect(host.textContent).toContain("27 of 42 incidents in the measurement window");

      const calculated = host.querySelector("time");
      expect(calculated?.getAttribute("datetime")).toBe("2026-11-15T09:30:00Z");
      expect(calculated?.textContent).toBe("2026-11-15 09:30 UTC");
      expect(host.textContent).toContain("Window: 2026-11-01 00:00 UTC");

      const bars = host.querySelectorAll(".couverture__bar");
      expect(bars).toHaveLength(4);
      expect(host.textContent).toContain("Seen");
      expect(host.textContent).toContain("Not admitted");
      expect(host.textContent).toContain("Not linked");
      expect(host.textContent).toContain("Outside the window");
      const widths = [...host.querySelectorAll<HTMLElement>(".couverture__bar-fill")]
        .map((fill) => fill.style.width);
      expect(widths).toEqual(["64.3%", "14.3%", "14.3%", "7.1%"]);

      const tables = host.querySelectorAll("table.couverture__table");
      expect(tables).toHaveLength(2);
      const departmentRows = tables[0].querySelectorAll("tbody tr");
      expect(departmentRows).toHaveLength(3);
      expect(departmentRows[0].textContent).toContain("33");
      expect(departmentRows[0].textContent).toContain("66.7%");
      expect(departmentRows[2].textContent).toContain("non renseigné");
      const sectorRows = tables[1].querySelectorAll("tbody tr");
      expect(sectorRows).toHaveLength(2);
      expect(sectorRows[0].textContent).toContain("sante");
      expect(sectorRows[0].textContent).toContain("71.4%");

      expect(host.textContent).toContain(fakeResponse.hashCorpus);
    } finally {
      await unmount(host, root);
    }
  });

  it("renders loading, error and empty states without inventing a figure", async () => {
    const loading = await mount({ data: null, loading: true, error: null });
    try {
      expect(loading.host.querySelector('[role="status"]')?.textContent)
        .toContain("Loading coverage");
      expect(loading.host.querySelector(".couverture__figure")).toBeNull();
    } finally {
      await unmount(loading.host, loading.root);
    }

    const errored = await mount({ data: null, loading: false, error: "API 500" });
    try {
      expect(errored.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Unable to load coverage: API 500");
    } finally {
      await unmount(errored.host, errored.root);
    }

    const empty = await mount({ data: null, loading: false, error: null });
    try {
      expect(empty.host.textContent).toContain("No coverage measurement available");
    } finally {
      await unmount(empty.host, empty.root);
    }
  });

  it("exposes the coverage view as a shareable hash route", () => {
    expect(parseHash("#/couverture").view).toBe("couverture");
    expect(toHash({ ...parseHash("#/couverture"), view: "couverture" })).toBe("#/couverture");
  });
});
