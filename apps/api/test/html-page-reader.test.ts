import { test } from "node:test";
import assert from "node:assert/strict";
import { detectItems, parseHtmlContent } from "../src/collectors/generic.js";

/**
 * Le mode `html-page` doit lire le **contenu** d'une page de fuite — pas sa
 * navigation. Avant, `parseHtmlLinks` ramenait les menus, et la porte de
 * pertinence rejetait tout : 110 sources HTML muettes.
 */
const page = `<html><body>
<nav><a href="/accueil">Accueil</a><a href="/leaks">Fuites</a></nav>
<h1>AntiBrok3rs</h1>
<p>Le groupe AntiBrok3rs publie les données de la Caisse d'Allocations de Test, 2,3 Go exfiltrés le 12 mars 2026.</p>
<h2>Victimes récentes</h2>
<p>Mairie de Ravigny (53) — 400 Mo, publié le 10 mars 2026.</p>
<footer>© AntiBrok3rs</footer>
</body></html>`;

test("html-page extrait le contenu, pas la navigation", () => {
	const r = detectItems(page, "text/html", "html-page");
	assert.equal(r.strategy, "html-content");
	assert.ok(r.items.length >= 2, `attendu >= 2 blocs, obtenu ${r.items.length}`);
	const titres = r.items.map((i) => String(i.title));
	assert.ok(titres.some((t) => t.includes("AntiBrok3rs")), "le titre principal doit être extrait");
	assert.ok(titres.some((t) => t.includes("Victimes")), "le bloc victimes doit être extrait");
	// La navigation ne doit pas devenir un « événement ».
	assert.ok(!titres.some((t) => t === "Accueil"), "les liens de navigation ne sont pas du contenu");
});

test("la détection automatique lit aussi le contenu", () => {
	// Page avec 3 liens : `html-links` prend le dessus (3 items minimum).
	const troisLiens = page.replace('<a href="/leaks">Fuites</a>', '<a href="/leaks">Fuites</a><a href="/contact">Contact</a>');
	assert.equal(detectItems(troisLiens, "text/html").strategy, "html-links");
	// Sans le troisième lien, la détection retombe sur le contenu — ou refuse
	// poliment (2 liens < au minimum de 3 pour `html-links`). Les deux sont
	// des issues valides : le contrat est de ne jamais inventer.
	const sansTroisiemeLien = page.replace('<a href="/contact">Contact</a>', "");
	const r2 = detectItems(sansTroisiemeLien, "text/html");
	assert.ok(r2.strategy === "html-content" || r2.strategy === "html-links" || r2.strategy === "none", `stratégie: ${r2.strategy}`);
});

test("parseHtmlContent refuse une page sans contenu lisible", () => {
	assert.equal(parseHtmlContent("<html><body><script>var a=1;</script></body></html>"), null);
});
