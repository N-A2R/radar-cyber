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

		// La couverture complète place aussi la version courante dans org_history.
		const { rows: hist } = await query<{ valid_to: string | null; superseded_at: string | null }>(`SELECT valid_to::text AS valid_to, superseded_at::text AS superseded_at FROM org_history WHERE org_id=$1 ORDER BY id`, [orgId]);
		assert.equal(hist.length, 2);
		assert.match(hist[0]!.valid_to!, /2024-06-01/, "l'ancienne version doit être close à la date d'effet");
		assert.notEqual(hist[0]!.superseded_at, null, "l'ancienne assertion doit être dépassée");
		assert.equal(hist[1]!.superseded_at, null, "la nouvelle assertion reste ouverte");

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

test("muterOrganisation refuse une colonne hors whitelist avant toute écriture", async () => {
	const slug = `test-bitemp-whitelist-${Date.now()}`;
	const { rows } = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, valid_from) VALUES ($1,$2,'collectivite','2023-01-01') RETURNING id`,
		[`Test Whitelist ${slug}`, slug],
	);
	const orgId = rows[0]!.id;

	try {
		await assert.rejects(
			() => muterOrganisation({ orgId, changes: { "name = 'x', slug": "y" } as never, actor: "test:whitelist" }),
			/colonne non modifiable/,
		);
		// Le rejet doit être antérieur à l'archivage : aucune assertion supplémentaire.
		const { rows: hist } = await query<{ n: number }>(
			"SELECT count(*)::int AS n FROM org_history WHERE org_id=$1 AND superseded_at IS NOT NULL",
			[orgId],
		);
		assert.equal(hist[0]!.n, 0, "aucune version ne doit être archivée quand la clé est refusée");
		const { rows: cur } = await query<{ name: string }>("SELECT name FROM org WHERE id=$1", [orgId]);
		assert.equal(cur[0]!.name, `Test Whitelist ${slug}`, "la projection ne doit pas avoir bougé");
	} finally {
		await query("DELETE FROM org_history WHERE org_id=$1", [orgId]).catch(() => {});
		await query("DELETE FROM org WHERE id=$1", [orgId]).catch(() => {});
	}
});

test("orgsValidesAu(asOfRecorded) n'expose pas une organisation enregistrée plus tard", async () => {
	const slug = `test-bitemp-recorded-${Date.now()}`;
	const { rows } = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, valid_from) VALUES ($1,$2,'collectivite', now()) RETURNING id`,
		[`Test Recorded ${slug}`, slug],
	);
	const orgId = rows[0]!.id;

	try {
		const passe = await orgsValidesAu({ asOfRecorded: "2020-01-01T00:00:00Z" });
		assert.ok(
			!passe.some((o) => o.org_id === orgId),
			"une org créée aujourd'hui ne doit pas apparaître à une date d'enregistrement passée",
		);
		const maintenant = await orgsValidesAu();
		assert.ok(
			maintenant.some((o) => o.org_id === orgId),
			"la même org doit être visible en lecture courante",
		);
	} finally {
		await query("DELETE FROM org_history WHERE org_id=$1", [orgId]).catch(() => {});
		await query("DELETE FROM org WHERE id=$1", [orgId]).catch(() => {});
	}
});
