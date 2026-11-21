/**
 * Sigles au registre : une confirmation ne peut pas ignorer les alias
 * portés par une autre source que les dénominations usuelles.
 *
 * Isolation : deux organisations suffixées, supprimées dans `after`.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	candidatsSigleDepuisRegistre,
	deciderSigleDepuisRegistre,
	resetIndexSigles,
} from "../src/match/sigles.js";

const SIGLE = `QZ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const ids: number[] = [];

after(async () => {
	if (ids.length > 0) {
		await query("DELETE FROM org_alias WHERE org_id = ANY($1::int[])", [ids]);
		await query("DELETE FROM org WHERE id = ANY($1::int[])", [ids]);
	}
	resetIndexSigles();
	await closePools();
});

test("un sigle porté par deux sources distinctes reste ambigu", async () => {
	for (const [nom, source] of [
		[`Usuelle ${SIGLE}`, "sirene-usuelle"],
		[`Autre source ${SIGLE}`, "sirene"],
	] as const) {
		const r = await query<{ id: number }>(
			`INSERT INTO org (name, slug, kind, city, dept, status)
			 VALUES ($1, $2, 'entreprise', 'Bordeaux', '33', 'confirme') RETURNING id`,
			[`${nom} ${SIGLE}`, `${nom.toLowerCase().replace(/\s+/g, "-")}-${SIGLE}`],
		);
		const id = Number(r.rows[0]!.id);
		ids.push(id);
		await query("INSERT INTO org_alias (org_id, alias, source) VALUES ($1, $2, $3)", [id, SIGLE, source]);
	}
	resetIndexSigles();

	const candidats = await candidatsSigleDepuisRegistre(SIGLE);
	assert.ok(candidats.length >= 2, `candidats : ${candidats.map((c) => c.orgName).join(", ")}`);
	const decision = await deciderSigleDepuisRegistre(SIGLE);
	assert.equal(decision.motif, "ambigu");
	assert.equal(decision.accepte, false);
});

test("index vide : un sigle inconnu ne rattache rien", async () => {
	const decision = await deciderSigleDepuisRegistre(`QX${SIGLE}`);
	assert.equal(decision.motif, "inconnu");
	assert.equal(decision.orgId, undefined);
});
