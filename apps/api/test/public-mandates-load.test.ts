/**
 * Public office loading — dry-run, idempotency and privacy of the table.
 * Each test uses its own organisations in the disposable test database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query } from "../src/db.js";
import { loadPublicMandates } from "../src/public-mandates/load.js";
import { planPublicMandatesFromOrgs, type PublicMandatePlan } from "../src/public-mandates/plan.js";
import type { PlannedOrg } from "../src/referentiel/plan.js";

const TAG = `pm${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SLUG_A = `na-commune-${TAG}-a`;
const SLUG_B = `na-commune-${TAG}-b`;
const SLUG_MISSING = `na-commune-${TAG}-missing`;
let orgIds: number[] = [];
let plan: PublicMandatePlan;

function org(slug: string, code: string): PlannedOrg {
	return {
		slug,
		name: "Commune de test",
		kind: "collectivite",
		sector: "commune",
		city: "Test",
		dept: "16",
		siren: null,
		lat: null,
		lon: null,
		geoSource: "admin-express-centroide",
		status: "confirme",
		entityCode: code,
		codesPostaux: [],
		population: null,
		aliases: [],
	};
}

before(async () => {
	const inserted = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, dept) VALUES
		    ($1,$2,'collectivite','16'), ($1,$3,'collectivite','16') RETURNING id`,
		[`Commune ${TAG}`, SLUG_A, SLUG_B],
	);
	orgIds = inserted.rows.map((row) => Number(row.id));
	plan = planPublicMandatesFromOrgs([
		org(SLUG_A, `${TAG}1`),
		org(SLUG_B, `${TAG}2`),
		org(SLUG_MISSING, `${TAG}3`),
	]);
});

after(async () => {
	await query("DELETE FROM public_mandate WHERE org_id = ANY($1::bigint[])", [orgIds]);
	await query("DELETE FROM org WHERE id = ANY($1::int[])", [orgIds]);
	await closePools();
});

test("dry-run counts the load without writing", async () => {
	const report = await loadPublicMandates(plan, { dryRun: true });
	assert.equal(report.planned, 3);
	assert.equal(report.inserted, 2);
	assert.equal(report.skipped, 1);
	assert.equal(report.byRole.mayor, 3);
	const { rows } = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM public_mandate WHERE org_id = ANY($1::bigint[])",
		[orgIds],
	);
	assert.equal(rows[0].n, 0);
});

test("apply is idempotent and keeps only the office columns", async () => {
	const first = await loadPublicMandates(plan, { dryRun: false });
	assert.equal(first.inserted, 2);
	assert.equal(first.skipped, 1);
	const second = await loadPublicMandates(plan, { dryRun: false });
	assert.equal(second.inserted, 0);
	assert.equal(second.alreadyPresent, 2);

	const { rows } = await query<{
		orgId: number; siren: string | null; mandateRole: string;
		jurisdictionKind: string; jurisdictionCode: string; proofUrl: string;
	}>(
		`SELECT org_id AS "orgId", siren, mandate_role AS "mandateRole",
		        jurisdiction_kind AS "jurisdictionKind",
		        jurisdiction_code AS "jurisdictionCode", proof_url AS "proofUrl"
		   FROM public_mandate WHERE org_id = ANY($1::bigint[]) ORDER BY org_id`,
		[orgIds],
	);
	assert.equal(rows.length, 2);
	assert.deepEqual(rows.map((row) => Number(row.orgId)), [...orgIds].sort((a, b) => a - b));
	assert.deepEqual([...new Set(rows.map((row) => row.mandateRole))], ["mayor"]);
	assert.ok(rows.every((row) => row.jurisdictionCode.length > 0 && row.proofUrl.startsWith("https://")));
});

test("public_mandate exposes no person or victim column", async () => {
	const { rows } = await query<{ column_name: string }>(
		`SELECT column_name FROM information_schema.columns
		  WHERE table_name = 'public_mandate' AND column_name NOT IN ('id', 'created_at')
		  ORDER BY column_name`,
	);
	assert.deepEqual(rows.map((row) => row.column_name).sort(), [
		"dept", "jurisdiction_code", "jurisdiction_kind", "mandate_role",
		"org_id", "proof_url", "siren", "source",
	]);
});
