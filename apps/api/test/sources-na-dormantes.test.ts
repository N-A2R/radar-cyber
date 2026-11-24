import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseDeclaredFeed } from "../src/collectors/generic.js";

/**
 * Preuves réelles du 24/11/2026 : corps HTTP conservés tels quels et metadata
 * (statut, Date, sha256, nombre d'items) dans
 * bench/results/na-sources-dormantes-2026-11-24.json. Le test ne rejoue pas le
 * réseau : il garantit que le lecteur `feed` déclaré en base lit ces octets et
 * ne fabrique aucun item quand la réponse est une page d'erreur.
 */
const EVIDENCE = JSON.parse(
  readFileSync(new URL("../../../bench/results/na-sources-dormantes-2026-11-24.json", import.meta.url), "utf8"),
) as {
  sources: {
    id: string;
    url: string;
    fixture: string;
    sha256: string;
    parseur: { format: string; items: number; premier_titre?: string; premiere_date?: string; motif?: string };
    decision?: string;
  }[];
};

test("cinq sources dormantes : le lecteur feed rend des items réels et non vides", () => {
  const vivantes = EVIDENCE.sources.filter((source) => !source.decision);
  assert.equal(vivantes.length, 5, "le lot réparé doit couvrir cinq sources");

  for (const source of vivantes) {
    const body = readFileSync(new URL(`../../../${source.fixture}`, import.meta.url), "utf8");
    assert.equal(createHash("sha256").update(body).digest("hex"), source.sha256, `${source.id} : la preuve conservée a changé`);

    const items = parseDeclaredFeed(body, {}, source.parseur.format);
    assert.ok(items.length > 0, `${source.id} : aucun item sur une réponse pourtant réelle`);
    assert.equal(items.length, source.parseur.items, `${source.id} : nombre d'items divergent`);

    const first = items[0];
    assert.equal(first.title, source.parseur.premier_titre, `${source.id} : titre divergent`);
    assert.equal(first.date, source.parseur.premiere_date, `${source.id} : date divergente`);
    for (const key of ["title", "date", "link", "summary", "language"]) {
      assert.equal(typeof first[key], "string", `${source.id} : champ ${key} absent`);
      assert.ok(String(first[key]).length > 0, `${source.id} : champ ${key} vide`);
    }
    const host = new URL(source.url).host;
    assert.ok(String(first.link).includes(host), `${source.id} : lien hors domaine éditeur`);
  }
});

test("source morte : la preuve est une page d'erreur, sans item inventé", () => {
  const morte = EVIDENCE.sources.find((source) => source.decision);
  assert.ok(morte, "une source au moins doit être désactivée avec motif");
  const body = readFileSync(new URL(`../../../${morte.fixture}`, import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(body).digest("hex"), morte.sha256);
  assert.match(body, /Oops, an error occurred!/);
  assert.equal(parseDeclaredFeed(body, {}, morte.parseur.format).length, 0);
  assert.equal(morte.parseur.items, 0);
  assert.match(morte.decision ?? "", /désactivation avec motif explicite/);
});
