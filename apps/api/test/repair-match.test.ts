/**
 * Régressions des constats M4/M9/M10/M11/M12 + J12 : décision à verdict
 * explicite, invalidation de l'index des sigles, ambiguïté du gazetteer,
 * normalisation unique et versions historiques non rejouables.
 *
 * Aucun appel réseau : le modèle de décision est injecté, l'index des sigles
 * est exercé sur la base de test créée par `test/run.ts`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { query } from "../src/db.js";
import { normalize as normalizeCore } from "../src/match/core.js";
import {
	chooseOrganization,
	chooseOrganizationVerdict,
	confirmOrganization,
	confirmOrganizationVerdict,
	type FournisseurDecision,
} from "../src/match/decide.js";
import { buildGazetteer, normaliser, resoudre, type GazetteerRow } from "../src/match/gazetteer.js";
import { GENERIC_TOKENS, normalizeNom } from "../src/match/normalisation.js";
import { elimineHomonyme, jetonsDiscriminants } from "../src/match/regles-precision.js";
import { candidatsSigleDepuisIndex, resetIndexSigles } from "../src/match/sigles.js";
import {
	MOTEUR_RATTACHEMENT,
	VERSIONS_CONNUES,
	decrireVersion,
	resoudreAvecVersion,
} from "../src/match/versions.js";

const TEXTE = "Rançongiciel chez Alpha Joaillerie, une fuite de données confirmée ce matin";
const CANDIDATS = [{ id: 7, name: "Alpha Joaillerie" }, { id: 9, name: "Beta Papeterie" }];

function fournisseurNoul(probabilite: number): FournisseurDecision {
	return async () => ({ answers: { mention: { noul: probabilite } } });
}

function fournisseurChoix(choice: string, confidence: number): FournisseurDecision {
	return async () => ({ answers: { organization: { choice, confidence } } });
}
test("M4 — confirmOrganizationVerdict distingue oui, non, indecis et indisponible", async () => {
	assert.equal(await confirmOrganizationVerdict(TEXTE, "Alpha Joaillerie", fournisseurNoul(0.97)), "oui");
	assert.equal(await confirmOrganizationVerdict(TEXTE, "Alpha Joaillerie", fournisseurNoul(0.02)), "non");
	assert.equal(await confirmOrganizationVerdict(TEXTE, "Alpha Joaillerie", fournisseurNoul(0.55)), "indecis");
	// Sans réponse, avec une réponse mal formée ou une probabilité hors bornes :
	// la défaillance du service n'est pas un refus de l'organisation.
	assert.equal(await confirmOrganizationVerdict(TEXTE, "Alpha Joaillerie", async () => null), "indisponible");
	assert.equal(
		await confirmOrganizationVerdict(TEXTE, "Alpha Joaillerie", async () => ({ answers: {} })),
		"indisponible",
	);
	assert.equal(
		await confirmOrganizationVerdict(TEXTE, "Alpha Joaillerie", async () => {
			throw new Error("quota");
		}),
		"indisponible",
	);
	assert.equal(
		await confirmOrganizationVerdict(TEXTE, "Alpha Joaillerie", fournisseurNoul(1.4)),
		"indisponible",
	);
	assert.equal(await confirmOrganization(TEXTE, "Alpha Joaillerie", fournisseurNoul(0.97)), true);
	assert.equal(await confirmOrganization(TEXTE, "Alpha Joaillerie", fournisseurNoul(0.02)), false);
	assert.equal(await confirmOrganization(TEXTE, "Alpha Joaillerie", fournisseurNoul(0.55)), null);
});

test("M4 — chooseOrganizationVerdict distingue le refus explicite de l'indisponibilité", async () => {
	assert.equal(await chooseOrganizationVerdict(TEXTE, CANDIDATS, fournisseurChoix("org_9", 0.96)), "oui");
	assert.equal(await chooseOrganizationVerdict(TEXTE, CANDIDATS, fournisseurChoix("aucune", 0.95)), "non");
	assert.equal(await chooseOrganizationVerdict(TEXTE, CANDIDATS, fournisseurChoix("org_7", 0.61)), "indecis");
	assert.equal(await chooseOrganizationVerdict(TEXTE, CANDIDATS, async () => null), "indisponible");
	assert.equal(
		await chooseOrganizationVerdict(TEXTE, CANDIDATS, fournisseurChoix("org_404", 0.99)),
		"indisponible",
	);
	assert.equal(
		await chooseOrganizationVerdict(TEXTE, CANDIDATS, fournisseurChoix("org_7", Number.NaN)),
		"indisponible",
	);
	assert.equal(await chooseOrganization(TEXTE, CANDIDATS, fournisseurChoix("org_9", 0.96)), 9);
	assert.equal(await chooseOrganization(TEXTE, CANDIDATS, fournisseurChoix("org_7", 0.61)), null);
	assert.equal(await chooseOrganization(TEXTE, CANDIDATS, fournisseurChoix("aucune", 0.95)), null);
});

test("M9 — resetIndexSigles invalide le snapshot chargé après un import du registre", async () => {
	const sigle = "ZQX";
	resetIndexSigles();
	assert.deepEqual(await candidatsSigleDepuisIndex(sigle), [], "sigle inconnu au premier chargement");

	const ins = await query<{ id: number }>(
		"INSERT INTO org (name, slug, kind) VALUES ($1, $2, 'entreprise') RETURNING id",
		["ZQX Référence Repair", "zqx-reference-repair"],
	);
	const orgId = ins.rows[0]!.id;
	try {
		await query(
			"INSERT INTO org_alias (org_id, alias, source, status) VALUES ($1, $2, 'sirene-usuelle', 'active')",
			[orgId, sigle],
		);
		// Le snapshot reste périmé tant que le référentiel n'a pas été rechargé.
		assert.deepEqual(await candidatsSigleDepuisIndex(sigle), []);
		resetIndexSigles();
		assert.deepEqual((await candidatsSigleDepuisIndex(sigle)).map((c) => c.orgId), [orgId]);
	} finally {
		resetIndexSigles();
	}
});

function gazetteerDeuxAlias() {
	const rows: GazetteerRow[] = [
		{
			org_id: 1,
			name: "Alpha Joaillerie",
			kind: "entreprise",
			dept: null,
			city: null,
			sector: "commerce",
			alias: "alpha joaillerie",
			source: "sirene-nom",
		},
		{
			org_id: 2,
			name: "Beta Papeterie",
			kind: "entreprise",
			dept: null,
			city: null,
			sector: "commerce",
			alias: "beta papeterie",
			source: "sirene-nom",
		},
	];
	return buildGazetteer(rows);
}

test("M10 — deux alias distincts à égalité rendent ambigu avec les deux candidats", () => {
	const r = resoudre(gazetteerDeuxAlias(), "Attaque chez Alpha Joaillerie, Beta Papeterie aussi touché");
	assert.equal(r.org, null);
	assert.equal(r.reason, "ambigu");
	assert.deepEqual(r.tied.map((o) => o.id).sort((a, b) => a - b), [1, 2]);
});

test("M10 — seul un marqueur d'attribution explicite départage par la position", () => {
	const r = resoudre(gazetteerDeuxAlias(), "La société Alpha Joaillerie visée, la Beta Papeterie aussi");
	assert.equal(r.org?.id, 2);
	assert.equal(r.alias, "beta papeterie");
	assert.deepEqual(r.tied, []);
});

test("M11 — une seule normalisation, y compris Œ/Æ majuscules", () => {
	const texte = "ŒUVRE ÆTHER — œuvre æther";
	const attendu = "oeuvre aether oeuvre aether";
	assert.equal(normalizeNom(texte), attendu);
	assert.equal(normalizeCore(texte), attendu);
	assert.deepEqual(normaliser(texte), attendu.split(" "));
	assert.deepEqual(jetonsDiscriminants("ŒUVRE ÆTHER"), ["oeuvre", "aether"]);
	assert.equal(elimineHomonyme("ŒUVRE ÆTHER", "oeuvre aether"), false);
	assert.ok(GENERIC_TOKENS.has("com"));
});

test("M12/J12 — le moteur courant est @4, @2 et @3 ne sont pas rejouables", () => {
	const gaz = buildGazetteer([
		{
			org_id: 1,
			name: "Commune de Tarnos",
			kind: "collectivite",
			dept: "40",
			city: "Tarnos",
			sector: "commune",
			alias: "Ville de Tarnos",
		},
	]);
	const texte = "La Ville de Tarnos a été victime d'un rançongiciel";
	assert.equal(MOTEUR_RATTACHEMENT, "gazetteer@4");
	assert.equal(VERSIONS_CONNUES.includes(MOTEUR_RATTACHEMENT), true);
	assert.equal(resoudreAvecVersion(gaz, texte).org?.id, 1);
	for (const version of ["gazetteer@2", "gazetteer@3"] as const) {
		assert.equal(VERSIONS_CONNUES.includes(version), false);
		assert.throws(() => resoudreAvecVersion(gaz, texte, version), /n'est pas rejouable/);
		assert.match(decrireVersion(version), /non rejouable/);
	}
});
