/**
 * One behaviour per test: SIRET -> siège linking, exclusions, public counter.
 * Fixtures use synthetic identifiers only; no victim or event data is read.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import {
	attachSiretEstablishments,
	countSiretEstablishments,
} from "../src/referentiel/siret-establishments.js";
import siretRoute from "../src/routes/siret-establishments.js";

const TAG = `se${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const ids: Record<string, number> = {};
let app: FastifyInstance;

async function insertOrg(
	key: string,
	fields: { siren?: string; source: string; code?: string; dept: string },
): Promise<void> {
	const result = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, entity_source, entity_code, siren, dept)
		 VALUES ($1, $2, 'entreprise', $3, $4, $5, $6) RETURNING id`,
		[
			`${key} ${TAG}`,
			`${key}-${TAG}`,
			fields.source,
			fields.code ?? null,
			fields.siren ?? null,
			fields.dept,
		],
	);
	ids[key] = Number(result.rows[0]?.id);
}

async function parentOf(key: string): Promise<number | null> {
	const result = await query<{ parent_org_id: number | null }>(
		"SELECT parent_org_id FROM org WHERE id = $1",
		[ids[key]],
	);
	return result.rows[0]?.parent_org_id ?? null;
}

before(async () => {
	await insertOrg("activeHq", { siren: "111111111", source: "sirene", dept: "33" });
	await insertOrg("closedHq", { siren: "222222222", source: "sirene-ferme", dept: "16" });
	await insertOrg("outsideHq", { siren: "333333333", source: "sirene", dept: "75" });

	await insertOrg("linked", { source: "sirene-site", code: "11111111100012", dept: "33" });
	await insertOrg("closed", { source: "sirene-site", code: "22222222200024", dept: "16" });
	await insertOrg("malformed", { source: "sirene-site", code: "111111111001", dept: "33" });
	await insertOrg("outside", { source: "sirene-site", code: "33333333300036", dept: "75" });
	await insertOrg("unmatched", { source: "sirene-site", code: "44444444400048", dept: "87" });
});

after(async () => {
	if (app) await app.close();
	await closePools();
});

test("links a SIRET establishment only to an active headquarters with the same SIREN", async () => {
	const created = await attachSiretEstablishments();
	assert.equal(created, 1);
	assert.equal(await parentOf("linked"), ids.activeHq);
	assert.equal(await attachSiretEstablishments(), 0, "backfill must be idempotent");
});

test("rejects closed headquarters, malformed SIRET and establishments outside Nouvelle-Aquitaine", async () => {
	assert.equal(await parentOf("closed"), null);
	assert.equal(await parentOf("malformed"), null);
	assert.equal(await parentOf("outside"), null);
	assert.equal(await parentOf("unmatched"), null);

	const counts = await countSiretEstablishments();
	assert.deepEqual(counts, {
		siretEstablishments: 3,
		attachedEstablishments: 1,
		headquartersWithEstablishments: 1,
		unmatchedEstablishments: 2,
	});
});

test("GET /api/siret/establishments/count exposes the count with English keys", async () => {
	app = Fastify();
	await app.register(siretRoute, { prefix: "/api" });
	await app.ready();

	const response = await app.inject({ method: "GET", url: "/api/siret/establishments/count" });
	assert.equal(response.statusCode, 200, response.body);
	assert.deepEqual(response.json(), {
		region: "Nouvelle-Aquitaine",
		siretEstablishments: 3,
		attachedEstablishments: 1,
		headquartersWithEstablishments: 1,
		unmatchedEstablishments: 2,
	});
});
