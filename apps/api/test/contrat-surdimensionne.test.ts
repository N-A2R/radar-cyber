/**
 * Le contrat ne doit jamais exposer Zod à une chaîne surdimensionnée — c'est
 * la crainte derrière l'alerte Dependabot Zod (< 4.6.6 : chaînes contraintes
 * surdimensionnées → mémoire).
 *
 * Les assertions sont structurelles : troncature AVANT Zod (400 / 4000),
 * trace de réparation et sortie exacte. Le défaut connu (`sourceUrl` non
 * borné) est documenté par la taille de sortie, sans seuil de durée : un
 * chrono absolu mesurerait la charge CI, pas la complexité du contrat.
 *
 * Ces tests échoueraient si un futur changement exposait Zod à une chaîne
 * géante contrainte (le scénario de la faille).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admitEvent } from "../src/contract/admit.js";

const base = {
	dedupKey: "feed:exemple:abcdef123456",
	family: "vuln",
	assertionType: "technical_indicator",
	title: "titre valide",
	sourceId: "nvd",
};

const GEAnt = "A".repeat(10 * 1024 * 1024);

const PETIT = "A".repeat(1024 * 1024);

test("un titre de 10 Mo est tronqué à 400, pas validé entier", () => {
	const verdict = admitEvent({ ...base, title: GEAnt });
	assert.equal(verdict.ok, true, "un titre trop long se répare, il ne se rejette pas");
	assert.equal(verdict.ok ? verdict.event.title.length : -1, 400);
	assert.equal(verdict.ok ? verdict.event.title : "", "A".repeat(400));
	assert.ok(verdict.repairs.includes("titre-tronque"), "la troncature précède la validation");
});

test("un résumé de 10 Mo est tronqué à 4000", () => {
	const verdict = admitEvent({ ...base, summary: GEAnt });
	assert.equal(verdict.ok, true);
	assert.equal(verdict.ok ? verdict.event.summary?.length ?? 0 : -1, 4000);
	assert.equal(verdict.ok ? verdict.event.summary : undefined, "A".repeat(4000));
	assert.ok(verdict.repairs.includes("resume-tronque"), "la troncature précède la validation");
});

test("une URL de 10 Mo reste linéaire — pas de retour arrière catastrophique", () => {
	const url = "https://exemple.test/" + GEAnt;
	const verdict = admitEvent({ ...base, sourceUrl: url });
	// Documente le défaut connu : l'URL n'est bornée nulle part.
	assert.equal(verdict.ok, true, "constat, pas une garantie : sourceUrl n'est pas borné");
	assert.equal(verdict.ok ? verdict.event.sourceUrl : undefined, url);
	assert.equal(verdict.ok ? verdict.event.sourceUrl?.length ?? 0 : -1, url.length);

	// La sortie suit la taille d'entrée sans expansion : pas de réécriture
	// superlinéaire d'une URL surdimensionnée.
	const courte = "https://exemple.test/" + PETIT;
	const petit = admitEvent({ ...base, dedupKey: "feed:exemple:abcdef654321", sourceUrl: courte });
	assert.equal(petit.ok, true);
	assert.equal(petit.ok ? petit.event.sourceUrl?.length ?? 0 : -1, courte.length);
});
