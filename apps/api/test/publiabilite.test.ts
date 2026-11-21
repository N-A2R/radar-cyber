import { test } from "node:test";
import assert from "node:assert/strict";
import {
	MENTION_NON_PUBLIABLE,
	SECTEURS_ATTENDUS,
	verifierPubliabilite,
} from "../src/analyse/publiabilite.js";

test("référentiel incomplet : la mention « taux non publiable » et la raison sont présentes", () => {
	const verdict = verifierPubliabilite({
		agroalimentaire: 12,
		industrie: 3,
		construction: 0,
		commerce: 0,
	});
	assert.equal(verdict.publiable, false);
	assert.equal(verdict.mention, MENTION_NON_PUBLIABLE);
	assert.equal(verdict.mention, "taux non publiable");
	assert.match(verdict.raison ?? "", /construction, commerce/);
	assert.match(verdict.raison ?? "", /75 %/);
});

test("référentiel complet : aucune mention ni raison", () => {
	const verdict = verifierPubliabilite(
		Object.fromEntries(SECTEURS_ATTENDUS.map((secteur) => [secteur, 1])),
	);
	assert.equal(verdict.publiable, true);
	assert.equal(verdict.mention, null);
	assert.equal(verdict.raison, null);
});

test("au seuil de 75 %, le taux reste publiable", () => {
	const verdict = verifierPubliabilite({
		agroalimentaire: 10,
		industrie: 10,
		construction: 10,
	});
	assert.equal(verdict.partSecteurs, 0.75);
	assert.equal(verdict.mention, null);
});
