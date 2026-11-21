// @vitest-environment jsdom
/**
 * Écran Coverage — test du rendu avec une réponse factice.
 *
 * Les chiffres ci-dessous sont un jeu de test cohérent (les motifs, les
 * départements, les secteurs et les mois totalisent le même dénominateur).
 * Le but n'est pas de rejouer la mesure mais de prouver que l'écran affiche
 * exactement ce que l'API fournit, y compris l'avertissement de non-
 * publication et le tri du tableau sans modifier les données reçues.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CouvertureResponse } from "../src/api";
import CouvertureView, { trierDepartements, trierParMois } from "../src/components/CouvertureView";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const reponse: CouvertureResponse = {
  dateCalcul: "2026-11-15",
  hashCorpus: "a6634b37c9d5e1f4a2b6078d90e3f1c2547689abcdef0123456789d995",
  fenetre: { debut: "2025-11-01", fin: "2026-10-31" },
  global: { vus: 28, total: 42, taux: 66.7 },
  parMotif: [
    { motif: "vu", incidents: 28, part: 66.7 },
    { motif: "pas_admis", incidents: 0, part: 0 },
    { motif: "pas_rattache", incidents: 14, part: 33.3 },
  ],
  parDepartement: [
    { departement: "Gironde", vus: 18, total: 24, taux: 75 },
    { departement: "Charente-Maritime", vus: 2, total: 10, taux: 20 },
    { departement: "Landes", vus: 8, total: 8, taux: 100 },
  ],
  parSecteur: [
    { secteur: "collectivite", vus: 16, total: 22, taux: 72.7 },
    { secteur: "entreprise", vus: 12, total: 20, taux: 60 },
  ],
  // Ordre volontairement non chronologique : l'écran doit trier les mois.
  parMois: [
    { mois: "2026-04", vus: 5, total: 10, taux: 50 },
    { mois: "2026-03", vus: 3, total: 4, taux: 75 },
  ],
  stale: true,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function rendre(props: Partial<React.ComponentProps<typeof CouvertureView>> = {}) {
  act(() => {
    root.render(<CouvertureView data={reponse} loading={false} error={null} {...props} />);
  });
}

function textes(selecteur: string): string[] {
  return [...container.querySelectorAll(selecteur)].map((element) => element.textContent?.trim() ?? "");
}

describe("CouvertureView", () => {
  it("affiche le chiffre, ses décompositions, l'évolution et la provenance", () => {
    rendre();
    const texte = container.textContent ?? "";

    expect(texte).toContain("66.7");
    expect(texte).toContain("28 of 42");
    expect(texte).toContain("Seen");
    expect(texte).toContain("Not linked to an organisation");
    expect(texte).toContain("By department");
    expect(texte).toContain("Gironde");
    expect(texte).toContain("By entity type");
    expect(texte).toContain("collectivite");
    expect(texte).toContain("Monthly evolution");
    expect(texte).toContain(reponse.hashCorpus);
    expect(texte).toContain("2026-11-15");
    expect(texte).toContain("2025-11-01");
    expect(texte).toContain("2026-10-31");

    expect(textes(".coverage__month-label")).toEqual(["2026-03", "2026-04"]);
    // La barre traduit la part annoncée, elle ne la remplace pas.
    expect((container.querySelector(".coverage__bar-fill") as HTMLElement).style.width).toBe("66.7%");
    expect(container.querySelector("time[datetime='2026-11-15']")).not.toBeNull();
  });

  it("avertit quand le chiffre n'est pas publiable, et seulement dans ce cas", () => {
    rendre();
    expect(container.querySelector(".coverage__warning")?.getAttribute("role")).toBe("alert");
    expect(container.textContent).toContain("Not publishable");
    expect(container.textContent).toContain("Do not quote this figure");

    rendre({ data: { ...reponse, stale: false } });
    expect(container.querySelector(".coverage__warning")).toBeNull();
    expect(container.textContent).toContain("Matches the recorded reference");
  });

  it("trie le tableau au clic, dans les deux sens, sans toucher à la réponse", () => {
    rendre();
    const avant = JSON.stringify(reponse.parDepartement);
    const lignes = () => textes(".coverage__table tbody th");
    expect(lignes()[0]).toBe("Gironde"); // tri initial par nombre d'incidents

    const boutonTaux = [...container.querySelectorAll(".coverage__sort")]
      .find((element) => element.textContent?.includes("Coverage rate")) as HTMLButtonElement;
    act(() => boutonTaux.click());
    expect(lignes()[0]).toBe("Landes");
    expect(boutonTaux.closest("th")?.getAttribute("aria-sort")).toBe("descending");

    act(() => boutonTaux.click());
    expect(lignes()[0]).toBe("Charente-Maritime");
    expect(boutonTaux.closest("th")?.getAttribute("aria-sort")).toBe("ascending");

    const boutonDept = [...container.querySelectorAll(".coverage__sort")]
      .find((element) => element.textContent?.includes("Department")) as HTMLButtonElement;
    act(() => boutonDept.click());
    expect(lignes()).toEqual(["Charente-Maritime", "Gironde", "Landes"]);
    expect(JSON.stringify(reponse.parDepartement)).toBe(avant);
  });

  it("n'invente aucun chiffre en chargement, en erreur ou sans mesure", () => {
    rendre({ data: null, loading: true });
    expect(container.textContent).toContain("Loading coverage…");
    expect(container.textContent).not.toContain("66.7");
    expect(textes(".coverage__placeholder")).toEqual(["—"]);

    rendre({ data: null, loading: false, error: "couverture → 500" });
    expect(container.querySelector("[role='alert']")?.textContent).toContain("couverture → 500");

    rendre({
      data: {
        ...reponse,
        global: { vus: 0, total: 0, taux: 0 },
        parMotif: [],
        parDepartement: [],
        parSecteur: [],
        parMois: [],
      },
    });
    expect(container.textContent).toContain("No incident in the measurement window");
    expect(container.textContent).toContain("No department data published");
    expect(container.textContent).toContain("No monthly series published");
    expect(container.querySelector(".coverage__hero-number")?.textContent).toBe("—%");
  });
});

describe("tris de la couverture", () => {
  it("départage les taux égaux par département et respecte le sens", () => {
    const lignes = [
      { departement: "B", vus: 1, total: 2, taux: 50 },
      { departement: "A", vus: 1, total: 2, taux: 50 },
      { departement: "C", vus: 1, total: 5, taux: 20 },
    ];
    expect(trierDepartements(lignes, "taux", "desc").map((l) => l.departement)).toEqual(["A", "B", "C"]);
    expect(trierDepartements(lignes, "taux", "asc").map((l) => l.departement)).toEqual(["C", "A", "B"]);
    expect(lignes[0].departement).toBe("B"); // la fonction ne mute pas la réponse
  });

  it("range les mois du plus ancien au plus récent", () => {
    expect(trierParMois(reponse.parMois).map((l) => l.mois)).toEqual(["2026-03", "2026-04"]);
  });
});
