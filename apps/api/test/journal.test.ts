import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { closePools, query } from "../src/db.js";
import { consigner, consignerLot, lireJournal, MOTEURS, resumeJournal } from "../src/journal/index.js";

/** Marqueur unique pour ne pas confondre nos lignes avec celles d'un autre test. */
const MARQUE = `test-journal-${Date.now()}`;

after(async () => {
	await closePools().catch(() => {});
});

describe("journal — append-only", () => {
	it("refuse une mise à jour", async () => {
		await consigner({
			kind: "match.decided",
			subject: MARQUE,
			summary: "fait de test",
			actor: "moteur:test",
		});
		await assert.rejects(
			() => query("UPDATE journal SET summary = 'réécrit' WHERE subject = $1", [MARQUE]),
			/append-only/,
		);
	});

	it("refuse une suppression", async () => {
		await assert.rejects(
			() => query("DELETE FROM journal WHERE subject = $1", [MARQUE]),
			/append-only/,
		);
	});

	it("refuse un TRUNCATE", async () => {
		await assert.rejects(() => query("TRUNCATE journal"), /append-only/);
	});

	it("garde le fait en place après les tentatives", async () => {
		const lignes = await lireJournal({ subject: MARQUE });
		assert.equal(lignes.length, 1);
		assert.equal(lignes[0]?.summary, "fait de test");
	});
});

describe("journal — bi-temporalité", () => {
	it("distingue le jour où le fait était vrai du jour où on l'a su", async () => {
		await consigner({
			kind: "event.rattachement",
			subject: `${MARQUE}-bitemp`,
			summary: "rattaché à la mairie",
			actor: `moteur:${MOTEURS.rattachement}`,
			validAt: "2025-03-10",
		});
		const [ligne] = await lireJournal({ subject: `${MARQUE}-bitemp` });
		assert.ok(ligne);
		// Le fait s'est produit en mars 2025, on l'apprend maintenant.
		assert.match(String(ligne.valid_at), /2025-03-10/);
		assert.ok(Date.parse(String(ligne.recorded_at)) > Date.parse("2025-03-10"));
	});

	it("laisse valid_at vide quand la source ne donne pas de date", async () => {
		await consigner({
			kind: "match.decided",
			subject: `${MARQUE}-sansdate`,
			summary: "aucune date connue",
			actor: "moteur:test",
		});
		const [ligne] = await lireJournal({ subject: `${MARQUE}-sansdate` });
		assert.equal(ligne?.valid_at, null);
	});
});

describe("journal — relire ce qu'on croyait à une date", () => {
	it("ne rend que les faits connus avant la date demandée", async () => {
		await consigner({
			kind: "event.rattachement",
			subject: `${MARQUE}-asof`,
			summary: "premier rattachement",
			actor: "moteur:gazetteer@1",
			payload: { orgId: 1 },
		});
		const demain = new Date(Date.now() + 24 * 3600 * 1000);
		const avant = await lireJournal({ subject: `${MARQUE}-asof`, asOf: new Date(0) });
		const apres = await lireJournal({ subject: `${MARQUE}-asof`, asOf: demain });
		assert.equal(avant.length, 0, "rien n'était connu à l'époque 0");
		assert.equal(apres.length, 1);
	});
});

describe("journal — le pourquoi est conservé", () => {
	it("garde le moteur, sa version et la preuve", async () => {
		await consigner({
			kind: "event.rattachement",
			subject: `${MARQUE}-preuve`,
			summary: "rattaché par alias",
			actor: `moteur:${MOTEURS.rattachement}`,
			payload: { orgId: 42, alias: "ville de tarnos", motif: "alias-role", confiance: 0.95 },
		});
		const [ligne] = await lireJournal({ subject: `${MARQUE}-preuve` });
		assert.equal(ligne?.actor, `moteur:${MOTEURS.rattachement}`);
		assert.equal(ligne?.payload.motif, "alias-role");
		assert.equal(ligne?.payload.confiance, 0.95);
	});
});

describe("journal — écriture groupée", () => {
	it("consigne N faits et rend la comptabilité", async () => {
		const faits = [1, 2, 3].map((n) => ({
			kind: "match.decided" as const,
			subject: `${MARQUE}-lot-${n}`,
			summary: `fait ${n}`,
			actor: "moteur:test",
		}));
		const lot = await consignerLot(faits);
		assert.equal(lot.consignes, 3);
		assert.equal(lot.lacunes, 0);
		assert.equal(lot.erreurs.length, 0);
		const resumes = await resumeJournal();
		assert.ok((resumes["match.decided"] ?? 0) >= 3);
	});

	it("ne fait rien sur une liste vide", async () => {
		assert.deepEqual(await consignerLot([]), { consignes: 0, lacunes: 0, erreurs: [] });
	});
});

describe("journal — robustesse", () => {
	it("ne lève pas quand l'écriture échoue, et rend l'erreur", async () => {
		// `kind` dépasse la limite de résumé : on force un échec côté base en
		// passant une valeur que la colonne refuse.
		const resultat = await consigner({
			kind: "review.decided",
			subject: `${MARQUE}-erreur`,
			summary: "x".repeat(10),
			actor: "humain:test",
			// JSON.stringify d'un BigInt lève, ce qui simule une défaillance de sérialisation.
			payload: { valeur: 1n } as unknown as Record<string, unknown>,
		});
		assert.equal(resultat.ok, false);
		assert.ok(resultat.error);
	});
});
