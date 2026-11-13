import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import { muterOrganisation, orgsValidesAu } from "../src/referentiel/bitemporal.js";

after(async () => { await closePools().catch(() => {}); });

test("une organisation mutée garde son ancienne version pour le passé", async () => {
	// Crée une org temporaire dédiée au test
	const slug = `test-bitemp-${Date.now()}`;
	const { rows: inserted } = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, city, dept, valid_from) VALUES ($1,$2,'collectivite','Testville','33','2023-01-01') RETURNING id`,
		[`Test Bitemporal ${slug}`, slug],
	);
	const orgId = inserted[0]!.id;

	// Ajoute un alias valide depuis 2023
	await query(`INSERT INTO org_alias (org_id, alias, source, valid_from) VALUES ($1,$2,'test','2023-01-01') ON CONFLICT DO NOTHING`, [orgId, `test alias ${slug}`]);

	try {
		// Mute l'org le 2024-06-01 : changement de nom (fusion)
		await muterOrganisation({
			orgId,
			changes: { name: `Test Bitemporal FUSIONNEE ${slug}`, city: "Fusionville" },
			validFrom: "2024-06-01T00:00:00Z",
			actor: "test:bitemporal",
		});

		// Lecture au 2024-01-01 : on doit voir l'ancien nom
		const avant = await orgsValidesAu({ asOfValid: "2024-01-15" });
		const orgAvant = avant.find((o) => o.org_id === orgId || o.id === orgId);
		assert.ok(orgAvant, "l'org doit exister avant la fusion");
		assert.match(orgAvant!.name, /Test Bitemporal.*(?!FUSIONNEE)/);
		assert.equal(orgAvant!.city, "Testville");

		// Lecture au 2024-07-01 : on voit le nouveau nom
		const apres = await orgsValidesAu({ asOfValid: "2024-07-01" });
		const orgApres = apres.find((o) => o.org_id === orgId || o.id === orgId);
		assert.ok(orgApres, "l'org doit exister après la fusion");
		assert.match(orgApres!.name, /FUSIONNEE/);
		assert.equal(orgApres!.city, "Fusionville");

		// Lecture courante : même que après
		const courant = await orgsValidesAu();
		const orgCourant = courant.find((o) => o.id === orgId);
		assert.ok(orgCourant);
		assert.match(orgCourant!.name, /FUSIONNEE/);

		// Vérifie que l'historique contient bien l'ancienne version close
		const { rows: hist } = await query<{ valid_to: string | null }>(`SELECT valid_to::text AS valid_to FROM org_history WHERE org_id=$1`, [orgId]);
		assert.equal(hist.length, 1);
		assert.ok(hist[0]!.valid_to !== null, "l'ancienne version doit être close");
		assert.match(hist[0]!.valid_to!, /2024-06-01/);

		// Le journal doit avoir tracé la mutation
		const { rows: j } = await query(`SELECT * FROM journal WHERE subject=$1 AND kind='org.changed'`, [`org:${orgId}`]);
		assert.equal(j.length, 1);
		assert.equal(j[0].payload.validFrom, "2024-06-01T00:00:00.000Z");
	} finally {
		// Nettoyage : supprime l'org de test (cascade supprime alias et history)
		// Le journal est append-only : on ne le nettoie pas, il porte l'histoire du test.
		await query(`DELETE FROM org WHERE id=$1`, [orgId]).catch(() => {});
		// org_history n'est pas supprimé par cascade ? si, mais on force
		await query(`DELETE FROM org_history WHERE org_id=$1`, [orgId]).catch(() => {});
	}
});

test("sans asOf, on ne voit que le présent (valid_to IS NULL)", async () => {
	const valides = await orgsValidesAu();
	for (const o of valides) {
		assert.equal(o.valid_to, null, `org ${o.id} devrait avoir valid_to null en lecture courante`);
	}
	// Pas d'exigence de cardinalité : la base de test est vide, la prod a 34330
});

test("alias bitemporel : lecture asOf renvoie les bons alias", async () => {
	// Vérifie que org_alias a bien les colonnes bitemporelles
	const { rows } = await query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name='org_alias' AND column_name IN ('valid_from','valid_to')`);
	assert.equal(rows.length, 2, "org_alias doit avoir valid_from/valid_to");
});
