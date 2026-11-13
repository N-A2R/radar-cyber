/**
 * Fraîcheur et confiance : deux axes, jamais un seul chiffre.
 *
 * Le fil affichait une sévérité et une date. Il ne disait pas si la date était
 * celle de l'incident ou celle de la collecte, ni si trois sources concordaient
 * ou si une seule revendiquait. Ce sont pourtant les deux questions qui
 * décident de ce qu'on peut faire d'une ligne.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { confianceDe, fraicheurDe, SEUILS_CONFIANCE } from "../src/analyse/confiance.js";

const MAINTENANT = new Date("2026-11-13T12:00:00Z");

test("une date publiée par la source est certaine", () => {
	const f = fraicheurDe({ observedAt: "2026-11-13T09:00:00Z", dateSource: "feed" }, MAINTENANT);
	assert.equal(f.precision, "certaine");
	assert.equal(f.classe, "frais");
	assert.equal(f.ageJours, 0);
	assert.equal(f.libelle, "aujourd'hui");
});

test("une date déduite du texte se déclare comme telle", () => {
	const f = fraicheurDe({ observedAt: "2026-11-10T09:00:00Z", dateSource: "inferred" }, MAINTENANT);
	assert.equal(f.precision, "deduite");
	assert.match(f.libelle, /déduite du texte/);
	assert.equal(f.classe, "recent");
});

test("une date de collecte n'est pas la date de l'incident", () => {
	const f = fraicheurDe({ observedAt: "2026-11-13T11:00:00Z", dateSource: "fetched" }, MAINTENANT);
	assert.equal(f.precision, "collecte");
	// C'est la phrase qui compte : sans elle, un article vieux de trois semaines
	// collecté ce matin se lit comme un incident du jour.
	assert.match(f.libelle, /date de collecte, pas de l'incident/);
});

test("une date dans le futur est invraisemblable, pas fraîche", () => {
	const f = fraicheurDe({ observedAt: "2027-01-01T00:00:00Z", dateSource: "feed" }, MAINTENANT);
	assert.equal(f.classe, "inconnu");
	assert.match(f.libelle, /invraisemblable/);
});

test("sans date, l'âge est inconnu — pas zéro", () => {
	const f = fraicheurDe({ observedAt: null }, MAINTENANT);
	assert.equal(f.ageJours, null);
	assert.equal(f.classe, "inconnu");
});

test("une revendication isolée ne peut pas être « établie »", () => {
	const c = confianceDe({
		sourceConfidence: "A1",
		assertionType: "confirmed_incident",
		orgId: 42,
		sourcesDistinctes: 1,
	});
	// Même avec la meilleure source et un incident confirmé, une seule source
	// ne corrobore rien : le plafond doit tenir.
	assert.ok(c.note <= 0.65, `note ${c.note}`);
	assert.notEqual(c.niveau, "etabli");
});

test("trois sources concordantes sur un incident confirmé : établi", () => {
	const c = confianceDe({
		sourceConfidence: "A2",
		assertionType: "confirmed_incident",
		orgId: 42,
		sourcesDistinctes: 3,
	});
	assert.ok(c.note >= SEUILS_CONFIANCE.etabli, `note ${c.note}`);
	assert.equal(c.niveau, "etabli");
	assert.ok(c.raisons.some((r) => r.includes("3 sources")));
});

test("une revendication tierce d'une source faible reste fragile", () => {
	const c = confianceDe({
		sourceConfidence: "C3",
		assertionType: "third_party_claim",
		orgId: 7,
		sourcesDistinctes: 1,
	});
	assert.equal(c.niveau, "fragile");
	assert.ok(c.raisons.includes("revendication tierce, non confirmée"));
});

test("l'absence de rattachement est dite, pas seulement pénalisée", () => {
	const c = confianceDe({ sourceConfidence: "B2", assertionType: "ambient_signal", orgId: null });
	assert.ok(c.raisons.includes("aucune organisation rattachée"));
	assert.ok(c.raisons.includes("aucune corroboration mesurable"));
});

test("la note est indépendante de la fraîcheur", () => {
	// Un fait ancien et certain vaut mieux qu'un fait frais et incertain :
	// mélanger les deux axes en un score rendrait ce jugement impossible.
	const ancien = confianceDe({
		sourceConfidence: "A1",
		assertionType: "confirmed_incident",
		orgId: 1,
		sourcesDistinctes: 3,
	});
	const frais = fraicheurDe({ observedAt: "2026-11-13T11:00:00Z", dateSource: "feed" }, MAINTENANT);
	assert.equal(ancien.niveau, "etabli");
	assert.equal(frais.classe, "frais");
	assert.equal("note" in frais, false, "la fraîcheur ne porte aucune note");
});
