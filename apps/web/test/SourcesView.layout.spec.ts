import { expect, test } from "@playwright/test";

/**
 * Layout réel du registre Sources : c'est le seul endroit où `scrollWidth`
 * veut dire quelque chose (jsdom ne calcule pas de mise en page). Le test
 * rejoue l'API sans serveur, injecte un jeton et mesure aux trois largeurs de
 * la recette. Il échoue si :
 *   - `.sources-view` n'est plus un conteneur de taille (les `@container`
 *     deviennent alors des règles mortes et les colonnes secondaires
 *     débordent) ;
 *   - le conteneur défilant déborde horizontalement ;
 *   - le corps rend une cellule de plus que l'en-tête.
 *
 * `PLAYWRIGHT_BASE_URL` est lu une seule fois, dans playwright.config.ts :
 * la fixture `baseURL` porte l'origine réellement visitée par les specs.
 */
const NB_SOURCES = 2506;

function source(index: number) {
  return {
    id: `source-${index}`,
    name: `Source ${String(index).padStart(4, "0")}`,
    family: ["cti", "presse", "ransomware", "officiel"][index % 4]!,
    url: "https://example.invalid",
    kind: "narrative",
    format: "rss",
    enabled: true,
    intervalSec: 3600,
    lastOkAt: null,
    lastEventAt: null,
    lastErrorAt: index % 7 === 0 ? "2026-11-20T10:00:00.000Z" : null,
    lastError: null,
    itemsTotal: null,
    lastItems: null,
    ok: false,
    disabledAt: null,
    disabledReason: null,
    entrees: index % 3 === 0 ? null : index * 2,
    rejets: null,
    evenements30j: index % 5,
    evenementsTotal: index,
    dernierRun: null,
    dernierRunStatut: null,
    rendement: index % 3 === 0 ? null : 0.2,
    motifs: null,
    motifDominant: index % 9 === 0 ? "hors sujet" : null,
    faits: index % 3 === 0 ? null : 10,
    faitsUniques: index % 3 === 0 ? null : 2,
    primeurs: null,
  };
}

const SOURCES = Array.from({ length: NB_SOURCES }, (_, i) => source(i));

function reponseApi(url: URL): unknown {
  switch (url.pathname) {
    case "/api/sources":
      return SOURCES;
    case "/api/orgs":
      return [];
    case "/api/events":
      return [];
    case "/api/graph":
    case "/api/graph/temporal":
      return { nodes: [], links: [] };
    case "/api/flows":
      return { arcs: [] };
    case "/api/na/overview":
      return { depts: [], derniereCollecte: null, total: { orgs: 0, orgsAvecEvenement: 0, evenements: 0, deptsSansEvenement: [] } };
    case "/api/stats":
      return { sources: { total: NB_SOURCES, active: NB_SOURCES, ok: 0, err: 0 } };
    default:
      return {};
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("radar_token", "jeton-de-test");
    } catch {
      // stockage indisponible : le test échouera sur l'écran de connexion
    }
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/stream") {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(reponseApi(url)),
    });
  });
});

for (const largeur of [1280, 1024, 900]) {
  test(`aucun débordement horizontal et en-têtes alignés à ${largeur} px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 880 });
    await page.goto("/#/sources");
    await page.locator(".sources-table tbody th[scope='row']").first().waitFor({ state: "visible" });

    const mesure = await page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>(".sources-view__scroll")!;
      const vue = document.querySelector<HTMLElement>(".sources-view")!;
      const premiere = document.querySelector<HTMLTableRowElement>(".sources-table tbody tr")!;
      return {
        debordement: scroll.scrollWidth - scroll.clientWidth,
        pageDeborde: document.documentElement.scrollWidth > window.innerWidth,
        containerType: getComputedStyle(vue).containerType,
        entetes: document.querySelectorAll(".sources-table thead th").length,
        cellules: premiere.children.length,
      };
    });

    expect(mesure.containerType, "la vue doit être un conteneur de taille").toBe("inline-size");
    expect(mesure.debordement, `débordement du registre à ${largeur} px`).toBe(0);
    expect(mesure.pageDeborde, `page élargie à ${largeur} px`).toBe(false);
    expect(mesure.cellules, `en-têtes (${mesure.entetes}) et cellules`).toBe(mesure.entetes);
  });
}
