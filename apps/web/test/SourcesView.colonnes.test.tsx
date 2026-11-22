// @vitest-environment jsdom
/**
 * Le registre Sources doit garder ses trois structures alignées : le
 * `<colgroup>`, le `<thead>` et chaque ligne du `<tbody>`. Un en-tête manquant
 * (ou une cellule ajoutée) décale toutes les colonnes d'un cran et fait
 * imprimer « rendement », « motif de rejet », « unicité » les uns sur les
 * autres — c'est exactement ce qui est arrivé quand « état » n'était pas dans
 * `COLUMNS` alors que le corps rendait sa pastille.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import SourcesView from "../src/components/SourcesView";
import type { Source } from "../src/api";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const base: Source = {
  id: "s0",
  name: "Source neutre",
  family: "cti",
  url: "https://example.invalid",
  kind: "narrative",
  format: "rss",
  enabled: true,
  intervalSec: 3600,
  lastOkAt: null,
  lastErrorAt: null,
  lastError: null,
  itemsTotal: null,
  lastItems: null,
  ok: false,
  disabledAt: null,
  disabledReason: null,
  entrees: null,
  rejets: null,
  evenements30j: 0,
  evenementsTotal: 0,
  dernierRun: null,
  dernierRunStatut: null,
  rendement: null,
  motifs: null,
  motifDominant: null,
};

/** Un jeu qui couvre les trois états et les colonnes mesurées. */
const sources: Source[] = [
  { ...base, id: "ok", name: "Source ok", lastOkAt: "2026-11-21T10:00:00Z", lastEventAt: "2026-11-21T11:00:00Z", enabled: true },
  { ...base, id: "erreur", name: "Source en erreur", lastErrorAt: "2026-11-20T10:00:00Z", enabled: true },
  { ...base, id: "muette", name: "Source jamais collectée", enabled: false, disabledReason: "hors ligne" },
];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(<SourcesView sources={sources} loading={false} error={null} />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("SourcesView — colonnes", () => {
  it("aligne colgroup, en-têtes et cellules sur le même nombre", () => {
    const entetes = host.querySelectorAll("thead th").length;
    const cols = host.querySelectorAll("colgroup col").length;
    expect(cols).toBe(entetes);
    expect(entetes).toBeGreaterThan(0);

    for (const ligne of host.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
      // Une ligne peut être l'état vide (colSpan) ; on ne compare que les
      // lignes de données, qui portent un en-tête de ligne.
      if (ligne.querySelector("th[scope='row']") === null) continue;
      expect(ligne.children.length, `ligne « ${ligne.querySelector("th")?.textContent} »`).toBe(entetes);
    }
  });

  it("nomme chaque colonne, y compris « état », dans l'ordre du corps", () => {
    const libelles = [...host.querySelectorAll("thead th")].map((th) => th.textContent?.replace(/[↑↓]/g, "").trim());
    expect(libelles).toEqual([
      "source",
      "famille",
      "état",
      "dernière production",
      "dernier échec",
      "lues 30 j",
      "évén. 30 j",
      "rendement",
      "motif de rejet",
      "unicité",
      "action",
    ]);

    const cellules = [...host.querySelectorAll<HTMLTableRowElement>("tbody tr")[0].children].map(
      (c, index) =>
        [...c.classList]
          .find((classe) => classe.startsWith("sources-table__cell--"))
          ?.replace("sources-table__cell--", "") ?? (index === 0 ? "name" : "?"),
    );
    expect(cellules).toEqual([
      "name",
      "family",
      "status",
      "lastProduction",
      "lastErrorAt",
      "entrees",
      "evenements30j",
      "rendement",
      "unicite",
      "motif",
      "action",
    ]);
  });

  it("marque les cellules secondaires pour que les @container puissent les masquer", () => {
    const rang = host.querySelector<HTMLTableRowElement>("tbody tr")!;
    for (const cle of ["motif", "unicite", "action", "status", "rendement"]) {
      expect(rang.querySelector(`.sources-table__cell--${cle}`), cle).not.toBeNull();
    }
  });
});

describe("sources.css — contrat de non-débordement", () => {
  const css = readFileSync(resolve(process.cwd(), "src/components/sources.css"), "utf8");

  it("déclare la vue comme conteneur de taille (sinon les @container sont morts)", () => {
    const bloc = css.slice(css.indexOf(".sources-view {"), css.indexOf("}", css.indexOf(".sources-view {")));
    expect(bloc).toContain("container-type: inline-size");
    expect(css).toContain("@container sources (max-width: 1099px)");
    expect(css).toContain("@container sources (max-width: 879px)");
  });

  it("n'impose plus de largeur minimale au tableau", () => {
    const bloc = css.slice(css.indexOf(".sources-table {"), css.indexOf("}", css.indexOf(".sources-table {")));
    expect(bloc).toContain("min-width: 0");
    expect(bloc).not.toContain("900px");
  });

  it("masque les colonnes secondaires dans le premier palier", () => {
    const palier = css.slice(css.indexOf("@container sources (max-width: 1099px)"));
    for (const cle of ["motif", "unicite", "action"]) {
      expect(palier).toContain(`.sources-table__cell--${cle}`);
      expect(palier).toContain(`.sources-table__col--${cle}`);
    }
  });
});
