/**
 * Écriture de l'inventaire CT sur la base de test dédiée du lanceur.
 * Les données sont marquées et supprimées en fin de fichier : aucun test ne
 * touche à la base `radar` ni aux lignes d'une autre collecte.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query } from "../src/db.js";
import { construireRapport, enregistrerInventaire } from "../src/ctlogs/stockage.js";
import type { SousDomaineInventaire, Suspect, Tentative } from "../src/ctlogs/inventaire.js";

const TAG = `ct${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const DOMAINE = `${TAG}.exemple.fr`;
const SOUS_DOMAINE = `www.${DOMAINE}`;
const COLLECTE_LE = "2026-11-25T12:00:00.000Z";

const sousDomaine: SousDomaineInventaire = {
	sous_domaine: SOUS_DOMAINE,
	domaine: DOMAINE,
	organisation: "Organisation de test",
	source: "crt.sh",
	premiere_vue: "2025-03-04T05:06:07.000Z",
	certificat_id: `${TAG}-cert`,
	emetteur: "CA de test",
};

const suspect: Suspect = {
	domaine: `${TAG}-lookalike.fr`,
	organisation_cible: "Organisation de test",
	distance: 1,
	motif: "lookalike-distance-1-recent",
	premiere_vue: "2026-11-01T00:00:00.000Z",
	source: "certspotter",
	certificat_id: `${TAG}-suspect-cert`,
	sous_domaines_observes: 1,
};

const tentatives: Tentative[] = [
	{ fournisseur: "crt.sh", domaine: DOMAINE, statut: 200, ok: true, erreur: null, dureeMs: 10 },
	{ fournisseur: "certspotter", domaine: DOMAINE, statut: 429, ok: false, erreur: "HTTP 429", dureeMs: 10 },
];

const rapport = construireRapport({
	collecteLe: COLLECTE_LE,
	domainesInterroges: 2,
	sousDomaines: 1,
	suspects: 1,
	variantesInterrogees: 3,
	tentatives,
});

test("le rapport publié distingue le taux d'échec global et par fournisseur", () => {
	assert.equal(rapport.domaines_interroges, 2);
	assert.equal(rapport.sous_domaines, 1);
	assert.equal(rapport.suspects, 1);
	assert.deepEqual(rapport.taux_echec, { total: 2, echecs: 1, taux: 0.5 });
	assert.deepEqual(rapport.par_fournisseur["crt.sh"], { total: 1, echecs: 0, taux: 0 });
	assert.deepEqual(rapport.par_fournisseur["certspotter"], { total: 1, echecs: 1, taux: 1 });
	assert.equal(rapport.variantes_interrogees, 3);
});

test("l'inventaire inscrit source et première vue, puis reste idempotent", async () => {
	const avantObservation = await query<{ maintenant: Date }>("SELECT now() AS maintenant");
	const premier = await enregistrerInventaire({ sousDomaines: [sousDomaine], suspects: [suspect], rapport });
	assert.equal(premier.sousDomainesInscrits, 1);
	assert.equal(premier.suspectsInscrits, 1);

	const second = await enregistrerInventaire({ sousDomaines: [sousDomaine], suspects: [suspect], rapport });
	assert.equal(second.sousDomainesInscrits, 0);
	assert.equal(second.suspectsInscrits, 0);
	const apresObservation = await query<{ maintenant: Date }>("SELECT now() AS maintenant");

	const lignes = await query<{
		sous_domaine: string; domaine: string; source: string;
		premiere_vue: Date; certificat_vu_le: Date; certificat_id: string;
	}>("SELECT sous_domaine, domaine, source, premiere_vue, certificat_vu_le, certificat_id FROM ct_sous_domaine WHERE domaine = $1", [DOMAINE]);
	assert.equal(lignes.rows.length, 1);
	assert.equal(lignes.rows[0]?.sous_domaine, SOUS_DOMAINE);
	assert.equal(lignes.rows[0]?.source, "crt.sh");
	assert.equal(lignes.rows[0]?.certificat_id, `${TAG}-cert`);
	// `premiere_vue` marque l'instant SQL de notre observation, pas l'émission
	// du certificat : cette dernière reste dans `certificat_vu_le`.
	const observation = lignes.rows[0]!.premiere_vue.getTime();
	assert.ok(
		observation >= avantObservation.rows[0]!.maintenant.getTime()
			&& observation <= apresObservation.rows[0]!.maintenant.getTime(),
		"premiere_vue doit être l'instant SQL de l'observation",
	);
	assert.equal(lignes.rows[0]?.certificat_vu_le.toISOString(), sousDomaine.premiere_vue);

	const suspects = await query<{ domaine: string; distance: number; source: string }>(
		"SELECT domaine, distance, source FROM ct_certificat_suspect WHERE certificat_id = $1",
		[suspect.certificat_id],
	);
	assert.equal(suspects.rows.length, 1);
	assert.equal(suspects.rows[0]?.domaine, suspect.domaine);
	assert.equal(suspects.rows[0]?.distance, 1);
	assert.equal(suspects.rows[0]?.source, "certspotter");

	const collectes = await query<{ rapport: { sous_domaines: number; taux_echec: { echecs: number } } }>(
		"SELECT rapport FROM ct_collecte WHERE collecte_le = $1", [COLLECTE_LE],
	);
	assert.equal(collectes.rows.length, 2, "un passage est journalisé à chaque exécution");
	assert.equal(collectes.rows[0]?.rapport.sous_domaines, 1);
	assert.equal(collectes.rows[0]?.rapport.taux_echec.echecs, 1);
});

after(async () => {
	await query("DELETE FROM ct_sous_domaine WHERE domaine = $1", [DOMAINE]);
	await query("DELETE FROM ct_certificat_suspect WHERE certificat_id = $1", [suspect.certificat_id]);
	await query("DELETE FROM ct_collecte WHERE collecte_le = $1", [COLLECTE_LE]);
	await closePools();
});
