// @vitest-environment jsdom
/**
 * Test de rendu de l'écran Couverture, à partir d'une fausse réponse
 * GET /api/couverture. Aucune API, aucun réseau : la fixture seule pilote le
 * chiffre, les barres de motifs, les deux décompositions et la date de calcul.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import CouvertureView, {
  trierDepartements,
  trierParMois,
  type CouvertureProps,
} from "../src/components/CouvertureView";
import type { CouvertureResponse } from "../src/api";
import { parseHash, toHash } from "../src/url-state";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const fakeResponse: CouvertureResponse = {
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
  parMois: [
    { mois: "2026-10", vus: 17, total: 26, taux: 65.4 },
    { mois: "2026-09", vus: 10, total: 16, taux: 62.5 },
  ],
  stale: false,
};

async function mount(props: CouvertureProps): Promise<{ host: HTMLDivElement; root: Root }> {
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
  it("affiche le chiffre, la date de calcul et chaque décomposition de la fausse réponse", async () => {
    const { host, root } = await mount({ data: fakeResponse, loading: false, error: null });
    try {
      expect(host.querySelector("#coverage-title")?.textContent).toBe("Couverture");
      expect(host.querySelector(".coverage__hero-number")?.textContent).toBe("64.3%");
      expect(host.textContent).toContain("27 sur 42 incidents vus");
      expect(host.textContent).toContain("Fenêtre de mesure 2026-11-01T00:00:00Z");

      const calculated = host.querySelector(".coverage__provenance time");
      expect(calculated?.getAttribute("datetime")).toBe("2026-11-15T09:30:00Z");
      expect(calculated?.textContent).toBe("2026-11-15T09:30:00Z");
      expect(host.textContent).toContain("Correspond à la référence enregistrée");

      const motifSection = host.querySelector('[aria-labelledby="coverage-motifs"]')!;
      const bars = motifSection.querySelectorAll(".coverage__bar");
      expect(bars).toHaveLength(4);
      expect(motifSection.textContent).toContain("Vu");
      expect(motifSection.textContent).toContain("Non admis comme cyber");
      expect(motifSection.textContent).toContain("Non rattaché à une organisation");
      expect(motifSection.textContent).toContain("Hors fenêtre de mesure");
      const widths = [...motifSection.querySelectorAll<HTMLElement>(".coverage__bar-fill")]
        .map((fill) => fill.style.width);
      expect(widths).toEqual(["64.3%", "14.3%", "14.3%", "7.1%"]);

      const tables = host.querySelectorAll("table.coverage__table");
      expect(tables).toHaveLength(1);
      const departmentRows = tables[0].querySelectorAll("tbody tr");
      expect(departmentRows).toHaveLength(3);
      expect(departmentRows[0].textContent).toContain("33");
      expect(departmentRows[0].textContent).toContain("66.7 %");
      expect(departmentRows[2].textContent).toContain("non renseigné");

      const sectorSection = host.querySelector('[aria-labelledby="coverage-secteurs"]')!;
      const sectorRows = sectorSection.querySelectorAll(".coverage__breakdown-row");
      expect(sectorRows).toHaveLength(2);
      expect(sectorRows[0].textContent).toContain("sante");
      expect(sectorRows[0].textContent).toContain("71.4 %");

      const months = [...host.querySelectorAll(".coverage__month-label")]
        .map((node) => node.textContent);
      expect(months).toEqual(["2026-09", "2026-10"]);

      expect(host.textContent).toContain(fakeResponse.hashCorpus);
    } finally {
      await unmount(host, root);
    }
  });

  it("affiche les états chargement, erreur et vide sans inventer de chiffre", async () => {
    const loading = await mount({ data: null, loading: true, error: null });
    try {
      expect(loading.host.querySelector('[role="status"]')?.textContent)
        .toContain("Chargement de la couverture");
      expect(loading.host.querySelector(".coverage__hero-number")).toBeNull();
    } finally {
      await unmount(loading.host, loading.root);
    }

    const errored = await mount({ data: null, loading: false, error: "API 500" });
    try {
      expect(errored.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Couverture indisponible : API 500");
    } finally {
      await unmount(errored.host, errored.root);
    }

    const empty = await mount({ data: null, loading: false, error: null });
    try {
      const placeholder = empty.host.querySelector(".coverage__placeholder");
      expect(placeholder?.getAttribute("aria-label")).toBe("Aucun chiffre de couverture disponible");
      expect(placeholder?.textContent).toBe("—");
      expect(empty.host.textContent).not.toContain("%");
    } finally {
      await unmount(empty.host, empty.root);
    }
  });

  it("avertit quand le chiffre n'est pas publiable, et seulement dans ce cas", async () => {
    const stale = await mount({ data: { ...fakeResponse, stale: true }, loading: false, error: null });
    try {
      expect(stale.host.querySelector(".coverage__warning")?.getAttribute("role")).toBe("alert");
      expect(stale.host.textContent).toContain("Non publiable");
      expect(stale.host.textContent).toContain("Ne pas citer ce chiffre");
      expect(stale.host.textContent).toContain("Périmé — non publiable");
    } finally {
      await unmount(stale.host, stale.root);
    }

    const fresh = await mount({ data: { ...fakeResponse, stale: false }, loading: false, error: null });
    try {
      expect(fresh.host.querySelector(".coverage__warning")).toBeNull();
      expect(fresh.host.textContent).toContain("Correspond à la référence enregistrée");
    } finally {
      await unmount(fresh.host, fresh.root);
    }
  });

  it("trie le tableau au clic, dans les deux sens, sans toucher à la réponse", async () => {
    const avant = JSON.stringify(fakeResponse.parDepartement);
    const { host, root } = await mount({ data: fakeResponse, loading: false, error: null });
    const lignes = () => [...host.querySelectorAll(".coverage__table tbody th")]
      .map((node) => node.textContent);
    const bouton = (libelle: string) => [...host.querySelectorAll<HTMLButtonElement>(".coverage__sort")]
      .find((element) => element.textContent?.includes(libelle))!;
    try {
      // Tri initial par nombre d'incidents, décroissant.
      expect(lignes()[0]).toBe("33");

      const boutonTaux = bouton("Taux de couverture");
      await act(async () => { boutonTaux.click(); });
      expect(lignes()[0]).toBe("33");
      expect(boutonTaux.closest("th")?.getAttribute("aria-sort")).toBe("descending");

      await act(async () => { boutonTaux.click(); });
      expect(lignes()[0]).toBe("non renseigné");
      expect(boutonTaux.closest("th")?.getAttribute("aria-sort")).toBe("ascending");

      const boutonDept = bouton("Département");
      await act(async () => { boutonDept.click(); });
      expect(lignes()).toEqual(["33", "86", "non renseigné"]);
      expect(JSON.stringify(fakeResponse.parDepartement)).toBe(avant);
    } finally {
      await unmount(host, root);
    }
  });

  it("ne publie aucun taux quand la mesure est vide", async () => {
    const { host, root } = await mount({
      data: {
        ...fakeResponse,
        global: { vus: 0, total: 0, taux: 0 },
        parMotif: [],
        parDepartement: [],
        parSecteur: [],
        parMois: [],
      },
      loading: false,
      error: null,
    });
    try {
      expect(host.textContent).toContain("Aucun incident dans la fenêtre de mesure");
      expect(host.textContent).toContain("Aucune donnée départementale publiée");
      expect(host.textContent).toContain("Aucune série mensuelle publiée");
      expect(host.querySelector(".coverage__hero-number")?.textContent).toBe("—%");
    } finally {
      await unmount(host, root);
    }
  });

  it("départage les taux égaux par département et range les mois", () => {
    const lignes = [
      { departement: "B", vus: 1, total: 2, taux: 50 },
      { departement: "A", vus: 1, total: 2, taux: 50 },
      { departement: "C", vus: 1, total: 5, taux: 20 },
    ];
    expect(trierDepartements(lignes, "taux", "desc").map((l) => l.departement))
      .toEqual(["A", "B", "C"]);
    expect(trierDepartements(lignes, "taux", "asc").map((l) => l.departement))
      .toEqual(["C", "A", "B"]);
    expect(lignes[0].departement).toBe("B"); // la fonction ne mute pas la réponse
    expect(trierParMois(fakeResponse.parMois).map((l) => l.mois))
      .toEqual(["2026-09", "2026-10"]);
  });

  it("expose Couverture et Corpus comme routes partageables", () => {
    expect(parseHash("#/coverage").view).toBe("coverage");
    expect(parseHash("#/corpus").view).toBe("corpus");
    // Un ancien lien partagé `#/couverture` ouvre toujours l'écran Couverture.
    expect(parseHash("#/couverture").view).toBe("coverage");
    expect(toHash({ ...parseHash("#/coverage"), view: "coverage" })).toBe("#/coverage");
    expect(toHash({ ...parseHash("#/corpus"), view: "corpus" })).toBe("#/corpus");
  });
});
