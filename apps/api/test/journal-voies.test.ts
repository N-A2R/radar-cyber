import { test } from "node:test";
import assert from "node:assert/strict";
import { consignerAvec } from "../src/journal/index.js";

/**
 * Le point du correctif : `POST /api/ingest` et la promotion écrivent dans
 * leur transaction, donc le journal doit accepter le `run` de l'appelant au
 * lieu de repasser par le pool. Sans ce test, un retour à `ingestQuery`
 * ferait perdre le fait en cas de rollback — silencieusement.
 */
test("consignerAvec écrit dans le runner fourni, pas dans le pool", async () => {
	const appels: { text: string; params?: readonly unknown[] }[] = [];
	const runner = async (text: string, params?: readonly unknown[]) => {
		appels.push({ text, params });
		return { rows: [] };
	};
	const r = await consignerAvec(runner, {
		kind: "event.rattachement",
		subject: "dedup:test",
		summary: "test",
		actor: "test",
		payload: { orgId: 1 },
		validAt: "2026-11-13T00:00:00.000Z",
	});
	assert.equal(r.ok, true);
	assert.equal(appels.length, 1);
	assert.match(appels[0].text, /INSERT INTO journal/);
	assert.equal(appels[0].params?.[0], "event.rattachement");
	assert.equal(appels[0].params?.[1], "dedup:test");
});

test("une erreur du journal est rendue, pas avalée", async () => {
	const runner = async () => {
		throw new Error("journal indisponible");
	};
	const r = await consignerAvec(runner, {
		kind: "match.decided",
		subject: "x",
		summary: "x",
		actor: "x",
		payload: {},
		validAt: null,
	});
	assert.equal(r.ok, false);
	assert.match(String(r.error), /journal indisponible/);
});
