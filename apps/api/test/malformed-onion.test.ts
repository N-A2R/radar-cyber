// Lecture des pages .onion mal formées : fragments, encodage, challenges.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixMojibake,
  parseMalformedOnion,
  repairOnionHtml,
} from "../src/collectors/parsers/malformed.js";
import { detectItems } from "../src/collectors/generic.js";

test("repairOnionHtml ajoute la racine manquante et journalise la réparation", () => {
  const r = repairOnionHtml("<p>Communiqué du groupe</p>");
  assert.match(r.html, /^<html><body>/);
  assert.match(r.html, /<\/body><\/html>$/);
  assert.ok(r.repairs.includes("racine-html-ajoutee"));
});

test("repairOnionHtml ferme les balises de bloc ouvertes", () => {
  const r = repairOnionHtml("<div><p>Texte laissé ouvert");
  assert.match(r.html, /<\/p><\/div>/);
  assert.ok(r.repairs.some((s) => s.endsWith("-balises-fermees")));
});

test("fixMojibake corrige l'UTF-8 lu comme windows-1252", () => {
  const r = fixMojibake("CafÃ© et sociÃ©tÃ©");
  assert.equal(r.text, "Café et société");
  assert.equal(r.changed, true);
  assert.equal(fixMojibake("texte propre").changed, false);
});

test("parseMalformedOnion extrait titre et paragraphe d'un fragment", () => {
  const items = parseMalformedOnion(
    "<title>Avis aux victimes</title><p>Le groupe a publié une nouvelle liste de victimes en Nouvelle-Aquitaine ce jour.</p>",
  );
  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.title, "Avis aux victimes");
  assert.match(String(items[0]!.summary), /Nouvelle-Aquitaine/);
});

test("parseMalformedOnion refuse un challenge anti-bot", () => {
  assert.equal(parseMalformedOnion("<html><body><h1>Just a moment... Checking your browser</h1></body></html>"), null);
});

test("parseMalformedOnion refuse une page trop courte", () => {
  assert.equal(parseMalformedOnion("vide"), null);
});

test("detectItems récupère une page que le parseur strict classait 'none'", () => {
  const body =
    "<title>État du service</title><p>Loading... Le 21 novembre 2026, le groupe a publié " +
    "une liste de victimes et annoncé une nouvelle adresse de contact sur le site.</p>";
  const detected = detectItems(body, "text/html");
  assert.equal(detected.strategy, "malformed-html");
  assert.ok(detected.items.length > 0);
});
