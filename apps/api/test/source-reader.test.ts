import { test } from "node:test";
import assert from "node:assert/strict";
import {
  READER_MODES,
  detectItems,
  doitLireIndicateurs,
  doitMettreEnQuarantaine,
  parseDeclaredFeed,
  readerMode,
} from "../src/collectors/generic.js";

/**
 * Un test par mode de lecture annoncé par docs/architecture-collecte.md.
 * `pnpm -F @radar/api test -- test/source-reader.test.ts` mesure 6/6.
 */

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Veille Nouvelle-Aquitaine</title>
<link>https://exemple.fr/</link><description>Veille régionale</description>
<item><title>Incident cyber en Gironde</title><link>https://exemple.fr/incident</link>
<description>Un incident a été signalé dans la région.</description></item>
</channel></rss>`;

test("auto — NULL et valeur inconnue retombent sur la détection historique", () => {
  assert.deepEqual(READER_MODES, ["auto", "feed", "html-page", "html-links", "indicator-list", "quarantine-first"]);
  assert.equal(readerMode(null), "auto");
  assert.equal(readerMode("inconnu"), "auto");
  const detected = detectItems(rss, "application/rss+xml");
  assert.notEqual(detected.strategy, "none");
  assert.ok(detected.items.length > 0);
});

test("feed — le chemin déclaré lit le flux, sans inventer sur une page web", () => {
  assert.ok(parseDeclaredFeed(rss, {}, "rss").length > 0);
  const page = "<html><body><h1>Veille</h1><p>Une page sans flux, même titrée, n'est pas un flux.</p></body></html>";
  assert.equal(parseDeclaredFeed(page, {}, "rss").length, 0);
});

test("html-page — une page de fuite se lit par son contenu", () => {
  const page = `<html><body>
  <nav><a href="/accueil">Accueil</a><a href="/fuites">Fuites</a></nav>
  <h1>AntiBrok3rs</h1><p>Le groupe publie les données d'un organisme régional, 2,3 Go exfiltrés le 12 mars 2026.</p>
  <h2>Victimes récentes</h2><p>Une collectivité de Nouvelle-Aquitaine, 400 Mo, publié le 10 mars 2026.</p>
  </body></html>`;
  const detected = detectItems(page, "text/html", "html-page");
  assert.equal(detected.strategy, "html-content");
  assert.ok(detected.items.length >= 2);
  assert.ok(!detected.items.some((item) => item.title === "Accueil"));
});

test("html-links — le mode déclaré force les liens, même dans un flux RSS", () => {
  const avecLiens = rss.replace(
    "Un incident a été signalé dans la région.",
    '<![CDATA[<a href="https://exemple.fr/a">Article A</a><a href="https://exemple.fr/b">Article B</a><a href="https://exemple.fr/c">Article C</a>]]>',
  );
  assert.notEqual(detectItems(avecLiens, "application/rss+xml").strategy, "html-links");
  const force = detectItems(avecLiens, "text/html", "html-links");
  assert.equal(force.strategy, "html-links");
  assert.equal(force.items.length, 3);
});

test("indicator-list — le mode déclaré prime sur le kind de la source", () => {
  const source = { reader: "indicator-list", kind: "narrative", format: "html", url: "https://exemple.fr/liste" };
  assert.equal(doitLireIndicateurs(source, "<html><body>1.2.3.4</body></html>"), true);
  const page = "<html><body>Veille régionale, sans liste d'indicateurs.</body></html>";
  assert.equal(doitLireIndicateurs({ ...source, reader: "html-page" }, page), false);
  assert.equal(doitLireIndicateurs({ ...source, reader: null }, page), false);
});

test("quarantine-first — le corps est conservé avant toute extraction", () => {
  assert.equal(readerMode("quarantine-first"), "quarantine-first");
  assert.equal(doitMettreEnQuarantaine({ reader: "quarantine-first" }), true);
  assert.equal(doitMettreEnQuarantaine({ reader: "auto" }), false);
  assert.equal(doitMettreEnQuarantaine({ reader: null }), false);
});
