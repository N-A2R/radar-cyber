/**
 * Cinq formats, cinq échantillons réels : RSS 2.0, Atom, JSON-LD, HTML
 * `<article>`/`<main>` et flux JSON maison. Les corps sont figés dans
 * `fixtures/parseurs/` (voir son README) : aucun test ne fait de réseau.
 *
 * Chaque test vérifie la détection automatique ET les quatre champs utiles
 * (titre, date, lien, résumé), puis les cas d'erreur et les états vides.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSource } from "../src/collectors/parsers/index.js";
import { parseHtmlArticles } from "../src/collectors/parsers/article.js";
import { parseJsonFeed } from "../src/collectors/parsers/json.js";
import { parseJsonLdDetailed } from "../src/collectors/parsers/jsonld.js";
import { parseFeedDetailed } from "../src/collectors/parsers/xml.js";
import type { SourceParse } from "../src/collectors/parsers/index.js";

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/parseurs/${name}`, import.meta.url), "utf8");
}

function hasAllFields(parse: SourceParse): boolean {
  const item = parse.items[0];
  return Boolean(item && item.title && item.date && item.link && item.summary);
}

test("RSS 2.0 : détection et quatre champs sur un flux CERT réel", () => {
  const p = parseSource(fixture("rss2.xml"), "application/xml");
  assert.equal(p.format, "rss-2");
  assert.equal(p.strategy, "rss-2");
  assert.equal(p.path, "rss.channel.item");
  assert.equal(p.items.length, 40);
  assert.equal(p.empty, false);
  assert.equal(p.ok, true, JSON.stringify(p.diagnostics));
  const [item] = p.items;
  assert.match(String(item.title), /Mattermost Server/);
  assert.equal(item.date, "2026-10-20T00:00:00.000Z");
  assert.match(String(item.link), /^https:\/\/www\.cert\.cyber\.gouv\.fr\/avis\//);
  assert.match(String(item.summary), /De multiples vulnérabilités/);
  assert.ok(!String(item.title).includes("&#"), "les entités HTML sont décodées");
});

test("Atom : liens href, dates et résumé sur un flux réel", () => {
  const p = parseSource(fixture("atom.xml"), "application/atom+xml");
  assert.equal(p.format, "atom");
  assert.equal(p.strategy, "atom");
  assert.equal(p.items.length, 25);
  assert.equal(p.ok, true, JSON.stringify(p.diagnostics));
  assert.ok(p.items.every((i) => typeof i.title === "string" && i.title.length > 5));
  const [item] = p.items;
  assert.match(String(item.title), /Signal to restrict screenshots/);
  assert.equal(item.date, "2026-11-20T17:03:37.000Z");
  assert.match(String(item.link), /^https:\/\/www\.zdnet\.com\//);
  assert.match(String(item.summary), /Microsoft Recall/);
});

test("JSON-LD : un NewsArticle réel, pas les métadonnées du site", () => {
  const body = fixture("jsonld-article.html");
  const p = parseSource(body, "text/html");
  assert.equal(p.format, "json-ld");
  assert.equal(p.strategy, "json-ld");
  assert.equal(p.items.length, 1);
  assert.equal(hasAllFields(p), true, JSON.stringify(p.items[0]));
  assert.match(String(p.items[0].title), /BADBOX botnet/);
  assert.match(String(p.items[0].summary), /ad-fraud operations/);
  assert.equal(p.items[0].date, "2026-11-21T15:17:27.000Z");

  const organizationOnly = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example"}</script>';
  assert.equal(parseSource(organizationOnly, "text/html").strategy, "none");
  assert.deepEqual(parseJsonLdDetailed(organizationOnly)?.errors, ["json-ld-sans-article"]);
  const detailed = parseJsonLdDetailed(body);
  assert.ok(detailed);
  assert.deepEqual(detailed.errors, []);
});

test("HTML <article> : titre, lien canonique et résumé d'un billet réel", () => {
  const p = parseSource(fixture("html-article.html"), "text/html");
  assert.equal(p.format, "html");
  assert.equal(p.strategy, "html-article");
  assert.equal(p.items.length, 1);
  const [item] = p.items;
  assert.equal(item.title, "CTO of ‘RansomwareHelp’ Indicted for Wire Fraud");
  assert.equal(item.link, "https://krebsonsecurity.com/2026/11/cto-of-ransomwarehelp-indicted-for-wire-fraud/");
  assert.match(String(item.summary), /chief technology officer and co-founder/);
  // Cette page réelle ne porte aucune date en métadonnée : aucun champ n'est inventé.
  assert.equal(item.date, undefined);
  assert.equal(p.ok, true);
});

test("HTML <main> : cartes de listing et dates extraites, sans liens de menu", () => {
  const p = parseSource(fixture("html-main.html"), "text/html", {
    baseUrl: "https://www.cisa.gov/news-events/cybersecurity-advisories",
  });
  assert.equal(p.strategy, "html-article");
  assert.equal(p.items.length, 4, "quatre cartes réelles, pas 107 liens de navigation");
  assert.ok(p.items.every((item) => typeof item.title === "string" && item.title.length > 10));
  assert.ok(p.items.every((item) => typeof item.link === "string" && item.link.startsWith("https://www.cisa.gov/")));
  assert.ok(p.items.every((item) => typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}T/.test(item.date)));
  assert.ok(!p.items.some((item) => /Search all|Advisory Type/i.test(String(item.title))));
});

test("HTML <main> sans <article> : sections avec liens deviennent des items", () => {
  const p = parseSource(fixture("html-sections.html"), "text/html", { baseUrl: "https://msrc.microsoft.com/blog/" });
  assert.equal(p.strategy, "html-article");
  assert.equal(p.items.length, 3);
  assert.match(String(p.items[0].title), /MSRC perspectives on security strategy/);
  assert.match(String(p.items[0].link), /^https:\/\/www\.microsoft\.com\//);
  assert.match(String(p.items[0].summary), /Read leadership posts/);
});

test("JSON maison : enveloppe NVD, CVE, date et résumé multilingue", () => {
  const p = parseSource(fixture("json-maison.json"), "application/json");
  assert.equal(p.format, "json");
  assert.equal(p.strategy, "json-nested-array");
  assert.equal(p.path, "vulnerabilities");
  assert.equal(p.items.length, 2);
  const [item] = p.items;
  assert.equal(item.title, "CVE-1999-0095");
  assert.equal(item.date, "1988-10-01T04:00:00.000Z");
  assert.match(String(item.summary), /debug command in Sendmail/);
  assert.equal(item.id, "CVE-1999-0095", "l'enveloppe cve est déballée dans les champs canoniques");
  assert.deepEqual(parseJsonFeed(fixture("json-maison.json"))?.errors, []);
});

test("JSON maison : clés propres, liens relatifs et tableaux nommés", () => {
  const cisa = JSON.stringify({
    title: "Known Exploited Vulnerabilities",
    vulnerabilities: [{
      cveID: "CVE-2026-129448",
      vulnerabilityName: "Apache Roller Deserialization of Untrusted Data Vulnerability",
      dateAdded: "2026-11-20",
      shortDescription: "Apache Roller contains a deserialization vulnerability.",
    }],
  });
  const cisaParsed = parseSource(cisa, "application/json");
  assert.equal(cisaParsed.strategy, "json-nested-array");
  assert.equal(cisaParsed.items[0].title, "Apache Roller Deserialization of Untrusted Data Vulnerability");
  assert.equal(cisaParsed.items[0].date, "2026-11-20T00:00:00.000Z");
  assert.match(String(cisaParsed.items[0].summary), /deserialization vulnerability/);

  const maison = JSON.stringify({ posts: [
    { post_title: "Victime", discovered: "2026-11-21 10:00:00", link: "/blog/post/victime/" },
  ] });
  const parsed = parseSource(maison, "application/json", { baseUrl: "https://ransomlook.io/api/recent" });
  assert.equal(parsed.strategy, "json-nested-array");
  assert.equal(parsed.items[0].title, "Victime");
  assert.equal(parsed.items[0].link, "https://ransomlook.io/blog/post/victime/");
  assert.equal(parsed.items[0].date, "2026-11-21T10:00:00.000Z");
});

test("Détection automatique : le content-type annoncé ne décide pas seul", () => {
  assert.equal(parseSource(fixture("rss2.xml"), "application/json").strategy, "rss-2");
  assert.equal(parseSource(fixture("json-maison.json"), "text/plain").strategy, "json-nested-array");
  assert.equal(parseSource(fixture("jsonld-article.html"), "application/rss+xml").strategy, "json-ld");
  assert.equal(parseSource(fixture("html-article.html"), "application/octet-stream").strategy, "html-article");
});

test("Erreurs et états vides : jamais d'exception, toujours un diagnostic", () => {
  const empty = parseSource("", "text/html");
  assert.equal(empty.empty, true);
  assert.equal(empty.format, "vide");
  assert.equal(empty.ok, false);
  assert.ok(empty.diagnostics.some((d) => d.code === "corps-vide"));

  const absent = parseSource(null, null);
  assert.equal(absent.empty, true);
  assert.equal(absent.strategy, "none");

  const brokenJson = parseSource('{"items":[{"title":"tronqué"', "application/json");
  assert.equal(brokenJson.empty, true);
  assert.ok(brokenJson.diagnostics.some((d) => d.code === "json-invalide" && d.severity === "error"));

  const brokenXml = parseSource("<rss><channel><item><title>Erreur XML", "application/xml");
  assert.ok(brokenXml.diagnostics.some((d) => d.code === "xml-invalide"));
  const detailed = parseFeedDetailed("<rss><channel><item><title>Erreur XML");
  assert.ok(detailed?.errors.some((e) => e.startsWith("xml-invalide")));

  const emptyJson = parseSource('{"items":[]}', "application/json");
  assert.equal(emptyJson.empty, true);
  assert.deepEqual(parseJsonFeed('{"items":[]}')?.errors, ["aucun-tableau"]);

  const navOnly = '<nav><a href="/a">Accueil du site</a><a href="/b">Nos services</a><a href="/c">Contact</a></nav>';
  assert.equal(parseHtmlArticles(navOnly), null, "un menu n'est pas un article");
  assert.equal(parseSource(navOnly, "text/html").strategy, "html-links");
});

test("JSON-LD invalide : le bloc cassé est signalé sans perdre l'article valide", () => {
  const valid = (fixture("jsonld-article.html").match(/<script[\s\S]*?<\/script>/i) ?? [""])[0];
  const p = parseSource(`<html><body>${valid}<script type="application/ld+json">{pas du json}</script></body></html>`, "text/html");
  assert.equal(p.strategy, "json-ld");
  assert.equal(p.items.length, 1);
  assert.ok(p.diagnostics.some((d) => d.code === "json-ld-invalide" && d.severity === "warning"));
  assert.equal(p.ok, true, "une récupération partielle n'est pas une panne");
});

test("Aucun item n'est inventé : objets sans titre, lien ni résumé", () => {
  const p = parseSource('[{"foo":1},{"bar":2}]', "application/json");
  assert.equal(p.empty, true);
  assert.equal(p.items.length, 0);
  assert.ok(p.diagnostics.length > 0 || parseJsonFeed('[{"foo":1},{"bar":2}]')?.errors.length === 1);
});
