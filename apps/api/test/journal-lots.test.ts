import { test } from "node:test";
import assert from "node:assert/strict";
import { consignerLotAvec, type JournalEntry } from "../src/journal/index.js";

/**
 * Le 13 novembre 2026, 6 072 événements sont restés sans trace : les faits
 * d'une collecte partaient en un seul INSERT, tout échec — avalé par les
 * appelants — perdait le lot entier sans laisser de trace. Ce test fige les
 * trois étages du correctif : paquets bornés, repli ligne à ligne, lacune
 * consignée quand même.
 */
const fait = (n: number): JournalEntry => ({
	kind: "event.rattachement",
	subject: `dedup:lot-${n}`,
	summary: `fait ${n}`,
	actor: "test",
	payload: { orgId: n },
	validAt: "2026-11-13T00:00:00.000Z",
});

type Appel = { text: string; params?: readonly unknown[] };

const runQuiTrace = (appels: Appel[]) =>
	async (text: string, params?: readonly unknown[]) => {
		appels.push({ text, params });
		return { rows: [] };
	};

test("un lot part par paquets bornés, pas en un seul INSERT", async () => {
	const appels: Appel[] = [];
	const r = await consignerLotAvec(runQuiTrace(appels), Array.from({ length: 260 }, (_, i) => fait(i)));
	assert.equal(r.consignes, 260);
	assert.equal(r.lacunes, 0);
	assert.equal(r.erreurs.length, 0);
	assert.equal(appels.length, 2);
	assert.equal(appels[0].params?.length, 250 * 6);
	assert.equal(appels[1].params?.length, 10 * 6);
});

test("un paquet qui échoue est rejoué ligne à ligne : rien n'est perdu", async () => {
	const appels: Appel[] = [];
	// Multi-lignes refusé (simule la panne groupée du 13/11), ligne seule acceptée.
	const runner = async (text: string, params?: readonly unknown[]) => {
		appels.push({ text, params });
		if (text.includes(",(")) throw new Error("panne du lot");
		return { rows: [] };
	};
	const r = await consignerLotAvec(runner, [fait(1), fait(2), fait(3)]);
	assert.equal(r.consignes, 3);
	assert.equal(r.lacunes, 0);
	assert.equal(r.erreurs.length, 0);
	// 1 tentative groupée + 3 lignes.
	assert.equal(appels.length, 4);
});

test("une ligne refusée devient un fait journal.lacune, pas un angle mort", async () => {
	const appels: Appel[] = [];
	const runner = async (text: string, params?: readonly unknown[]) => {
		appels.push({ text, params });
		const kind = params?.[0];
		if (kind === "event.rattachement") throw new Error("refus de la base");
		return { rows: [] };
	};
	const r = await consignerLotAvec(runner, [fait(1), fait(2)]);
	assert.equal(r.consignes, 2);
	assert.equal(r.lacunes, 2);
	assert.equal(r.erreurs.length, 0);
	const lacunes = appels.filter((a) => a.params?.[0] === "journal.lacune");
	assert.equal(lacunes.length, 2);
	assert.match(String(lacunes[0].params?.[2]), /event\.rattachement non consigné/);
	assert.equal(lacunes[0].params?.[1], "dedup:lot-1");
});

test("les octets nuls des flux sont nettoyés avant l'insertion", async () => {
	const appels: Appel[] = [];
	const toxique: JournalEntry = {
		kind: "event.rattachement",
		subject: "dedup:avec\u0000nul",
		summary: "description venue du feed\u0000ici",
		actor: "test",
		payload: { extrait: "texte\u0000cassé" },
		validAt: null,
	};
	const r = await consignerLotAvec(runQuiTrace(appels), [toxique]);
	assert.equal(r.consignes, 1);
	const envoyes = appels[0].params ?? [];
	for (const valeur of envoyes) {
		if (typeof valeur === "string") {
			assert.ok(!valeur.includes("\u0000"), "aucun octet nul dans les paramètres");
			assert.ok(!valeur.includes("\\u0000"), "aucune séquence d'échappement nulle dans le JSON");
		}
	}
});

test("journal indisponible : rien n'est inventé, les erreurs remontent", async () => {
	const runner = async () => {
		throw new Error("journal indisponible");
	};
	const r = await consignerLotAvec(runner, Array.from({ length: 7 }, (_, i) => fait(i)));
	assert.equal(r.consignes, 0);
	assert.equal(r.lacunes, 0);
	// 5 lignes tentées + le message d'abandon du paquet.
	assert.equal(r.erreurs.length, 6);
	assert.match(r.erreurs[5] ?? "", /abandonné/);
});
