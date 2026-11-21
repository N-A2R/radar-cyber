/**
 * Rapport d'anticipation : reproductibilité, zéro franc et cas limites.
 *
 * Un rapport généré qui change sans que les données changent ne vaut rien ;
 * un rapport qui transforme du bruit en signal ne vaut pas mieux. Ces tests
 * couvrent les deux risques, plus les entrées vides et malformées.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
	ErreurRapportAnticipation,
	detecterRuptures,
	evaluerEvenement,
	extraireJetons,
	genererRapport,
	lireCorpus,
	lireCorpusJsonl,
	lireInstantanes,
	type EvenementInstantane,
	type IncidentCorpus,
	type Instantane,
} from "../src/analyse/rapport-anticipation.js";

const EMPREINTES = { corpus: "corpus-test", instantane: "instantane-test" };

function incident(surcharge: Partial<IncidentCorpus> = {}): IncidentCorpus {
	return {
		id: "test-001",
		entite: "Ymed (éditeur de la plateforme Sooncare)",
		commune: "Bègles",
		dateIncident: "2026-04-06",
		datePublique: "2026-04-09",
		type: "fuite",
		...surcharge,
	};
}

function evenement(surcharge: Partial<EvenementInstantane> = {}): EvenementInstantane {
	return {
		id: 1,
		family: "cti",
		assertion_type: "ambient_signal",
		titre: "Veille internationale sans rapport avec l'entité",
		valid_at: "2026-03-10T00:00:00.000Z",
		source_id: "cat-cti",
		org_id: null,
		...surcharge,
	};
}

function instantane(surcharge: Partial<Instantane> = {}): Instantane {
	return {
		incident: {
			id: "test-001",
			entite: "Ymed (éditeur de la plateforme Sooncare)",
			dateReference: "2026-04-06",
			typeReference: "dateIncident",
		},
		j21: "2026-03-16",
		fenetre: { debut: "2026-02-24", fin: "2026-03-16", jours: 21 },
		comptes: {
			evenements_avant_j21: 100,
			evenements_fenetre: 0,
			sources_actives: 0,
			organisations_citees: 0,
		},
		evenements: [],
		sources_actives: [],
		organisations_citees: [],
		...surcharge,
	};
}

function rapport(donnees: { corpus?: IncidentCorpus[]; instantanes?: Instantane[] } = {}) {
	return genererRapport({
		corpus: donnees.corpus ?? [incident()],
		instantanes: donnees.instantanes ?? [instantane()],
		empreintes: EMPREINTES,
	});
}

test("les jetons normalisent accents, ponctuation et mots-outils", () => {
	assert.deepEqual(extraireJetons("Mairie de Marennes-Hiers-Brouage"), ["marennes", "hiers", "brouage"]);
	assert.deepEqual(extraireJetons("Ymed (éditeur de la plateforme Sooncare)"), ["ymed", "editeur", "plateforme", "sooncare"]);
	assert.deepEqual(extraireJetons("Ville de Tarnos"), ["tarnos"]);
});

test("une mention nominative est un signal, un mot générique ne l'est pas", () => {
	const base = instantane();
	const direct = evaluerEvenement(
		evenement({ titre: "Ymed et Sooncare : incident de sécurité" }),
		["ymed", "sooncare"],
		["begles"],
		undefined,
		base,
	);
	assert.equal(direct.force, "fort");
	assert.equal(direct.avanceJours, 27);

	const generique = evaluerEvenement(
		evenement({ titre: "Police municipale : une alerte" }),
		["police"],
		[],
		undefined,
		base,
	);
	assert.equal(generique.force, "bruit");

	const commune = evaluerEvenement(
		evenement({ titre: "Travaux à Bègles" }),
		["ymed"],
		["begles"],
		undefined,
		base,
	);
	assert.equal(commune.force, "faible");
	assert.equal(commune.type, "commune");
});

test("un indicateur technique sans cible reste un candidat, pas une preuve", () => {
	const candidat = evaluerEvenement(
		evenement({ assertion_type: "technical_indicator", titre: "Indicateur découvert sur un serveur" }),
		["ymed"],
		[],
		undefined,
		instantane(),
	);
	assert.equal(candidat.force, "faible");
	assert.equal(candidat.nature, "indicateur");
});

test("un rattachement sans recoupement est du bruit, pas un signal", () => {
	const bruit = evaluerEvenement(
		evenement({
			org_id: 482872,
			titre: "Kritieke SQL-injectie in GeoTools open source Java-bibliotheek",
		}),
		["espelette"],
		[],
		{ id: 482872, name: "OPEN SOURCE" },
		instantane(),
	);
	assert.equal(bruit.force, "bruit");
	assert.equal(bruit.type, "rattachement");
});

test("les ruptures ne se déclenchent que sur des événements de l'entité", () => {
	const base = instantane();
	assert.deepEqual(detecterRuptures(base, []), []);

	const trois = [10, 12, 14].map((jour) =>
		evenement({ id: jour, family: "cti", valid_at: `2026-03-${jour}T00:00:00.000Z` }),
	);
	const rafale = detecterRuptures(base, trois);
	assert.equal(rafale.length, 1);
	assert.equal(rafale[0]?.detecteur, "rafale");

	const uneParFamille = [
		evenement({ id: 1, family: "cti" }),
		evenement({ id: 2, family: "leaks", valid_at: "2026-03-15T00:00:00.000Z" }),
	];
	const changement = detecterRuptures(base, uneParFamille);
	assert.equal(changement.length, 1);
	assert.equal(changement[0]?.detecteur, "changement-nature");
});

test("un signal nominatif change le verdict et alimente la synthèse", () => {
	const resultat = rapport({
		instantanes: [
			instantane({
				comptes: { evenements_avant_j21: 10, evenements_fenetre: 1, sources_actives: 1, organisations_citees: 0 },
				evenements: [evenement({ titre: "Ymed Sooncare victime d'une attaque" })],
				sources_actives: [{ id: "cat-cti" }],
			}),
		],
	});
	assert.equal(resultat.dossiers[0]?.verdict, "signal");
	assert.equal(resultat.resume.avecSignal, 1);
	assert.equal(resultat.resume.partPct, 100);
	assert.equal(resultat.resume.avanceMedianeJours, 27);
});

test("un corpus vide donne une mesure vide, pas un pourcentage", () => {
	const resultat = rapport({ corpus: [], instantanes: [] });
	assert.match(resultat.markdown, /La mesure est \*\*vide\*\*, pas nulle/);
	assert.equal(resultat.resume.faits, 0);
	assert.equal(resultat.resume.partPct, 0);
});

test("une fenêtre vide produit un « rien » explicite et aucune division par zéro", () => {
	const resultat = rapport();
	assert.match(resultat.markdown, /rien.*fenêtre vide/);
	assert.equal(resultat.stats.fenetresVides, 1);
	assert.equal(resultat.resume.avanceMedianeJours, null);
	assert.match(resultat.markdown, /\*\*Sources actives\*\* \(0\) : aucune/);
});

test("les incohérences de comptes sont signalées sans invalider le document", () => {
	const resultat = rapport({
		instantanes: [instantane({
			comptes: { evenements_avant_j21: 10, evenements_fenetre: 7, sources_actives: 0, organisations_citees: 0 },
		})],
	});
	assert.ok(resultat.anomalies.some((a) => a.code === "COMPTE_EVENEMENTS"));
	assert.match(resultat.markdown, /COMPTE_EVENEMENTS/);
});

test("les entrées malformées s'arrêtent avec un code explicite", () => {
	assert.throws(() => lireCorpus("{"), (e: unknown) =>
		e instanceof ErreurRapportAnticipation && e.code === "CORPUS_INVALIDE");
	assert.throws(
		() => lireCorpus(JSON.stringify({ incidents: [{ id: "x", entite: "a" }, { id: "x", entite: "b" }] })),
		(e: unknown) => e instanceof ErreurRapportAnticipation && e.code === "INCIDENT_DUPLIQUE",
	);
	assert.throws(() => lireInstantanes("{pas du json"), (e: unknown) =>
		e instanceof ErreurRapportAnticipation && e.code === "LIGNE_INVALIDE");
	assert.throws(() => rapport({ instantanes: [] }), (e: unknown) =>
		e instanceof ErreurRapportAnticipation && e.code === "INSTANTANE_MANQUANT");
	assert.throws(
		() => rapport({ corpus: [incident({ dateIncident: null, datePublique: null })] }),
		(e: unknown) => e instanceof ErreurRapportAnticipation && e.code === "DATE_MANQUANTE",
	);
});

test("le corpus de couverture JSONL est lu sans inventer de date", () => {
	const corpus = lireCorpusJsonl(
		[
			JSON.stringify({ id: "a", organisation: "Mairie de X", date_publication: "2026-01-10", departement: "Gironde" }),
			JSON.stringify({ id: "b", organisation: "Y", date_incident: "2026-02-01", date_publication: "2026-02-03" }),
		].join("\n"),
	);
	assert.equal(corpus.length, 2);
	assert.equal(corpus[0]?.dateIncident, null);
	assert.equal(corpus[0]?.datePublique, "2026-01-10");
	assert.equal(corpus[1]?.dateIncident, "2026-02-01");
	assert.throws(() => lireCorpusJsonl("{"), (e: unknown) =>
		e instanceof ErreurRapportAnticipation && e.code === "CORPUS_INVALIDE");
});

test("l'instantané ne contient aucun événement postérieur à J-21 sur valid_at", () => {
	const racine = new URL("../../../", import.meta.url);
	const instantanes = lireInstantanes(readFileSync(new URL("bench/anticipation/J-21.jsonl", racine), "utf8"));
	assert.equal(instantanes.length, 50);
	for (const instantane of instantanes) {
		const fin = new Date(`${instantane.j21}T00:00:00.000Z`).getTime() + 86_400_000;
		const debut = new Date(`${instantane.fenetre.debut}T00:00:00.000Z`).getTime();
		for (const evenement of instantane.evenements) {
			const validAt = new Date(evenement.valid_at).getTime();
			assert.ok(
				validAt >= debut && validAt < fin,
				`${instantane.incident.id} : ${evenement.valid_at} hors de la fenêtre J-21`,
			);
		}
	}
});

test("le document publié est exactement celui que le script régénère", () => {
	const racine = new URL("../../../", import.meta.url);
	const corpusTexte = readFileSync(new URL("bench/couverture/incidents.jsonl", racine), "utf8");
	const snapshotTexte = readFileSync(new URL("bench/anticipation/J-21.jsonl", racine), "utf8");
	const publie = readFileSync(new URL("docs/anticipation.md", racine), "utf8");
	const resultat = genererRapport({
		corpus: lireCorpusJsonl(corpusTexte),
		instantanes: lireInstantanes(snapshotTexte),
		empreintes: {
			corpus: createHash("sha256").update(corpusTexte).digest("hex"),
			instantane: createHash("sha256").update(snapshotTexte).digest("hex"),
		},
	});
	assert.equal(resultat.dossiers.length, 50);
	assert.equal(resultat.resume.avecSignal, 0);
	assert.match(resultat.markdown, /Incidents avec signal retenu \| 0 \/ 50/);
	assert.match(resultat.markdown, /Incidents sans signal retenu \| 50 \/ 50/);
	assert.equal(resultat.markdown, publie);
});
