/**
 * Le protocole de mesure des agents CPU, testé sur ses fonctions pures :
 * fenêtre d'arguments, instants de rejeu, classement des alertes et taux.
 * Aucune connexion : le script ne tourne qu'en processus principal.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	candidatsAlias,
	classerAlerteCpu,
	estClassable,
	genererInstants,
	parserFenetre,
	tauxFaussesAlertes,
	type Classement,
} from "../../../scripts/mesure-agents-cpu.mts";

const JOUR_MS = 86_400_000;
const INSTANT = Date.parse("2026-11-10T12:00:00Z");
const MAX_CORPUS = Date.parse("2026-11-10T00:00:00Z");

describe("fenêtre de rejeu", () => {
	it("borne les instants sur T00:00:00Z / T23:59:59Z", () => {
		const f = parserFenetre("2026-10-22", "2026-11-21", 1);
		assert.equal(f.debut, Date.parse("2026-10-22T00:00:00Z"));
		assert.equal(f.fin, Date.parse("2026-11-21T23:59:59Z"));
	});

	it("refuse un pas invalide, une date invalide et une fenêtre inversée", () => {
		assert.throws(() => parserFenetre("2026-10-22", "2026-11-21", 0), /pas de rejeu invalide/);
		assert.throws(() => parserFenetre("2026-10-22", "2026-11-21", Number.NaN), /pas de rejeu invalide/);
		assert.throws(() => parserFenetre("nope", "2026-11-21", 1), /fenêtre invalide/);
		assert.throws(() => parserFenetre("2026-11-22", "2026-11-21", 1), /inversée/);
	});

	it("calés en arrière depuis la fin, les instants incluent les deux bornes", () => {
		const f = parserFenetre("2026-11-19", "2026-11-21", 1);
		const instants = genererInstants(f);
		assert.deepEqual(instants, [
			Date.parse("2026-11-21T23:59:59Z"),
			Date.parse("2026-11-20T23:59:59Z"),
			Date.parse("2026-11-19T23:59:59Z"),
			Date.parse("2026-11-19T00:00:00Z"),
		]);
		assert.equal(instants[0]!, f.fin);
	});
});

describe("classement des alertes", () => {
	const base = {
		instant: INSTANT,
		faits: [1, 2, 3],
		maxDateCorpus: MAX_CORPUS,
		famillesFaits: ["ransomware", "cti", "ransomware"],
		repriseApres: null,
		erreurCollecte: false,
		horizonAtteint: true,
		secteurCouvert: true,
	};

	it("une organisation du corpus dans la fenêtre de veille rend l'alerte vraie", () => {
		const v = classerAlerteCpu({ ...base, agent: "organisation-surgissante", datesCorpusOrg: [INSTANT - 10 * JOUR_MS] });
		assert.equal(v.classement, "vraie");
	});

	it("sans incident derrière, l'alerte est fausse ; un bulletin CVE est un motif distinct", () => {
		assert.equal(classerAlerteCpu({ ...base, agent: "organisation-surgissante" }).raison, "aucun_incident_corpus");
		const bulletin = classerAlerteCpu({
			...base,
			agent: "organisation-surgissante",
			famillesFaits: ["vuln", "vuln"],
		});
		assert.deepEqual(bulletin, { classement: "fausse", raison: "bruit_bulletins" });
	});

	it("au-delà de la couverture du corpus, l'alerte est non classable, pas fausse", () => {
		const v = classerAlerteCpu({
			...base,
			agent: "organisation-surgissante",
			instant: Date.parse("2027-01-01T00:00:00Z"),
		});
		assert.deepEqual(v, { classement: "non_classable", raison: "hors_couverture_corpus" });
	});

	it("la bascule sectorielle utilise les incidents du secteur, pas ceux de l'organisation", () => {
		const v = classerAlerteCpu({
			...base,
			agent: "bascule-secteur",
			datesCorpusOrg: [INSTANT],
			datesCorpusSecteur: [],
		});
		assert.equal(v.raison, "aucun_incident_corpus_secteur");
		const vraie = classerAlerteCpu({
			...base,
			agent: "bascule-secteur",
			datesCorpusSecteur: [INSTANT + 3 * JOUR_MS],
		});
		assert.equal(vraie.classement, "vraie");
	});

	it("un secteur sans vérité terrain n'est pas déclaré faux par absence de preuve", () => {
		const v = classerAlerteCpu({
			...base,
			agent: "bascule-secteur",
			secteurCouvert: false,
			datesCorpusSecteur: [],
		});
		assert.deepEqual(v, { classement: "non_classable", raison: "secteur_sans_verite" });
	});

	it("une source qui reprend est une fausse alerte ; une panne confirmée est vraie", () => {
		const source = { ...base, agent: "source-muette" };
		assert.deepEqual(
			classerAlerteCpu({ ...source, repriseApres: INSTANT + 2 * JOUR_MS }),
			{ classement: "fausse", raison: "reprise_transitoire" },
		);
		assert.deepEqual(
			classerAlerteCpu({ ...source, erreurCollecte: true }),
			{ classement: "vraie", raison: "panne_collecte_confirmee" },
		);
		assert.deepEqual(
			classerAlerteCpu({ ...source, horizonAtteint: false }),
			{ classement: "non_classable", raison: "horizon_trop_court" },
		);
	});

	it("estClassable applique la tolérance de veille", () => {
		assert.equal(estClassable(MAX_CORPUS + 35 * JOUR_MS, MAX_CORPUS, 35), true);
		assert.equal(estClassable(MAX_CORPUS + 36 * JOUR_MS, MAX_CORPUS, 35), false);
	});
});

describe("taux de fausses alertes", () => {
	it("ne compte que les alertes classables, et reste null sur du vide", () => {
		const c = (classement: Classement) => ({ classement });
		assert.equal(tauxFaussesAlertes([]), null);
		assert.equal(tauxFaussesAlertes([c("non_classable")]), null);
		assert.equal(tauxFaussesAlertes([c("vraie"), c("fausse"), c("non_classable")]), 50);
		assert.equal(tauxFaussesAlertes([c("fausse"), c("fausse"), c("fausse")]), 100);
	});
});

describe("candidats d'alias", () => {
	it("garde l'entité complète avant ses morceaux, sans doublon ni déchet court", () => {
		assert.deepEqual(
			candidatsAlias("Ville de Tarnos — police municipale"),
			["ville de tarnos — police municipale", "ville de tarnos", "police municipale"],
		);
	});
});
