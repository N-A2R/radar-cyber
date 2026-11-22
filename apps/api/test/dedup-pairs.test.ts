/**
 * Déduplication entre flux : le jeu annoté et le critère de sortie.
 *
 * La migration 205 matérialise 200 paires annotées (50 doublons réels) et
 * applique la règle `cross-flow@1` côté SQL. Ce test vérifie trois choses :
 *   1. le jeu porte bien 200 paires et 50 doublons ;
 *   2. la règle TypeScript (`event-pairs.ts`) reproduit chaque prédiction
 *      stockée — les deux implémentations ne peuvent pas diverger en silence ;
 *   3. le critère de sortie est tenu : précision ≥ 0,90, rappel ≥ 0,85.
 *
 * Le test lit la base de test créée par `test/run.ts` (init.sql + migrations),
 * jamais la base de production.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import { classifyEventPair, DEDUP_RULE_VERSION } from "../src/dedup/event-pairs.js";

after(async () => {
	await closePools().catch(() => {});
});

type PairRow = {
	id: string;
	a_title: string;
	a_day: string;
	b_title: string;
	b_day: string;
	is_duplicate: boolean;
	predicted: boolean;
};

type EvalRow = {
	n_pairs: number;
	n_duplicates: number;
	tp: number;
	fp: number;
	fn: number;
	tn: number;
	precision: number;
	recall: number;
	rule_version: string;
};

test("le jeu annoté porte 200 paires dont 50 doublons", async () => {
	const r = await query<{ n: number; d: number; v: string }>(
		`SELECT count(*)::int AS n,
		        count(*) FILTER (WHERE is_duplicate)::int AS d,
		        min(rule_version) AS v
		   FROM dedup_pair`,
	);
	assert.equal(r.rows[0]?.n, 200, "200 paires annotées attendues");
	assert.equal(r.rows[0]?.d, 50, "50 doublons annotés attendus");
	assert.equal(r.rows[0]?.v, DEDUP_RULE_VERSION);
});

test("la règle TypeScript reproduit chaque prédiction stockée", async () => {
	const r = await query<PairRow>(
		`SELECT id, a_title, to_char(a_day, 'YYYY-MM-DD') AS a_day,
		        b_title, to_char(b_day, 'YYYY-MM-DD') AS b_day,
		        is_duplicate, predicted
		   FROM dedup_pair ORDER BY id`,
	);
	assert.equal(r.rows.length, 200);
	for (const row of r.rows) {
		const verdict = classifyEventPair(
			{ title: row.a_title, day: row.a_day },
			{ title: row.b_title, day: row.b_day },
		);
		assert.equal(
			verdict.duplicate,
			row.predicted,
			`${row.id} : TypeScript=${verdict.duplicate} SQL=${row.predicted} (${verdict.reason})`,
		);
	}
});

test("le critère de sortie est tenu : précision ≥ 0,90 et rappel ≥ 0,85", async () => {
	const r = await query<EvalRow>(
		`SELECT n_pairs, n_duplicates, tp, fp, fn, tn,
		        tp::float / (tp + fp) AS precision,
		        tp::float / (tp + fn) AS recall,
		        rule_version
		   FROM dedup_eval`,
	);
	assert.equal(r.rows.length, 1, "dedup_eval doit porter une seule ligne agrégée");
	const e = r.rows[0]!;
	assert.equal(e.rule_version, DEDUP_RULE_VERSION);
	assert.equal(e.n_pairs, 200);
	assert.equal(e.n_duplicates, 50);
	assert.equal(e.tp + e.fp + e.fn + e.tn, 200);
	assert.ok(e.precision >= 0.9, `précision ${e.precision} < 0,90`);
	assert.ok(e.recall >= 0.85, `rappel ${e.recall} < 0,85`);
});

test("les cas difficiles sont classés pour la bonne raison", () => {
	// Paraphrase : ordre et vocabulaire changent, l'entité et le jour restent.
	assert.equal(
		classifyEventPair(
			{ title: "CHU de Bordeaux victime d'un rançongiciel : activité suspendue", day: "2026-11-02" },
			{ title: "Bordeaux : une cyberattaque paralyse les services de l'hôpital", day: "2026-11-03" },
		).duplicate,
		true,
	);
	// Synonyme d'établissement : CHU et hôpital désignent la même entité.
	assert.equal(
		classifyEventPair(
			{ title: "CHU de Limoges visé par une cyberattaque", day: "2026-11-04" },
			{ title: "Hôpital de Limoges : une intrusion informatique perturbe la prise en charge", day: "2026-11-04" },
		).duplicate,
		true,
	);
	// Même ville, établissements différents : jamais un doublon.
	assert.equal(
		classifyEventPair(
			{ title: "Mairie de Pau victime d'un rançongiciel", day: "2026-11-05" },
			{ title: "Hôpital de Pau cible d'une attaque DDoS", day: "2026-11-05" },
		).duplicate,
		false,
	);
	// Même entité, faits séparés dans le temps : deux événements.
	assert.equal(
		classifyEventPair(
			{ title: "Mairie de Niort victime d'une fuite de données", day: "2026-11-06" },
			{ title: "Mairie de Niort : des données personnelles diffusées en ligne", day: "2026-11-20" },
		).duplicate,
		false,
	);
});
