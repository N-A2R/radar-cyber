/**
 * Fenêtre de publication : critère SQL, absence de fuite temporelle et rejeu.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, ingestQuery, query } from "../src/db.js";
import {
	DISCLOSURE_CRITERION_SQL,
	DISCLOSURE_MODEL,
	readDisclosureCriterion,
	readDisclosureScore,
} from "../src/forecast/disclosure-forecast.js";

test("le critère SQL du chantier est au-dessus de 50", async () => {
	const direct = await query<{ count: string }>(DISCLOSURE_CRITERION_SQL);
	const n = Number(direct.rows[0]?.count ?? 0);
	assert.ok(n >= 50, `${n} fenêtres dans la fenêtre, seuil 50`);
	assert.equal(n, await readDisclosureCriterion());
});

test("au moins 40 % des fenêtres émises contiennent la publication", async () => {
	const score = await readDisclosureScore();
	assert.ok(score.in_window >= 50, `${score.in_window} réussites`);
	assert.ok((score.hit_rate ?? 0) >= 0.4, `part ${score.hit_rate} < 0,40`);
});

test("aucune fenêtre n'utilise une publication postérieure à l'émission", async () => {
	const leaked = await query<{ count: string }>(
		`SELECT count(*) FROM disclosure_forecast
		  WHERE first_public_at IS NULL
		     OR issued_at >= first_public_at
		     OR first_public_at < window_start
		     OR window_end <= window_start`,
	);
	assert.equal(Number(leaked.rows[0]?.count ?? 0), 0);
	const sources = await query<{ n: string }>(
		"SELECT count(DISTINCT source_dataset) AS n FROM disclosure_forecast",
	);
	assert.ok(Number(sources.rows[0]?.n ?? 0) >= 2, "les corpus doivent rester identifiés");
});

test("le producteur est rejouable sans doublon", async () => {
	const before = await readDisclosureScore();
	const emitted = await ingestQuery<{ emitted: number }>(
		"SELECT public.emit_disclosure_forecast($1) AS emitted",
		[DISCLOSURE_MODEL],
	);
	const after = await readDisclosureScore();
	assert.equal(Number(emitted.rows[0]?.emitted ?? 0), before.emitted);
	assert.deepEqual(after, before);
});

after(async () => {
	await closePools();
});
