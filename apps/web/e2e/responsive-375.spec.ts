/**
 * Preuve visuelle et métrique des quatre écrans à 375 px.
 *
 * Les réponses API sont simulées : on vérifie la mise en page, pas le backend.
 * Les captures sont écrites dans /tmp/radar-responsive-375 (hors dépôt).
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5180";
const SHOTS = process.env.E2E_SHOTS ?? "/tmp/radar-responsive-375";

const SOURCE_BASE = {
  url: "https://exemple.test",
  kind: "narrative" as const,
  format: "rss",
  enabled: true,
  intervalSec: 3600,
  lastError: null,
  itemsTotal: 100,
  lastItems: 20,
  ok: true,
  disabledAt: null,
  disabledReason: null,
  entrees: 120,
  rejets: 10,
  evenementsTotal: 480,
  dernierRun: "2026-11-21T08:00:00Z",
  dernierRunStatut: "ok",
  rendement: 0.183,
  motifs: { hors_sujet: 8, doublon: 2 },
  motifDominant: "hors_sujet",
  faits: 40,
  faitsUniques: 6,
  primeurs: 3,
};

async function stubApi(page: Page) {
  await page.addInitScript(() => localStorage.setItem("radar_token", "test-token"));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/stream") {
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
      return;
    }
    let body: unknown = [];
    if (path === "/api/orgs/liees") {
      body = { semaine: 7, total: 12, enAttente: 1, examinees: 10, parDepartement: [] };
    } else if (path === "/api/orgs/liees/historique") {
      body = [];
    } else if (path === "/api/today") {
      body = {
        compteurs: { evenements24h: 693, organisations7j: 7, derniereCollecte: "2026-11-21T14:31:57Z" },
        evenements: [
          {
            id: 121517,
            titre: "FBI hacked again ; criminal information database targeted",
            famille: "leaks", severite: 2, date: "2026-11-21 13:37:22+01",
            dateSource: "observee", source: "DataBreaches.net — flux des fuites de données",
            url: "https://databreaches.net/2026/11/21/fbi-hacked-again/",
            orgId: null, organisation: null, dept: null,
          },
          {
            id: 118380,
            titre: "Polynésie française : à bord d’un Falcon 50 de la Marine nationale",
            famille: "cti", severite: 2, date: "2026-11-21 12:00:00+01",
            dateSource: "observee", source: "Sud Ouest (RSS)",
            url: null, orgId: 2123591, organisation: "A BORD ..", dept: "17",
          },
        ],
      };
    } else if (path === "/api/review/queue") {
      body = {
        rows: [
          {
            id: 11, source: "jeu-test", sourceUrl: "https://exemple.test/a", groupe: "lockbit3",
            orgHint: "Commune de Pessac", claimedAt: "2026-11-21T12:00:00Z",
            receivedAt: "2026-11-21T13:00:00Z", tlp: "RED",
            triage: {
              score: 82, bucket: "tiede", suggested: "review",
              reasons: [{ label: "domaine déclaré", weight: 20 }],
            },
            candidates: [{ id: 7, name: "Mairie de Pessac", score: 0.86, via: "domain", city: "Pessac", dept: "33" }],
            rejectRule: null, city: null, dept: null, review: [],
          },
        ],
        total: 1, page: 0, limit: 50, window: 500, truncated: false,
        counts: { pending: 1 }, tookMs: 12,
      };
    } else if (path === "/api/journal/review") {
      body = {
        rows: [
          {
            id: 42, sujet: "quarantine:17", acteur: "humain:analyste@radar.local",
            horodatage: "2026-11-21 14:03:12+00", decision: "accepter",
            indice: "Hôpital de Pessac", raison: "alias vérifié sur le site officiel",
          },
          {
            id: 41, sujet: "quarantine:16", acteur: "moteur:triage",
            horodatage: "2026-11-21 11:20:00+00", decision: "refuser",
            indice: "Groupe fictif", raison: "indice hors périmètre",
          },
        ],
        limite: 100, avant: null,
      };
    } else if (path === "/api/sources") {
      body = [
        {
          ...SOURCE_BASE, id: "cert-fr", name: "CERT-FR — bulletin de sécurité", family: "cert_fr",
          lastOkAt: "2026-11-21T08:00:00Z", lastErrorAt: "2026-11-20T20:00:00Z",
        },
        {
          ...SOURCE_BASE, id: "presse", name: "Presse régionale — flux RSS", family: "presse",
          lastOkAt: "2026-11-21T07:00:00Z", lastErrorAt: null,
          entrees: 40, rejets: 40, evenements30j: 0, rendement: 0,
        },
      ];
    } else if (path === "/api/flows") {
      body = { arcs: [], total: 0, truncated: false };
    } else if (path === "/api/graph") {
      body = { nodes: [], links: [] };
    } else if (path === "/api/stats") {
      body = { orgs: 0, events: 0, indicators: 0, sources: { total: 2, active: 2, ok: 2, err: 0 }, byFamily: [], byAssertion: [] };
    } else if (path === "/api/na/overview") {
      body = { depts: [], derniereCollecte: null, total: { orgs: 0, orgsAvecEvenement: 0, evenements: 0, deptsSansEvenement: [] } };
    } else if (path === "/api/na/events") {
      body = { dept: "", events: [] };
    } else if (path === "/api/health/detail") {
      body = {
        ok: true, generatedAt: "2026-11-21T08:00:00Z", windowDays: 7,
        sources: { declared: 2, enabled: 2, actives7j: 2, muettes7j: 0, bySource: [] },
        events24h: 693, orgs7j: 7, queues: { pending: 1, reviewed: 0, promoted: 0 }, families: [],
      };
    } else if (path === "/api/health/causes") {
      body = { ok: true, generatedAt: "2026-11-21T08:00:00Z", rouges: 0, sansTrace: 0, causes: [] };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

const SCREENS = [
  { view: "today", root: ".today", marker: ".today__table tbody tr", scroll: ".today__table-wrap", card: ".today__table" },
  { view: "review", root: ".revue", marker: ".revue__row", scroll: ".revue", card: "" },
  { view: "journal", root: ".journal", marker: ".journal__table tbody tr", scroll: ".journal__scroll", card: ".journal__table" },
  { view: "sources", root: ".sources-view", marker: ".sources-table tbody tr", scroll: ".sources-view__scroll", card: ".sources-table" },
];

test.beforeAll(async () => { await mkdir(SHOTS, { recursive: true }); });

for (const screen of SCREENS) {
  test(`${screen.view} : cartes empilées, zéro débordement à 375 px`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
    await stubApi(page);
    await page.goto(`${BASE}/#/${screen.view}`, { waitUntil: "domcontentloaded" });
    await page.locator(screen.marker).first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(300);

    const metrics = await page.evaluate(({ root, scroll, card }) => {
      const doc = document.documentElement;
      const width = doc.clientWidth;
      const rect = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return { sw: el.scrollWidth, cw: el.clientWidth, right: Math.round(box.right), left: Math.round(box.left) };
      };
      const overflowing = [...document.querySelectorAll("body *")]
        .filter((el) => {
          if (el.classList.contains("sources-view__caption")) return false;
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const box = el.getBoundingClientRect();
          return box.width > 0 && (box.right > width + 1 || box.left < -1);
        })
        .slice(0, 8)
        .map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`);
      const nav = document.querySelector(".rail__nav");
      const buttons = nav ? [...nav.querySelectorAll("button")] : [];
      return {
        doc: { sw: doc.scrollWidth, cw: width },
        stage: rect(".shell__stage"),
        screen: rect(root),
        container: rect(scroll),
        cardDisplay: card ? getComputedStyle(document.querySelector(card)!).display : null,
        theadDisplay: card && document.querySelector(`${card} thead`)
          ? getComputedStyle(document.querySelector(`${card} thead`)!).display : "absent",
        nav: rect(".rail__nav"),
        navButtons: buttons.length,
        smallButtons: buttons.filter((b) => b.getBoundingClientRect().height < 44).length,
        overflowing,
      };
    }, { root: screen.root, scroll: screen.scroll, card: screen.card });

    const file = `${SHOTS}/${screen.view}-375.png`;
    await page.screenshot({ path: file, fullPage: true });
    await page.locator(screen.marker).first().scrollIntoViewIfNeeded();
    const cardsFile = `${SHOTS}/${screen.view}-cartes-375.png`;
    await page.screenshot({ path: cardsFile });
    console.log(`${screen.view}: document ${metrics.doc.sw}/${metrics.doc.cw}, écran ${metrics.screen?.sw}/${metrics.screen?.cw}, conteneur ${metrics.container?.sw}/${metrics.container?.cw}, captures ${file} et ${cardsFile}`);

    expect(metrics.doc.sw).toBeLessThanOrEqual(metrics.doc.cw);
    expect(metrics.stage!.sw).toBeLessThanOrEqual(metrics.stage!.cw);
    expect(metrics.screen!.sw).toBeLessThanOrEqual(metrics.screen!.cw);
    expect(metrics.container!.sw).toBeLessThanOrEqual(metrics.container!.cw);
    expect(metrics.nav!.sw).toBeLessThanOrEqual(metrics.nav!.cw);
    expect(metrics.overflowing).toEqual([]);
    expect(metrics.navButtons).toBeGreaterThan(5);
    expect(metrics.smallButtons).toBe(0);
    if (screen.card) {
      expect(metrics.cardDisplay).toBe("block");
      expect(metrics.theadDisplay).toBe("none");
    }
    await page.close();
  });
}
