/**
 * Audit interne — cohérence du taux global de couverture avec les mesures par
 * département.
 *
 * Le chiffre global est celui que `scripts/couverture-globale.mts` publie pour
 * le corpus témoin : même fenêtre et même arrondi au dixième de point que la
 * mesure figée versée dans `bench/results`. Les
 * mesures par département sont obtenues en rejoignant cette mesure, incident
 * par incident, avec le département du corpus — exactement comme la section
 * `parDepartement` de l'API publique. Un taux global modifié, un incident
 * redistribué ou un incident hors fenêtre compté deux fois doit faire échouer
 * ce test.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const CORPUS = fileURLToPath(
	new URL("../../../bench/fixtures/corpus-reference-na.json", import.meta.url),
);
/** Publication figée du même corpus, tenue comme chiffre global de référence. */
const MESURE = fileURLToPath(
	new URL("../../../bench/results/couverture-2026-11-15-gazetteer4.json", import.meta.url),
);

const TOLERANCE_POINTS = 0.1;

type Motif = "vu" | "pas_admis" | "pas_rattache" | "hors_fenetre";
type Taux = { vus: number; total: number; taux: number };
type LigneDepartement = Taux & { departement: string };

/** Même arrondi que `scripts/couverture-globale.mts` : au dixième de point. */
function taux(vus: number, total: number): number {
	return total === 0 ? 0 : Math.round((vus / total) * 1000) / 10;
}

function lecture(): { global: Taux; dansFenetre: number; parDepartement: LigneDepartement[] } {
	const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as {
		incidents: Array<{ id: string; departement: string | null }>;
	};
	const mesure = JSON.parse(readFileSync(MESURE, "utf8")) as {
		couverture: Taux;
		incidents: Array<{ id: string; motif: Motif }>;
	};
	const departements = new Map(corpus.incidents.map((i) => [i.id, i.departement]));

	const groupes = new Map<string, { vus: number; total: number }>();
	for (const incident of mesure.incidents) {
		if (incident.motif === "hors_fenetre") continue;
		const departement = departements.get(incident.id) ?? "non renseigné";
		const ligne = groupes.get(departement) ?? { vus: 0, total: 0 };
		ligne.total += 1;
		if (incident.motif === "vu") ligne.vus += 1;
		groupes.set(departement, ligne);
	}

	return {
		global: mesure.couverture,
		dansFenetre: mesure.incidents.filter((i) => i.motif !== "hors_fenetre").length,
		parDepartement: [...groupes.entries()]
			.map(([departement, ligne]) => ({
				departement,
				...ligne,
				taux: taux(ligne.vus, ligne.total),
			}))
			.sort((a, b) => a.departement.localeCompare(b.departement, "fr")),
	};
}

/** La somme pondérée des départements doit reproduire le global, au dixième près. */
function verifierCoherence(global: Taux, parDepartement: readonly LigneDepartement[]): void {
	const total = parDepartement.reduce((somme, ligne) => somme + ligne.total, 0);
	const vus = parDepartement.reduce((somme, ligne) => somme + ligne.vus, 0);
	assert.equal(total, global.total, "les départements doivent couvrir tous les incidents de la fenêtre");
	assert.equal(vus, global.vus, "les départements doivent couvrir tous les incidents vus");
	for (const ligne of parDepartement) {
		assert.equal(ligne.taux, taux(ligne.vus, ligne.total), `taux du département ${ligne.departement}`);
	}
	const reconstitue = total === 0 ? 0 : parDepartement.reduce((somme, ligne) => somme + ligne.taux * ligne.total, 0) / total;
	assert.ok(
		Math.abs(reconstitue - global.taux) <= TOLERANCE_POINTS,
		`couverture incohérente : global ${global.taux} %, somme des départements ${Math.round(reconstitue * 10) / 10} %`,
	);
}

describe("cohérence de la couverture globale et par département", () => {
	const { global, dansFenetre, parDepartement } = lecture();

	it("le taux global est bien celui des incidents de la fenêtre", () => {
		assert.ok(parDepartement.length > 1, "plusieurs départements mesurés");
		assert.equal(global.taux, taux(global.vus, global.total));
		// Aucun incident hors fenêtre ne doit entrer dans la décomposition.
		assert.equal(global.total, dansFenetre);
	});

	it("la somme des départements égale le global à 0,1 point près", () => {
		verifierCoherence(global, parDepartement);
	});

	it("un département divergent fait échouer le contrôle", () => {
		const divergents = parDepartement.map((ligne, index) =>
			index === 0 ? { ...ligne, vus: ligne.vus + 1, taux: taux(ligne.vus + 1, ligne.total) } : ligne,
		);
		assert.throws(() => verifierCoherence(global, divergents), /couverture incohérente|incidents vus/);
	});
});
