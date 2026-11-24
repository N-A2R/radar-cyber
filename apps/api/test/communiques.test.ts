/**
 * One test per behaviour of the official-statement aggregator.
 * Pure functions only: no network, no database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectStatements } from "../src/communiques/collect.js";
import { canonicalUrl, dedupeStatements } from "../src/communiques/dedupe.js";
import { isNouvelleAquitaine, isOfficialDomain, OFFICIAL_SOURCES, type OfficialSource, type OfficialStatement } from "../src/communiques/model.js";
import { containsVictimPersonalData, parseChuListing, parseFeed, parseListing, parsePublishedDate } from "../src/communiques/parse.js";
import { inWindow, isoWeek } from "../src/communiques/window.js";

const ars = OFFICIAL_SOURCES.find((s) => s.id === "official-na-ars-communiques")!;
const cd47 = OFFICIAL_SOURCES.find((s) => s.id === "official-na-cd47-actualites")!;

const chu = OFFICIAL_SOURCES.find((s) => s.id === "official-na-chu-bordeaux-actualites")!;
function item(overrides: Partial<OfficialStatement> = {}): OfficialStatement {
  return {
    sourceId: cd47.id,
    department: cd47.department,
    departmentLabel: cd47.departmentLabel,
    officialDomain: cd47.officialDomain,
    title: "Official announcement about regional cybersecurity",
    url: "https://www.lotetgaronne.fr/actualites/announcement",
    publishedAt: new Date("2026-11-20T10:00:00Z"),
    ...overrides,
  };
}

test("only first-party institutional domains are accepted", () => {
  assert.equal(isOfficialDomain("https://www.nouvelle-aquitaine.gouv.fr/actualites/x", {
    ...cd47, officialDomain: "www.nouvelle-aquitaine.gouv.fr",
  }), true);
  assert.equal(isOfficialDomain("https://www.lotetgaronne.fr/actualites/x", cd47), true);
  assert.equal(isOfficialDomain("https://www.lotetgaronne.fr.evil.test/x", cd47), false);
  assert.equal(isOfficialDomain("https://www.grandpoitiers.fr/actualites/x", {
    ...cd47, officialDomain: "www.grandpoitiers.fr",
  }), true);
});

test("every curated source is inside Nouvelle-Aquitaine", () => {
  assert.ok(OFFICIAL_SOURCES.length >= 8);
  assert.equal(OFFICIAL_SOURCES.every(isNouvelleAquitaine), true);
});

test("geographic scope is limited to Nouvelle-Aquitaine", () => {
  assert.equal(isNouvelleAquitaine(cd47), true);
  assert.equal(isNouvelleAquitaine({ ...cd47, department: "NA" }), true);
  assert.equal(isNouvelleAquitaine({ ...cd47, department: "75" }), false);
});

test("RSS items are admitted with their own publication date", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Communiqué de presse - Campagne régionale</title>
      <link>https://www.lotetgaronne.fr/actualites/campagne</link>
      <pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const parsed = parseFeed(xml, cd47);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.title, "Communiqué de presse - Campagne régionale");
  assert.equal(parsed[0]!.publishedAt.toISOString().slice(0, 10), "2026-11-20");
});

test("HTML listing takes the date printed next to the link", () => {
  const html = `<div class="card"><p class="date">Publié le 20/11/2026</p>
    <h2><a href="/communique-de-presse-2026-campagne">Communiqué de presse 2026 - Campagne régionale renforcée</a></h2></div>`;
  const parsed = parseListing(html, ars);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.url, "https://www.nouvelle-aquitaine.ars.sante.fr/communique-de-presse-2026-campagne");
  assert.equal(parsed[0]!.publishedAt.toISOString().slice(0, 10), "2026-11-20");
});

test("a document without an explicit date produces no statement", () => {
  const html = `<h2><a href="/communique-de-presse",>Communiqué de presse sans date visible</a></h2>`;
  assert.deepEqual(parseListing(html, ars), []);
  assert.equal(parsePublishedDate("récemment"), null);
  assert.equal(parsePublishedDate(undefined), null);
});

test("victim identifiers are rejected before storage", () => {
  assert.equal(containsVictimPersonalData("Réaction suite à la disparition de Lucette Lousteau"), true);
  assert.equal(containsVictimPersonalData("L'identité de la victime a été révélée"), true);
  assert.equal(containsVictimPersonalData("Un homme de 42 ans a été interpellé"), true);
  assert.equal(containsVictimPersonalData("Communiqué de presse sur la cybersécurité régionale"), false);
});

test("tracking parameters and repeated links are deduplicated", () => {
  const base = item();
  const tracked = item({ url: `${base.url}?utm_source=newsletter#top` });
  assert.equal(canonicalUrl(tracked.url), base.url);
  assert.equal(dedupeStatements([base, tracked, item({ url: `${base.url}-deux` })]).length, 2);
});

test("ISO weeks and rolling windows are explicit", () => {
  assert.equal(isoWeek(new Date("2026-11-21T12:00:00Z")), "2026-W47");
  const now = new Date("2026-11-21T12:00:00Z");
  const statements = [
    item({ publishedAt: new Date("2026-11-20T10:00:00Z") }),
    item({ publishedAt: new Date("2026-11-01T10:00:00Z") }),
    item({ publishedAt: new Date("2026-11-22T10:00:00Z") }),
  ];
  assert.equal(inWindow(statements, now, 7).length, 1);
});

test("collector drops out-of-window and victim items from every source", async () => {
  const source: OfficialSource = { ...cd47, url: "https://www.lotetgaronne.fr/actualites/rss" };
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Communiqué régional sur la prévention</title><link>https://www.lotetgaronne.fr/a</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate></item>
    <item><title>Disparition d'une personne à Agen</title><link>https://www.lotetgaronne.fr/b</link><pubDate>Fri, 20 Nov 2026 11:00:00 GMT</pubDate></item>
    <item><title>Communiqué ancien</title><link>https://www.lotetgaronne.fr/c</link><pubDate>Sat, 01 Nov 2026 11:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const fetchText = async (url: string) => {
    if (url === source.url) return xml;
    return "<html></html>";
  };
  const report = await collectStatements(fetchText, new Date("2026-11-21T12:00:00Z"), 7);
  assert.equal(report.admitted, 1);
  assert.equal(report.statements[0]!.title, "Communiqué régional sur la prévention");
  assert.ok(report.scanned > 0);
});

// Vérifié sur la page publique du CHU de Bordeaux le 2026-11-24 :
// https://www.chu-bordeaux.fr/Espace-m%C3%A9dia/Actualit%C3%A9s/
// et https://www.chu-bordeaux.fr/Espace-m%C3%A9dia/Actualit%C3%A9s/Information-%E2%80%93-S%C3%A9curit%C3%A9-informatique-%E2%80%93-point-de-situation-23-11-26-%C3%A0-11h00/
const chuListing = `<div id="mainDivActus" class="liste-news">
<div class="news"><a href="/Espace-média/Actualités/INFORMATION-CYBERINCIDENT-–-POINT-DE-SITUATION-DU-MARDI-24-NOVEMBRE-À-9H30/" class="news__vignette"><img alt="CYBERINCIDENT" src="/media/image/157/a.png"/></a><div class="news__content"><h2 class="news__titre">INFORMATION - CYBERINCIDENT – POINT DE SITUATION DU MARDI 24 NOVEMBRE À 9H30</h2><p>Deux adresses de messagerie électronique du CHU de Bordeaux ont récemment été utilisées frauduleusement...</p><p class="more"><a href="/Espace-média/Actualités/INFORMATION-CYBERINCIDENT-–-POINT-DE-SITUATION-DU-MARDI-24-NOVEMBRE-À-9H30/">En savoir plus</a></p></div></div>
<div class="news"><a href="/Espace-média/Actualités/Information-–-Sécurité-informatique-–-point-de-situation-23-11-26-à-11h00/" class="news__vignette"><img alt="Sécurité informatique" src="/media/image/184/b.png"/></a><div class="news__content"><h2 class="news__titre">Information – Sécurité informatique – point de situation 23/11/26 à 11h00</h2><p>Le CHU de Bordeaux a récemment identifié l'utilisation frauduleuse de deux adresses de messagerie...</p><p class="more"><a href="/Espace-média/Actualités/Information-–-Sécurité-informatique-–-point-de-situation-23-11-26-à-11h00/">En savoir plus</a></p></div></div>
</div>`;

test("short years printed by institutional sites are parsed without inventing a date", () => {
  assert.equal(parsePublishedDate("23/11/26")?.toISOString().slice(0, 10), "2026-11-23");
  assert.equal(parsePublishedDate("23/11/2026")?.toISOString().slice(0, 10), "2026-11-23");
  assert.equal(parsePublishedDate("31/02/26"), null);
  assert.equal(parsePublishedDate("23/11/99"), null);
  const html = `<h2><a href="/point-de-situation-23-11-26">Point de situation sécurité informatique 23/11/26 à 11h00</a></h2>`;
  assert.equal(parseListing(html, ars)[0]?.publishedAt.toISOString().slice(0, 10), "2026-11-23");
});

test("Bordeaux University Hospital cyber statement is admitted with its printed date", () => {
  assert.equal(isOfficialDomain("https://www.chu-bordeaux.fr/Espace-média/Actualités/x", chu), true);
  assert.equal(isOfficialDomain("https://www.chu-bordeaux.fr.evil.test/x", chu), false);
  const parsed = parseChuListing(chuListing, chu);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.publishedAt.toISOString().slice(0, 10), "2026-11-23");
  assert.equal(parsed[0]!.title, "Information – Sécurité informatique – point de situation 23/11/26 à 11h00");
  assert.ok(decodeURIComponent(parsed[0]!.url).endsWith("/Information-–-Sécurité-informatique-–-point-de-situation-23-11-26-à-11h00/"));
  // No year is printed for the 24 November card: it is refused, not dated from its neighbour.
  assert.equal(parsed.some((p) => p.title.includes("24 NOVEMBRE")), false);
});

test("collector admits the real cyber statement from the hospital listing", async () => {
  const fetchText = async (url: string) => url === chu.url ? chuListing : "<html></html>";
  const report = await collectStatements(fetchText, new Date("2026-11-24T22:00:00Z"), 7);
  assert.equal(report.scanned, OFFICIAL_SOURCES.length);
  assert.equal(report.bySource[chu.id], 1);
  assert.equal(report.admitted, 1);
  assert.equal(report.statements[0]!.sourceId, chu.id);
  assert.ok(report.statements[0]!.title.includes("Sécurité informatique"));
});
