/**
 * Porte de publication du taux de couverture global
 * (`scripts/couverture-globale.mts`) : les seuils sont testés sur des corpus
 * synthétiques, sans base ni réseau. Un corpus de 5 lignes doit être refusé :
 * publier un taux sur un effectif aussi faible est le piège documenté dans
 * `docs/seuils-couverture.md`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	ErreurRefusPublication,
	REFUS_PUBLICATION,
	evaluerSeuils,
	exigerPublication,
	type IncidentCorpus,
} from "../../../scripts/couverture-globale.mts";

const FENETRE = { debut: "2025-11-01", fin: "2026-10-31" };
const SECTEURS_PLEINS = {
	agroalimentaire: 10,
	industrie: 10,
	construction: 10,
	commerce: 10,
};

/** `editeurs` = nombre d'éditeurs distincts, répartis également sur les lignes. */
function corpus(lignes: number, editeurs: number): IncidentCorpus[] {
	return Array.from({ length: lignes }, (_, i) => ({
		id: `incident-${i + 1}`,
		entite: `Organisation ${i + 1}`,
		datePublique: "2026-04-09",
		resume: "Fuite de données",
		preuve: { editeur: `Éditeur ${(i % editeurs) + 1}` },
	}));
}

describe("couverture globale — seuils de publication", () => {
	it("refuse de publier un corpus de 5 lignes", () => {
		const verdict = evaluerSeuils({
			incidents: corpus(5, 5),
			fenetre: FENETRE,
			parSecteur: SECTEURS_PLEINS,
		});

		assert.equal(verdict.publiable, false);
		assert.equal(verdict.mention, REFUS_PUBLICATION);
		assert.deepEqual(
			verdict.refus.map((r) => r.code),
			["corpus_trop_petit"],
		);
		assert.match(verdict.refus[0].raison, /5 incident\(s\)/);
		assert.throws(() => exigerPublication(verdict), ErreurRefusPublication);
		assert.throws(() => exigerPublication(verdict), /refus de publication : corpus_trop_petit/);
	});

	it("publie quand les trois seuils sont franchis", () => {
		const verdict = evaluerSeuils({
			incidents: corpus(30, 5),
			fenetre: FENETRE,
			parSecteur: SECTEURS_PLEINS,
		});

		assert.equal(verdict.publiable, true);
		assert.equal(verdict.mention, null);
		assert.deepEqual(verdict.refus, []);
		assert.doesNotThrow(() => exigerPublication(verdict));
	});

	it("refuse un référentiel troué et nomme les secteurs absents", () => {
		const verdict = evaluerSeuils({
			incidents: corpus(30, 5),
			fenetre: FENETRE,
			parSecteur: { agroalimentaire: 1 },
		});

		assert.deepEqual(
			verdict.refus.map((r) => r.code),
			["referentiel_trop_troue"],
		);
		assert.match(verdict.refus[0].raison, /industrie, construction, commerce/);
	});

	it("refuse un corpus entièrement porté par une seule source", () => {
		const verdict = evaluerSeuils({
			incidents: corpus(30, 1),
			fenetre: FENETRE,
			parSecteur: SECTEURS_PLEINS,
		});

		assert.deepEqual(
			verdict.refus.map((r) => r.code),
			["sources_trop_peu_productives"],
		);
		assert.equal(verdict.sources.partMax, 1);
	});

	it("les incidents hors fenêtre ne comptent pas pour franchir le seuil", () => {
		const horsFenetre = corpus(40, 5).map((incident) => ({
			...incident,
			datePublique: "2024-04-09",
		}));
		const verdict = evaluerSeuils({
			incidents: [...horsFenetre, ...corpus(5, 5)],
			fenetre: FENETRE,
			parSecteur: SECTEURS_PLEINS,
		});

		assert.equal(verdict.corpus.total, 45);
		assert.equal(verdict.corpus.dansFenetre, 5);
		assert.deepEqual(
			verdict.refus.map((r) => r.code),
			["corpus_trop_petit"],
		);
	});
});
