/**
 * Le contrat ne doit jamais prendre un temps pathologique sur une entrée
 * surdimensionnée — c'est la crainte derrière l'alerte Dependabot Zod
 * (< 4.6.6 : chaînes contraintes surdimensionnées → mémoire).
 *
 * Ces tests décrivent ce qui se passe VRAIMENT aujourd'hui, mesuré :
 *  - `title` et `summary` sont tronqués AVANT Zod (400 / 4000) : la validation
 *    ne voit jamais la chaîne géante, d'où le rejet qui n'arrive jamais ;
 *  - `sourceUrl` n'est PAS borné : 10 Mo passent en 21 ms (linéaire, pas de
 *    regex catastrophique) — défaut de taille, pas de complexité.
 *
 * Ils échoueraient si un futur changement exposait Zod à une chaîne géante
 * contrainte (le scénario de la faille).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admitEvent, type Admission } from "../src/contract/admit.js";

const base = {
	dedupKey: "feed:exemple:abcdef123456",
	family: "vuln",
	assertionType: "technical_indicator",
	title: "titre valide",
	sourceId: "nvd",
};

const GEAnt = "A".repeat(10 * 1024 * 1024);

function chrono(fn: () => unknown): number {
	const t0 = process.hrtime.bigint();
	fn();
	return Number(process.hrtime.bigint() - t0) / 1e6;
}

test("un titre de 10 Mo est tronqué à 400, pas validé entier", () => {
	let verdict: Admission | undefined;
	const ms = chrono(() => {
		verdict = admitEvent({ ...base, title: GEAnt });
	});
	assert.ok(verdict, "admitEvent doit rendre un verdict");
	assert.equal(verdict.ok, true, "un titre trop long se répare, il ne se rejette pas");
	assert.equal(verdict.ok ? verdict.event.title.length : -1, 400);
	assert.ok(ms < 2000, `traitement trop lent (${ms.toFixed(0)} ms) : Zod a vu la chaîne géante`);
});

test("un résumé de 10 Mo est tronqué à 4000", () => {
	let verdict: Admission | undefined;
	const ms = chrono(() => {
		verdict = admitEvent({ ...base, summary: GEAnt });
	});
	assert.ok(verdict, "admitEvent doit rendre un verdict");
	assert.equal(verdict.ok, true);
	assert.equal(verdict.ok ? verdict.event.summary?.length ?? 0 : -1, 4000);
	assert.ok(ms < 2000, `traitement trop lent (${ms.toFixed(0)} ms) : Zod a vu la chaîne géante`);
});

test("une URL de 10 Mo reste linéaire — pas de retour arrière catastrophique", () => {
	const url = "https://exemple.test/" + GEAnt;
	let verdict: Admission | undefined;
	const ms = chrono(() => {
		verdict = admitEvent({ ...base, sourceUrl: url });
	});
	// Documente le défaut connu : l'URL n'est bornée nulle part.
	assert.equal(verdict?.ok, true, "constat, pas une garantie : sourceUrl n'est pas borné");
	assert.ok(ms < 1000, `la validation d'URL a explosé (${ms.toFixed(0)} ms) : régression de complexité`);
});
