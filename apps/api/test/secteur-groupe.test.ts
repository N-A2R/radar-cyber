import { test } from "node:test";
import assert from "node:assert/strict";
import {
	SECTEURS_GROUPE,
	classerSecteurGroupe,
	mesurerCouvertureSecteurs,
	type SecteurGroupe,
} from "../src/analyse/secteur-groupe.js";

// Valeurs réellement présentes dans `org.sector` (relevées sur la base de test).
const SECTEURS_REFERENTIEL = [
	"immobilier", "commerce", "activites-specialisees", "agriculture", "construction",
	"culture-loisirs", "restauration-hotellerie", "services-entreprises", "sante-social",
	"associations", "transport-logistique", "finance-assurance", "services-personnels",
	"industrie", "enseignement", "numerique", "energie-eau-dechets", "agroalimentaire",
	"autre", "sante", "ecole", "commune", "administration", "pharmacie",
	"particulier-employeur", "college", "ssiad", "lycee", "laboratoire", "foyer",
	"hopital", "centre-sante", "epci", "departement", "region",
];

test("chaque valeur du référentiel est classée, sans tomber sur le défaut", () => {
	for (const secteur of SECTEURS_REFERENTIEL) {
		const r = classerSecteurGroupe({ sector: secteur });
		assert.ok(SECTEURS_GROUPE.includes(r.secteur), `${secteur} → groupe inconnu`);
		assert.equal(r.source, "secteur", `${secteur} n'a pas été reconnu`);
	}
});

test("les neuf groupes sont atteignables depuis le vocabulaire fin", () => {
	const attendus: Record<string, SecteurGroupe> = {
		agriculture: "agroalimentaire",
		industrie: "industrie",
		construction: "construction",
		commerce: "commerce",
		"hopital": "sante",
		ecole: "enseignement",
		commune: "public",
		numerique: "services",
		associations: "autre",
	};
	for (const [secteur, groupe] of Object.entries(attendus)) {
		assert.equal(classerSecteurGroupe({ sector: secteur }).secteur, groupe, secteur);
	}
	assert.deepEqual([...new Set(Object.values(attendus))].sort(), [...SECTEURS_GROUPE].sort());
});

test("un code NAF ponctué classe quand le secteur manque", () => {
	const r = classerSecteurGroupe({ sector: null, naf: "62.01Z" });
	assert.deepEqual(r, { secteur: "services", source: "naf", confiance: 0.8 });
});

test("une division NAF inconnue n'est pas devinée", () => {
	const r = classerSecteurGroupe({ sector: null, naf: "00.00Z" });
	assert.deepEqual(r, { secteur: "autre", source: "defaut", confiance: 0.2 });
});

test("le type d'établissement ne classe que les trois cas qu'il porte", () => {
	assert.deepEqual(classerSecteurGroupe({ kind: "collectivite" }), {
		secteur: "public", source: "kind", confiance: 0.5,
	});
	assert.deepEqual(classerSecteurGroupe({ kind: "sante" }), {
		secteur: "sante", source: "kind", confiance: 0.5,
	});
	assert.deepEqual(classerSecteurGroupe({ kind: "enseignement" }), {
		secteur: "enseignement", source: "kind", confiance: 0.5,
	});
	// « entreprise » n'est pas un secteur : on ne devine pas.
	assert.deepEqual(classerSecteurGroupe({ kind: "entreprise" }), {
		secteur: "autre", source: "defaut", confiance: 0.2,
	});
});

test("un secteur connu gagne sur un NAF contradictoire", () => {
	const r = classerSecteurGroupe({ sector: "hopital", naf: "47.11B", kind: "entreprise" });
	assert.equal(r.secteur, "sante");
	assert.equal(r.source, "secteur");
});

test("un secteur inconnu laisse la place au NAF puis au type", () => {
	assert.deepEqual(classerSecteurGroupe({ sector: "non_reconnu", naf: "85.31Z" }), {
		secteur: "enseignement", source: "naf", confiance: 0.8,
	});
	assert.deepEqual(classerSecteurGroupe({ sector: "non_reconnu", kind: "collectivite" }), {
		secteur: "public", source: "kind", confiance: 0.5,
	});
});

test("« autre » n'est jamais publié comme une affirmation établie", () => {
	const cas = [
		{ sector: "associations" },
		{ naf: "94.11Z" },
		{ kind: "entreprise" },
		{},
	];
	for (const org of cas) {
		const r = classerSecteurGroupe(org);
		assert.equal(r.secteur, "autre");
		assert.ok(r.confiance < 0.7, `${r.source} donne une confiance trop forte`);
	}
});

test("la mesure nomme les secteurs vides au lieu de les masquer", () => {
	const rapport = mesurerCouvertureSecteurs([
		{ secteur: "commerce" }, { secteur: "commerce" },
		{ secteur: "sante" }, { secteur: null },
	]);
	assert.equal(rapport.total, 4);
	assert.equal(rapport.classes, 3);
	assert.equal(rapport.couverture, 0.75);
	assert.equal(rapport.parSecteur[0]?.secteur, "commerce");
	assert.equal(rapport.parSecteur[0]?.part, 0.5);
	assert.deepEqual(rapport.vides, [
		"agroalimentaire", "industrie", "construction", "enseignement", "public", "services", "autre",
	]);
});

test("une mesure sur zéro ligne ne divise pas par zéro", () => {
	const rapport = mesurerCouvertureSecteurs([]);
	assert.equal(rapport.couverture, 0);
	assert.equal(rapport.parSecteur.length, 9);
	assert.deepEqual(rapport.vides, [...SECTEURS_GROUPE]);
	for (const s of rapport.parSecteur) assert.equal(s.part, 0);
});
