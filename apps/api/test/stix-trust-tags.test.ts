/**
 * Tags de confiance et de diffusion : une seule sémantique, vérifiée à trois
 * endroits — le normaliseur, l'objet STIX construit, et la base qui le stocke.
 * Un tag inconnu est rejeté avant tout stockage ; la base le rejette aussi.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import { buildStixObject, persistStixObjects, type StixEventRow } from "../src/export/stix.js";
import {
	UnknownTrustTagError,
	normalizeTrustTags,
	stixConfidence,
} from "../src/export/trust-tags.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const PREFIXE = `stix-tags-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const evenements: number[] = [];

after(async () => {
	if (evenements.length > 0) {
		await supprimerEvenementsArchivees("id = ANY($1::bigint[])", [evenements]);
	}
	await closePools();
});

async function evenement(
	suffixe: string,
	valeurs: { tlp?: string; confidence?: string; evidence?: Record<string, unknown> },
): Promise<StixEventRow> {
	const resultat = await query<StixEventRow>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, evidence, confidence, tlp, source_url)
     VALUES ($1, 'vuln', 'technical_indicator', 'Fait structurel de test', 'ransomlook',
             $2::jsonb || '{"run_id":"1"}'::jsonb, $3, $4, 'https://example.invalid/event')
     RETURNING id, dedup_key, family, assertion_type, tlp, confidence, evidence, created_at`,
		[
			`${PREFIXE}-${suffixe}`,
			JSON.stringify(valeurs.evidence ?? {}),
			valeurs.confidence ?? null,
			valeurs.tlp ?? "CLEAR",
		],
	);
	const ligne = resultat.rows[0];
	evenements.push(ligne.id);
	return ligne;
}

test("alias TLP, PAP et Admiralty : un seul vocabulaire", () => {
	assert.deepEqual(
		normalizeTrustTags({ tlp: "tlp:amber", pap: "CLEAR", confidence: "b2" }),
		{ tlp: "AMBER", pap: "WHITE", confidence: "B2" },
	);
	assert.equal(stixConfidence("A1"), 100);
	assert.equal(stixConfidence("F6"), 0);
});

test("tag absent : défaut du produit, distinct d'un tag inconnu", () => {
	assert.deepEqual(normalizeTrustTags({}), { tlp: "WHITE", pap: "WHITE", confidence: "F6" });
});

test("tag inconnu : rejet explicite, jamais une valeur par défaut", () => {
	assert.throws(() => normalizeTrustTags({ tlp: "TLP:ORANGE" }), UnknownTrustTagError);
	assert.throws(() => normalizeTrustTags({ pap: "PAP:BLACK" }), UnknownTrustTagError);
	assert.throws(() => normalizeTrustTags({ confidence: "Z9" }), UnknownTrustTagError);
	assert.throws(() => buildStixObject({
		id: 1,
		family: "vuln",
		assertion_type: "technical_indicator",
		tlp: "CLEAR",
		evidence: { tlp: "TLP:ORANGE" },
	}), UnknownTrustTagError);
});

test("TLP:RED et PAP:RED restent en quarantaine : aucun objet exporté", () => {
	assert.equal(
		buildStixObject({
			id: 1,
			family: "vuln",
			assertion_type: "technical_indicator",
			tlp: "RED",
		}),
		null,
	);
	assert.equal(
		buildStixObject({
			id: 2,
			family: "vuln",
			assertion_type: "technical_indicator",
			tlp: "CLEAR",
			evidence: { pap: "PAP:RED" },
		}),
		null,
	);
});

test("chaque objet exporté porte ses marquages et sa confiance Admiralty", () => {
	const objet = buildStixObject({
		id: 42,
		dedup_key: `${PREFIXE}-objet`,
		family: "vuln",
		assertion_type: "technical_indicator",
		tlp: "TLP:CLEAR",
		confidence: "B2",
		evidence: { pap: "PAP:AMBER" },
	});
	assert.ok(objet);
	assert.equal(objet.tlp, "WHITE");
	assert.equal(objet.pap, "AMBER");
	assert.equal(objet.confidence, "B2");
	const stix = objet.object as {
		confidence: number;
		object_marking_refs: string[];
		extensions: Record<string, Record<string, string>>;
	};
	assert.equal(stix.confidence, 90);
	assert.equal(stix.object_marking_refs.length, 2);
	assert.deepEqual(stix.extensions["x-radar-trust"], {
		tlp: "WHITE",
		pap: "AMBER",
		confidence: "B2",
	});
});

test("export en base : tlp, pap et confidence normalisés et stockés", async () => {
	const ligne = await evenement("normalise", {
		tlp: "TLP:CLEAR",
		confidence: "b2",
		evidence: { pap: "PAP:AMBER" },
	});
	const resultat = await persistStixObjects([ligne]);
	assert.deepEqual(resultat, { exported: 1, skipped: 0, rejected: 0 });

	const objet = buildStixObject(ligne);
	assert.ok(objet);
	const stocke = await query<{ tlp: string; pap: string; confidence: string }>(
		"SELECT tlp, pap, confidence FROM stix_object WHERE id = $1",
		[objet.id],
	);
	assert.equal(stocke.rowCount, 1);
	assert.deepEqual(stocke.rows[0], { tlp: "WHITE", pap: "AMBER", confidence: "B2" });

	// Même identifiant que le backfill SQL : une réexportation met à jour la
	// ligne reprise, elle n'en crée pas une seconde (md5 vs sha256 = doublon).
	assert.ok(ligne.dedup_key);
	const idSql = await query<{ id: string }>(
		`SELECT 'indicator--' || md5('event:' || $1)::uuid::text AS id`,
		[ligne.dedup_key],
	);
	assert.equal(idSql.rows[0].id, objet.id);
});

test("tag inconnu dans evidence : ligne rejetée, rien n'est écrit dans stix_object", async () => {
	const mauvaise = await evenement("inconnu", {
		tlp: "CLEAR",
		evidence: { tlp: "TLP:ORANGE" },
	});
	// La ligne fautive est rejetée, mais elle ne bloque pas le lot : la bonne
	// ligne voisine est exportée. Rejet = jamais deviné, jamais stocké.
	const bonne = await evenement("bonne", {});
	const resultat = await persistStixObjects([mauvaise, bonne]);
	assert.deepEqual(resultat, { exported: 1, skipped: 0, rejected: 1 });
	const ecrits = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM stix_object WHERE source_event_id = $1",
		[mauvaise.id],
	);
	assert.equal(ecrits.rows[0].n, "0");
});

test("invariant SQL : 100 % des objets ont tlp et confidence", async () => {
	const invariant = await query<{ n: string }>(`
    SELECT count(*)::text AS n
    FROM stix_object
    WHERE confidence IS NULL OR tlp IS NULL
  `);
	assert.equal(invariant.rows[0].n, "0");
});

test("la base refuse elle-même un tag inconnu", async () => {
	await assert.rejects(
		query(
			`INSERT INTO stix_object (id, stix_type, tlp, pap, confidence, object)
       VALUES ($1, 'indicator', 'TLP:ORANGE', 'WHITE', 'B2', '{}'::jsonb)`,
			[`indicator--${PREFIXE}-invalide`],
		),
		/foreign key constraint/i,
	);
});
