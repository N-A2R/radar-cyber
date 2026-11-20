/**
 * Fenêtre et instants du rejeu des agents de rupture
 * (scripts/mesure-fausses-alertes.mts) : un mauvais argument doit planter
 * avant toute requête, les instants d'une sous-fenêtre ad hoc sont calés sur
 * sa fin, et une alerte au-delà de la couverture du corpus n'est pas
 * classable — la classer fausse faute de vérité terrain est le piège
 * documenté dans docs/fausses-alertes.md.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	estClassable,
	genererInstants,
	parserFenetre,
} from "../../../scripts/mesure-fausses-alertes.mts";

describe("parserFenetre", () => {
	it("borne la fenêtre annuelle du chantier 10 sur T00:00:00Z / T23:59:59Z", () => {
		const f = parserFenetre("2025-11-01", "2026-10-31", 14);
		assert.equal(f.debut, Date.parse("2025-11-01T00:00:00Z"));
		assert.equal(f.fin, Date.parse("2026-10-31T23:59:59Z"));
		assert.equal(f.pasJours, 14);
	});

	it("refuse un pas non positif ou non numérique", () => {
		assert.throws(() => parserFenetre("2025-11-01", "2026-10-31", 0), /pas de rejeu invalide/);
		assert.throws(
			() => parserFenetre("2025-11-01", "2026-10-31", Number.NaN),
			/pas de rejeu invalide/,
		);
	});

	it("refuse une fenêtre inversée et une date invalide", () => {
		assert.throws(() => parserFenetre("2026-11-01", "2026-10-01", 14), /inversée/);
		assert.throws(() => parserFenetre("pas-une-date", "2026-10-01", 14), /fenêtre invalide/);
	});
});

describe("genererInstants", () => {
	it("fenêtre par défaut : en avant depuis le début — 27 instants sur l'année du chantier 10", () => {
		const f = parserFenetre("2025-11-01", "2026-10-31", 14);
		const instants = genererInstants(f, false);
		assert.equal(instants.length, 27);
		assert.equal(instants[0], f.debut);
		assert.equal(instants[instants.length - 1], Date.parse("2026-10-31T00:00:00Z"));
	});

	it("sous-fenêtre ad hoc : calée en arrière depuis la fin — le dernier instant voit les faits les plus récents", () => {
		const f = parserFenetre("2026-10-21", "2026-11-20", 14);
		const instants = genererInstants(f, true);
		assert.deepEqual(instants, [
			Date.parse("2026-11-20T23:59:59Z"),
			Date.parse("2026-11-06T23:59:59Z"),
			Date.parse("2026-10-23T23:59:59Z"),
		]);
	});
});

describe("estClassable", () => {
	const maxDateCorpus = Date.parse("2026-11-10T00:00:00Z");

	it("classable tant que la tolérance de veille recouvre la couverture du corpus", () => {
		assert.equal(estClassable(Date.parse("2026-11-20T00:00:00Z"), maxDateCorpus, 35), true);
	});

	it("non classable au-delà : inventer un verdict faute de vérité terrain est refusé", () => {
		assert.equal(estClassable(Date.parse("2026-12-20T00:00:00Z"), maxDateCorpus, 35), false);
	});
});
