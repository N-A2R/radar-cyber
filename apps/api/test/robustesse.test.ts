/**
 * Robustesse : ordre déterministe, comparateurs sûrs, décodage honnête,
 * et rétention qui ne rend pas les alertes illisibles.
 *
 * Chacun de ces tests échoue sur le code d'avant la correction — c'est leur
 * seule raison d'être.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import { mediane } from "../src/analyse/mediane.js";
import { compareQueueEntries } from "../src/quarantine/triage.js";
import { decodeBody } from "../src/collectors/parsers/decode.js";
import { runRetention } from "../src/maintenance/retention.js";

const TAG = `${Date.now()}-${process.pid}`;

after(async () => {
	await closePools();
});

test("médiane : les valeurs non finies sont écartées, jamais propagées", () => {
	assert.equal(mediane([Number.NaN, 1, 2]), 1.5);
	assert.equal(mediane([Number.NaN, Number.POSITIVE_INFINITY]), null);
	assert.equal(mediane([]), null);
	assert.equal(mediane([3]), 3);
	// Un NaN ne doit pas rendre le tri instable : le résultat reste fini.
	assert.ok(Number.isFinite(mediane([5, Number.NaN, 1, 3]) as number));
});

test("tri de revue : une date invalide ne produit pas un ordre aléatoire", () => {
	const entry = (id: number, claimedAt: string) => ({
		id,
		claimedAt,
		bucket: "a_trier" as const,
		confidence: 0.5,
		occurrences: 1,
	});
	const rows = [entry(1, "pas-une-date"), entry(2, "2025-01-01"), entry(3, "")];
	const first = [...rows].sort(compareQueueEntries).map((r) => r.id);
	for (let i = 0; i < 20; i++) {
		assert.deepEqual([...rows].sort(compareQueueEntries).map((r) => r.id), first);
	}
});

test("décodage : une page windows-1252 sans charset n'est plus corrompue en silence", () => {
	// « café » en windows-1252 : 0xE9 n'est pas de l'UTF-8 valide.
	const buf = Buffer.from([0x63, 0x61, 0x66, 0xe9]);
	const r = decodeBody(buf, "text/html");
	assert.ok(!r.text.includes("\uFFFD"), `texte corrompu : ${JSON.stringify(r.text)}`);
	assert.equal(r.text, "café");
	assert.equal(r.uncertain, true, "l'incertitude doit être signalée, pas devinée");
});

test("rétention : un événement cité par une alerte survit, les autres partent", async () => {
	await query(
		`INSERT INTO source (id, name, family, url) VALUES ($1,'Test rétention','cti','https://example.invalid/r')
		 ON CONFLICT (id) DO NOTHING`,
		[`retention-${TAG}`],
	);

	const old = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString();
	const insertEvent = async (suffix: string) => {
		const { rows } = await query<{ id: number }>(
			`INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id)
			 VALUES ($1,'ransomware','third_party_claim',$2,$3,$4) RETURNING id`,
			[`retention:${TAG}:${suffix}`, `Événement ${suffix}`, old, `retention-${TAG}`],
		);
		return rows[0]!.id;
	};

	const cite = await insertEvent("cite");
	const libre = await insertEvent("libre");
	await query(
		`INSERT INTO alert (rule_id, title, severity, event_id) VALUES ($1,$2,3,$3)`,
		[`test-${TAG}`, "Alerte de test", cite],
	);

	try {
		await runRetention(() => {}, { tables: ["event"], days: 1 });
		const restants = await query<{ id: number }>("SELECT id FROM event WHERE id = ANY($1::int[])", [
			[cite, libre],
		]);
		const ids = restants.rows.map((r) => r.id);
		assert.ok(ids.includes(cite), "l'événement cité par une alerte ne doit pas être purgé");
		assert.ok(!ids.includes(libre), "l'événement non cité doit être purgé");
	} finally {
		await query("DELETE FROM alert WHERE rule_id=$1", [`test-${TAG}`]).catch(() => {});
		await query("DELETE FROM event WHERE id = ANY($1::int[])", [[cite, libre]]).catch(() => {});
		await query("DELETE FROM source WHERE id=$1", [`retention-${TAG}`]).catch(() => {});
	}
});

test("rétention : cinq événements de 100 jours finissent dans archive_event", async () => {
	const prefix = `retention-archive:${TAG}:`;
	const sourceId = `archive-${TAG}`;
	await query(
		`INSERT INTO source (id, name, family, url) VALUES ($1,'Test archive','cti','https://example.invalid/a')
		 ON CONFLICT (id) DO NOTHING`,
		[sourceId],
	);
	const old = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString();

	try {
		for (let i = 0; i < 5; i++) {
			await query(
				`INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, source_id)
				 VALUES ($1,'ransomware','third_party_claim',$2,$3,$4,$5)`,
				[`${prefix}${i}`, `Événement ${i}`, `Résumé ${i}`, old, sourceId],
			);
		}

		await runRetention(() => {}, { tables: ["event"], days: 90 });

		const restants = await query<{ n: number }>(
			"SELECT count(*)::int AS n FROM event WHERE dedup_key LIKE $1",
			[`${prefix}%`],
		);
		const archives = await query<{ n: number }>(
			"SELECT count(*)::int AS n FROM archive_event WHERE dedup_key LIKE $1",
			[`${prefix}%`],
		);
		assert.equal(restants.rows[0]?.n, 0, "aucun événement centenaire ne doit rester en brut");
		assert.equal(archives.rows[0]?.n, 5, "les cinq événements doivent être archivés entièrement");
	} finally {
		await query("DELETE FROM archive_event WHERE dedup_key LIKE $1", [`${prefix}%`]).catch(() => {});
		await query("DELETE FROM event WHERE dedup_key LIKE $1", [`${prefix}%`]).catch(() => {});
		await query("DELETE FROM source WHERE id=$1", [sourceId]).catch(() => {});
	}
});
