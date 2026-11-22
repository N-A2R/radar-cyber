/**
 * One test per behaviour of the official-statement aggregator.
 * Pure functions only: no network, no database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectStatements } from "../src/communiques/collect.js";
import { canonicalUrl, dedupeStatements } from "../src/communiques/dedupe.js";
import { isNouvelleAquitaine, isOfficialDomain, OFFICIAL_SOURCES, type OfficialSource, type OfficialStatement } from "../src/communiques/model.js";
import { containsVictimPersonalData, parseFeed, parseListing, parsePublishedDate } from "../src/communiques/parse.js";
import { inWindow, isoWeek } from "../src/communiques/window.js";

const ars = OFFICIAL_SOURCES.find((s) => s.id === "official-na-ars-communiques")!;
const cd47 = OFFICIAL_SOURCES.find((s) => s.id === "official-na-cd47-actualites")!;

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
