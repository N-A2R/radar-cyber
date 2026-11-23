/**
 * Certificat d'ignorance : une ligne datée par champ inconnu et par org.
 *
 * Le test d'échelle sème le corpus figé de 10261 organisations dans une
 * transaction annulée, puis exécute le critère brut du verificateur externe :
 * count(*) sur unknown_field / checked_at non nuls, et au moins 3 champs
 * distincts par organisation. Rien n'est laissé dans la base partagée.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { closePools, query, withClient } from "../src/db.js";
import { installAccessControl } from "../src/security/rbac.js";
import {
	CRITERE_ORG_UNKNOWN_SQL,
	MIN_UNKNOWN_FIELDS,
	OBJECTIF_ORG_UNKNOWN,
	ORG_UNKNOWN_FIELDS,
	certificatAtteint,
} from "../src/orgs/unknown-certificate.js";

const CORPUS_SQL = fileURLToPath(
	new URL("../../../db/fixtures/kpi-couverture-corpus.sql", import.meta.url),
);

let app: FastifyInstance | null = null;

after(async () => {
	if (app) await app.close();
	await closePools();
});

test("le catalogue nomme au moins trois facettes sans stocker de contact", () => {
	assert.ok(ORG_UNKNOWN_FIELDS.length >= 3);
	assert.equal(new Set(ORG_UNKNOWN_FIELDS).size, ORG_UNKNOWN_FIELDS.length);
	assert.ok(ORG_UNKNOWN_FIELDS.includes("contact_public"));
	assert.ok(
		ORG_UNKNOWN_FIELDS.every((champ) => !/mail|phone|telephone|adresse/i.test(champ)),
		"aucun champ du catalogue ne porte de donnée personnelle",
	);
});

test("critère externe sur le corpus figé : 10261 orgs, 3 champs minimum chacune", async () => {
	await withClient(async (client) => {
		await client.query("BEGIN");
		try {
			await client.query(
				"TRUNCATE TABLE asset, event, org_alias, org_history, org_unknown, alert, collector_run, source, org CASCADE",
			);
			await client.query(readFileSync(CORPUS_SQL, "utf8"));
			await client.query("SELECT enregistrer_org_unknown()");

			const orgs = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM org");
			const critere = await client.query<{ n: string }>(CRITERE_ORG_UNKNOWN_SQL);
			const parOrg = await client.query<{ org_id: number; champs: string }>(`
				SELECT org_id, count(DISTINCT unknown_field)::text AS champs
				  FROM org_unknown
				 WHERE unknown_field IS NOT NULL AND checked_at IS NOT NULL
				 GROUP BY org_id
			`);
			const distincts = await client.query<{ n: string }>(`
				SELECT count(DISTINCT unknown_field)::text AS n
				  FROM org_unknown
				 WHERE unknown_field IS NOT NULL AND checked_at IS NOT NULL
			`);
			const minimum = parOrg.rows.reduce(
				(min, row) => Math.min(min, Number(row.champs)),
				Number.POSITIVE_INFINITY,
			);
			const mesure = {
				total: Number(critere.rows[0]?.n ?? 0),
				minChampsParOrg: minimum,
				champsDistincts: Number(distincts.rows[0]?.n ?? 0),
			};
			console.log(
				`CRITERE BRUT : ${CRITERE_ORG_UNKNOWN_SQL} → ${mesure.total} ; ` +
					`${mesure.minChampsParOrg} champs/org minimum ; ${mesure.champsDistincts} champs distincts`,
			);

			assert.equal(Number(orgs.rows[0]?.n), OBJECTIF_ORG_UNKNOWN);
			assert.ok(certificatAtteint(mesure), JSON.stringify(mesure));
			assert.ok(mesure.total >= OBJECTIF_ORG_UNKNOWN);
			assert.ok(mesure.minChampsParOrg >= MIN_UNKNOWN_FIELDS);
			assert.ok(mesure.champsDistincts >= MIN_UNKNOWN_FIELDS);
		} finally {
			await client.query("ROLLBACK");
		}
	});
});

test("le scan est rejouable : mêmes lignes, contrôle rafraîchi", async () => {
	await withClient(async (client) => {
		await client.query("BEGIN");
		try {
			await client.query("SELECT enregistrer_org_unknown(1)");
			const avant = await client.query<{ n: string }>(CRITERE_ORG_UNKNOWN_SQL);
			await client.query("SELECT enregistrer_org_unknown(1)");
			const apres = await client.query<{ n: string }>(CRITERE_ORG_UNKNOWN_SQL);
			assert.equal(apres.rows[0]?.n, avant.rows[0]?.n);
			const doublons = await client.query<{ n: string }>(`
				SELECT count(*)::text AS n FROM (
				  SELECT org_id, unknown_field FROM org_unknown
				   GROUP BY org_id, unknown_field HAVING count(*) > 1
				) d
			`);
			assert.equal(doublons.rows[0]?.n, "0");
		} finally {
			await client.query("ROLLBACK");
		}
	});
});

test("la route publique expose l'état daté sans donnée personnelle", async () => {
	const org = await query<{ id: number }>("SELECT id FROM org ORDER BY id LIMIT 1");
	assert.ok(org.rows[0], "organisation de référence absente");

	app = await buildApp();
	installAccessControl(app);
	await app.ready();

	const res = await app.inject({
		method: "GET",
		url: `/api/certificat-ignorance?orgId=${org.rows[0].id}&limit=5`,
	});
	assert.equal(res.statusCode, 200, res.body);
	const body = res.json<{
		portee: string;
		total: number;
		count: number;
		ignorances: Array<{ orgId: number; unknownField: string; reason: string; checkedAt: string }>;
	}>();
	assert.match(body.portee, /ne prouve pas/);
	assert.ok(body.total >= 1);
	assert.ok(body.count >= 1);
	for (const ligne of body.ignorances) {
		assert.equal(ligne.orgId, org.rows[0].id);
		assert.ok(ligne.unknownField);
		assert.ok(ligne.reason);
		assert.ok(!Number.isNaN(Date.parse(ligne.checkedAt)));
	}

	const bad = await app.inject({ method: "GET", url: "/api/certificat-ignorance?limit=0" });
	assert.equal(bad.statusCode, 400);
});
