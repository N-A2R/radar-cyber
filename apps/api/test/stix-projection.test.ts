/**
 * Projection STIX 2.1 horodatée : critère chiffré du chantier et aller-retour.
 *
 * Les comptes sont lus dans la base de test créée par test/run.ts : la
 * migration 217 y projette le corpus disponible, ou un jeu hors ligne marqué
 * `offline-fixture` quand la base est neuve. Aucun test n'écrit d'événement.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { query } from "../src/db.js";
import { buildStixObject } from "../src/export/stix.js";
import {
	exportStixBundle,
	importStixBundle,
	roundTripStix,
} from "../src/export/stix-projection.js";

test("critère : 1000+ objets indicator/identity/campaign et 500+ relations", async () => {
	const comptes = await query<{ objets: string; relations: string }>(`
    SELECT (SELECT count(*)::text FROM stix_object
             WHERE type IN ('indicator', 'identity', 'campaign')) AS objets,
           (SELECT count(*)::text FROM stix_relation) AS relations
  `);
	assert.ok(Number(comptes.rows[0].objets) >= 1000, `objets = ${comptes.rows[0].objets}`);
	assert.ok(Number(comptes.rows[0].relations) >= 500, `relations = ${comptes.rows[0].relations}`);
});

test("chaque objet projeté porte un horodatage et une fenêtre de validité", async () => {
	const obtenu = await query<{ n: string }>(`
    SELECT count(*)::text AS n
      FROM stix_object
     WHERE type IN ('indicator', 'identity', 'campaign')
       AND object ? 'created' AND object ? 'modified'
       AND valid_from IS NOT NULL
  `);
	const total = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM stix_object WHERE type IN ('indicator', 'identity', 'campaign')",
	);
	assert.equal(obtenu.rows[0].n, total.rows[0].n);

	const date = new Date("2026-03-04T10:00:00.000Z");
	const objet = buildStixObject({
		id: 42,
		dedup_key: "horodatage-test",
		family: "vuln",
		assertion_type: "technical_indicator",
		created_at: new Date("2020-01-01T00:00:00.000Z"),
		valid_at: date,
		at: new Date("2026-03-05T08:00:00.000Z"),
	});
	assert.ok(objet);
	// Le bundle STIX circule en JSON : les timestamps y sont des chaînes RFC 3339,
	// quel que soit leur type JS en mémoire (Date ou chaîne déjà normalisée).
	const serialise = JSON.parse(JSON.stringify(objet.object)) as Record<string, unknown>;
	assert.equal(serialise.created, "2026-03-05T08:00:00.000Z");
	assert.equal(serialise.modified, "2026-03-05T08:00:00.000Z");
	assert.equal(serialise.valid_from, date.toISOString());
});

test("aller-retour : deux imports gardent exactement les mêmes identifiants", async () => {
	const roundTrip = await roundTripStix();
	assert.ok(roundTrip.ids.length >= 1500);
	assert.deepEqual(roundTrip.imports[0].ids, roundTrip.imports[1].ids);
	assert.deepEqual(roundTrip.imports[0].ids, roundTrip.ids);
	assert.equal(roundTrip.imports[0].skipped, 0);
	assert.equal(roundTrip.imports[1].skipped, 0);

	const apres = await query<{ n: string }>("SELECT count(*)::text AS n FROM stix_object");
	const avant = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM stix_object WHERE type IN ('indicator', 'identity', 'campaign')",
	);
	assert.equal(apres.rows[0].n, avant.rows[0].n, "un réimport ne duplique aucun objet");
});

test("un bundle invalide ou hors périmètre est rejeté sans écriture", async () => {
	await assert.rejects(
		importStixBundle({ type: "bundle", spec_version: "2.1", objects: [] } as never),
		/bundle STIX 2.1 invalide/,
	);
	const resultat = await importStixBundle({
		type: "bundle",
		id: "bundle--00000000-0000-0000-0000-000000000001",
		spec_version: "2.1",
		objects: [
			{ type: "report", id: "report--00000000-0000-0000-0000-000000000002" },
			{
				type: "indicator",
				id: "indicator--00000000-0000-0000-0000-000000000003",
				extensions: { "x-radar-trust": { tlp: "RED" } },
			},
		],
	});
	assert.equal(resultat.imported, 0);
	assert.equal(resultat.skipped, 2);
	assert.deepEqual(resultat.ids, []);
});

test("export bundle : identifiant stable et objets triés", async () => {
	const premier = await exportStixBundle();
	const second = await exportStixBundle();
	assert.equal(premier.id, second.id);
	assert.equal(premier.spec_version, "2.1");
	const ids = premier.objects.map((object) => String(object.id));
	assert.deepEqual(ids, [...ids].sort());
});
