/**
 * Signaux précoces : chaque comportement nouveau de la mesure est couvert.
 * Aucune date de presse n'est remplacée par un signal non vérifié.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
	construireIncidents,
	type IncidentDatum,
	type IncidentDepartemental,
} from "../src/analyse/benchmark-premier-regard.js";
import {
	mesurerSignauxPrecoces,
	type SignalPrecoce,
} from "../src/analyse/signaux-precoces.js";

function incident(id: string, radar: string, presse?: string): IncidentDatum {
	return {
		id,
		entite: id,
		codeDepartement: "33",
		dates: { radar, ...(presse ? { presseLocale: presse } : {}) },
	};
}

function signal(
	incidentId: string | null,
	piste: SignalPrecoce["piste"],
	date: string,
	nature?: SignalPrecoce["nature"],
): SignalPrecoce {
	return {
		incidentId,
		piste,
		date,
		sourceUrl: "https://exemple.fr/preuve",
		nature: nature ?? "site_revendication",
	};
}

test("une nature incompatible avec sa piste n'est pas un signal", () => {
	const mesure = mesurerSignauxPrecoces(
		[incident("a", "2026-03-01", "2026-01-01")],
		[
			signal("a", "revendication", "2026-02-01", "presse"),
			signal("a", "ct", "2026-02-02", "site_revendication"),
		],
	);
	assert.equal(mesure.toutesPistes.incidentsCouverts, 0);
	assert.equal(mesure.apres.medianeH, 1416);
});

test("un signal rattaché à un incident absent du corpus est ignoré", () => {
	const mesure = mesurerSignauxPrecoces(
		[incident("a", "2026-03-01", "2026-01-01")],
		[signal("inconnu", "revendication", "2026-02-01")],
	);
	assert.equal(mesure.parPiste.revendication.signaux, 0);
	assert.equal(mesure.parPiste.revendication.joursGagnes.total, 0);
});

test("une date invalide n'est jamais retenue", () => {
	const mesure = mesurerSignauxPrecoces(
		[incident("a", "2026-03-01", "2026-01-01")],
		[
			signal("a", "revendication", "2026-02-30"),
			signal("a", "fuites", "2026-2-3", "site_fuite"),
		],
	);
	assert.equal(mesure.parPiste.revendication.incidentsCouverts, 0);
	assert.equal(mesure.parPiste.fuites.incidentsCouverts, 0);
});

test("la date la plus ancienne d'une même piste est retenue", () => {
	const mesure = mesurerSignauxPrecoces(
		[incident("a", "2026-03-01", "2026-01-01")],
		[
			signal("a", "revendication", "2026-02-20"),
			signal("a", "revendication", "2026-02-01"),
		],
	);
	const ligne = mesure.incidents[0];
	assert.equal(ligne?.parPiste.revendication.date, "2026-02-01");
	assert.equal(ligne?.parPiste.revendication.joursGagnes, 28);
	assert.equal(ligne?.meilleur?.joursGagnes, 28);
});

test("un signal postérieur au radar ne gagne aucun jour", () => {
	const mesure = mesurerSignauxPrecoces(
		[incident("a", "2026-03-01", "2026-01-01")],
		[signal("a", "revendication", "2026-04-01")],
	);
	const ligne = mesure.incidents[0];
	assert.equal(ligne?.parPiste.revendication.date, "2026-04-01");
	assert.equal(ligne?.parPiste.revendication.joursGagnes, 0);
	assert.equal(ligne?.parPiste.revendication.delaiApresH, 1416);
	assert.equal(mesure.toutesPistes.incidentsAvecGain, 0);
});

test("un signal avant la presse produit un délai négatif", () => {
	const mesure = mesurerSignauxPrecoces(
		[incident("a", "2026-03-01", "2026-01-10")],
		[signal("a", "revendication", "2026-01-09")],
	);
	assert.equal(mesure.incidents[0]?.parPiste.revendication.delaiApresH, -24);
	assert.equal(mesure.incidents[0]?.parPiste.revendication.joursGagnes, 51);
});

test("les pistes sans observation ne gagnent aucun jour et gardent le délai avant", () => {
	const mesure = mesurerSignauxPrecoces(
		[incident("a", "2026-03-01", "2026-01-01")],
		[signal("a", "revendication", "2026-02-01")],
	);
	for (const piste of ["ct", "dns"] as const) {
		const bilan = mesure.parPiste[piste];
		assert.equal(bilan.signaux, 0);
		assert.equal(bilan.joursGagnes.total, 0);
		assert.equal(bilan.joursGagnes.medianeCouverts, null);
		assert.equal(bilan.delaiApresH.mediane, 1416);
	}
});

test("la piste dominante cumule le plus de jours gagnés", () => {
	const mesure = mesurerSignauxPrecoces(
		[incident("a", "2026-03-01", "2026-01-01"), incident("b", "2026-03-01", "2026-01-01")],
		[
			signal("a", "revendication", "2026-02-20"),
			signal("b", "revendication", "2026-02-18"),
			signal("a", "fuites", "2026-02-01", "site_fuite"),
		],
	);
	assert.equal(mesure.pisteDominante, "fuites");
	assert.equal(mesure.parPiste.fuites.joursGagnes.total, 28);
	assert.equal(mesure.parPiste.revendication.joursGagnes.total, 20);
});

test("les incidents sans date de presse n'entrent pas dans la médiane après", () => {
	const mesure = mesurerSignauxPrecoces(
		[
			incident("a", "2026-03-01", "2026-01-01"),
			incident("b", "2026-03-01"),
			incident("c", "2026-03-01", "2026-02-01"),
		],
		[signal("b", "revendication", "2026-02-01")],
	);
	assert.equal(mesure.avant.n, 2);
	assert.equal(mesure.apres.n, 2);
	assert.equal(mesure.incidents[1]?.parPiste.revendication.delaiApresH, null);
	assert.equal(mesure.incidents[1]?.meilleur?.joursGagnes, 28);
});

function lireCorpusReel(): IncidentDatum[] {
	const reference = JSON.parse(
		readFileSync(new URL("../../../bench/fixtures/corpus-reference-na.json", import.meta.url), "utf8"),
	) as Parameters<typeof construireIncidents>[0];
	const departementaux = readdirSync(new URL("../../../bench/corpus/", import.meta.url))
		.filter((nom) => /^incidents-.*\.jsonl$/.test(nom))
		.sort()
		.flatMap((nom) =>
			readFileSync(new URL(`../../../bench/corpus/${nom}`, import.meta.url), "utf8")
				.split("\n")
				.filter((ligne) => ligne.trim())
				.map((ligne) => JSON.parse(ligne) as IncidentDepartemental),
		);
	return construireIncidents(reference, departementaux, 100);
}

function lireSignauxReels(): SignalPrecoce[] {
	return readFileSync(
		new URL("../../../bench/corpus/signaux-precoces.jsonl", import.meta.url),
		"utf8",
	)
		.split("\n")
		.filter((ligne) => ligne.trim())
		.map((ligne) => JSON.parse(ligne) as SignalPrecoce);
}

test("le corpus réel publie l'avant/après et la piste dominante mesurés", () => {
	const mesure = mesurerSignauxPrecoces(lireCorpusReel(), lireSignauxReels());
	assert.equal(mesure.total, 100);
	assert.deepEqual(mesure.avant, { n: 77, medianeH: 8520 });
	assert.deepEqual(mesure.apres, { n: 77, medianeH: 8160 });
	assert.equal(mesure.pisteDominante, "revendication");

	const revendication = mesure.parPiste.revendication;
	assert.equal(revendication.incidentsCouverts, 3);
	assert.equal(revendication.joursGagnes.total, 1496);
	assert.equal(revendication.joursGagnes.medianeCouverts, 411);
	assert.equal(revendication.joursGagnes.max, 813);
	assert.equal(revendication.delaiApresH.mediane, 8160);

	const fuites = mesure.parPiste.fuites;
	assert.equal(fuites.incidentsCouverts, 2);
	assert.equal(fuites.joursGagnes.total, 217);
	assert.equal(fuites.delaiApresH.mediane, 8520);

	for (const piste of ["ct", "dns"] as const) {
		assert.equal(mesure.parPiste[piste].joursGagnes.total, 0);
		assert.equal(mesure.parPiste[piste].delaiApresH.mediane, 8520);
	}
	assert.equal(mesure.toutesPistes.incidentsCouverts, 5);
	assert.equal(mesure.toutesPistes.joursGagnes.total, 1713);
	assert.equal(mesure.toutesPistes.joursGagnes.medianeCouverts, 272);
});

test("le rapport publié correspond aux chiffres mesurés", () => {
	const rapport = readFileSync(
		new URL("../../../docs/signaux-precoces.md", import.meta.url),
		"utf8",
	);
	const resultats = JSON.parse(
		readFileSync(new URL("../../../bench/results/signaux-precoces.json", import.meta.url), "utf8"),
	) as { avant: { medianeH: number }; apres: { medianeH: number }; pisteDominante: string };
	assert.equal(resultats.avant.medianeH, 8520);
	assert.equal(resultats.apres.medianeH, 8160);
	assert.equal(resultats.pisteDominante, "revendication");
	assert.match(rapport, /Piste qui apporte le plus de jours gagnés/);
	assert.match(rapport, /Médiane globale/);
	assert.match(rapport, /15 jours gagnés/);
	assert.match(rapport, /CT et DNS : 0 j/);
});
