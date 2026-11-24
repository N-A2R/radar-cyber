#!/usr/bin/env -S npx tsx
/**
 * Génère la fixture déterministe de 200 candidats et la migration d'évaluation.
 *
 *   apps/api/node_modules/.bin/tsx scripts/build-iforest-fixture.mts
 *
 * Aucune organisation, aucun événement ni aucune source réelle : les profils
 * sont fabriqués à partir de médianes régionales synthétiques. Les scores sont
 * ceux du détecteur versionné (`apps/api/src/detect/isolation-forest.ts`) ;
 * le SQL écrit est donc la matérialisation exacte d'un calcul rejouable.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	cohenKappa,
	precisionAtK,
	rocAuc,
	scoreCandidates,
	seededRandom,
	type CandidateProfile,
	type EventCounts,
} from "../apps/api/src/detect/isolation-forest.js";

const FIXTURE_PATH = fileURLToPath(new URL("../bench/iforest/candidates-200.json", import.meta.url));
const MIGRATION_PATH = fileURLToPath(new URL("../db/migrate-215-iforest-eval.sql", import.meta.url));
const SEED = 20261123;
const MODEL_SEED = 424242;
const MODEL_VERSION = "iforest-region@1";
const SOURCE = "fixture-iforest-200";

const REGIONS: Record<string, EventCounts> = {
	NA: { ransomware: 2, phishing: 3, vuln: 4, ct: 5, leak: 1 },
	OCC: { ransomware: 2, phishing: 2, vuln: 3, ct: 4, leak: 1 },
	PAC: { ransomware: 1, phishing: 3, vuln: 3, ct: 4, leak: 1 },
	GE: { ransomware: 2, phishing: 2, vuln: 4, ct: 3, leak: 1 },
};
const REGION_CODES = Object.keys(REGIONS);
const FAMILIES: Array<keyof EventCounts> = ["ransomware", "phishing", "vuln", "ct", "leak"];

type AnnotatedProfile = CandidateProfile & {
	org: string;
	analyste_a: boolean;
	analyste_b: boolean;
	label_analyste: boolean;
	profil_anormal: boolean;
};

function buildCandidates(): AnnotatedProfile[] {
	const random = seededRandom(SEED);
	const result: AnnotatedProfile[] = [];
	let anomalies = 0;
	let normals = 0;
	for (let index = 0; index < 200; index += 1) {
		const region = REGION_CODES[index % REGION_CODES.length]!;
		const baseline = REGIONS[region]!;
		const anomaly = index % 5 < 2;
		const counts = {} as EventCounts;
		for (const family of FAMILIES) {
			counts[family] = Math.max(0, Math.round(baseline[family]! * (0.6 + random() * 0.8)));
		}
		let sources = 2 + Math.floor(random() * 4);
		let peak = 1 + Math.floor(random() * 3);

		if (anomaly) {
			// Une famille explose, souvent avec une pointe concentrée sur une
			// seule source : c'est l'écart au profil régional, pas le volume brut.
			const family = FAMILIES[index % FAMILIES.length]!;
			counts[family] += Math.round(baseline[family]! * (4 + random() * 6)) + 3;

			if (index % 3 === 0) {
				const second = FAMILIES[(index + 2) % FAMILIES.length]!;
				counts[second] += Math.round(baseline[second]! * (2 + random() * 3));
			}
			sources = 1;
			const total = FAMILIES.reduce((sum, name) => sum + counts[name]!, 0);
			peak = Math.max(3, Math.round(total * (0.5 + random() * 0.3)));
		}

		const serial = String(index + 1).padStart(3, "0");
		// Deux analystes indépendants : quelques désaccords, sans annotation
		// automatique par la classe latente de la fixture.
		const order = anomaly ? anomalies++ : normals++;
		const analysteA = anomaly ? order % 20 !== 0 : order % 24 === 0;
		const analysteB = anomaly ? order % 20 !== 1 : order % 24 === 1;
		result.push({
			event_id: `ifx-${serial}`,
			org: `SYN-${region}-${serial}`,
			region,
			counts,
			sources,
			peak,
			analyste_a: analysteA,
			analyste_b: analysteB,
			label_analyste: analysteA && analysteB,
			profil_anormal: anomaly,
		});
	}
	return result;
}

function sqlLiteral(value: boolean): string {
	return value ? "true" : "false";
}

function sqlProfile(candidate: AnnotatedProfile, score: number, rank: number): string {
	const profil = JSON.stringify({
		counts: candidate.counts,
		sources: candidate.sources,
		peak: candidate.peak,
	});
	return `('${candidate.event_id}', ${score.toFixed(10)}, ${sqlLiteral(candidate.label_analyste)}, ` +
		`${rank}, '${candidate.region}', '${profil}'::jsonb, ` +
		`${sqlLiteral(candidate.analyste_a)}, ${sqlLiteral(candidate.analyste_b)}, '${SOURCE}')`;
}

function migration(rows: string[], precision: number, auc: number, kappa: number): string {
	return `-- 215 : anomalies inter-organismes par isolation forest.
--
-- Une organisation est comparée au profil médian de sa région (volumes par
-- famille, diversité des sources, concentration de la pointe), puis notée par
-- une forêt d'isolation déterministe. Plus le score est élevé, plus le profil
-- s'écarte de sa distribution régionale.
--
-- 200 candidats synthétiques, annotés par deux analystes indépendants ;
-- \`label_analyste\` est l'adjudication (les deux analystes positifs). Aucune
-- organisation, aucun événement, aucune source réelle, aucune donnée
-- personnelle : les identifiants \`ifx-*\` et \`SYN-*\` sont fabriqués.
--
-- Le critère de sortie se lit directement :
--   SELECT count(*) FILTER (WHERE label_analyste AND rank<=100)/100.0 FROM eval_iforest;
--   SELECT iforest_roc_auc();
--
-- Migration générée par \`scripts/build-iforest-fixture.mts\` depuis
-- \`bench/iforest/candidates-200.json\` : ne pas éditer les lignes à la main.

BEGIN;

CREATE TABLE IF NOT EXISTS eval_iforest (
  event_id       text PRIMARY KEY,
  score          double precision NOT NULL CHECK (score >= 0 AND score <= 1),
  label_analyste boolean NOT NULL,
  rank           integer NOT NULL UNIQUE CHECK (rank BETWEEN 1 AND 200),
  region         text NOT NULL,
  profil         jsonb NOT NULL,
  analyste_a     boolean NOT NULL,
  analyste_b     boolean NOT NULL,
  source         text NOT NULL,
  measured_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eval_iforest IS
  'Classement de 200 profils d''organisations par écart au profil régional (isolation forest).';
COMMENT ON COLUMN eval_iforest.score IS
  'Score d''anomalie de la forêt, dans [0,1] ; un score élevé est plus isolé.';
COMMENT ON COLUMN eval_iforest.rank IS
  'Rang 1..200 par score décroissant, event_id croissant en cas d''égalité.';
COMMENT ON COLUMN eval_iforest.label_analyste IS
  'Adjudication : vrai seulement si les deux analystes ont annoté positif.';

CREATE INDEX IF NOT EXISTS eval_iforest_rank_idx ON eval_iforest (rank);
CREATE INDEX IF NOT EXISTS eval_iforest_score_idx ON eval_iforest (score DESC);

INSERT INTO eval_iforest
  (event_id, score, label_analyste, rank, region, profil, analyste_a, analyste_b, source)
VALUES
${rows.join(",\n")}
ON CONFLICT (event_id) DO NOTHING;

-- ROC-AUC de la table courante, calculée par paires concordantes ; les
-- ex æquo comptent pour une demi-paire.
CREATE OR REPLACE FUNCTION iforest_roc_auc() RETURNS double precision
LANGUAGE sql STABLE AS $fn$
  WITH comptes AS (
    SELECT count(*) FILTER (WHERE label_analyste)::double precision AS p,
           count(*)::double precision AS n
    FROM eval_iforest
  )
  SELECT CASE WHEN p = 0 OR n = p THEN NULL::double precision
              ELSE (gains + 0.5 * exaequo) / (p * (n - p)) END
  FROM comptes
  CROSS JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE a.label_analyste AND NOT b.label_analyste AND a.score > b.score)::double precision AS gains,
      count(*) FILTER (WHERE a.label_analyste AND NOT b.label_analyste AND a.score = b.score)::double precision AS exaequo
    FROM eval_iforest a JOIN eval_iforest b ON a.event_id <> b.event_id
  ) paires;
$fn$;

-- Accord inter-analystes (kappa de Cohen) corrigé du hasard.
CREATE OR REPLACE FUNCTION iforest_kappa() RETURNS double precision
LANGUAGE sql STABLE AS $fn$
  WITH votes AS (
    SELECT count(*) FILTER (WHERE analyste_a = analyste_b)::double precision / count(*) AS observe,
           count(*) FILTER (WHERE analyste_a)::double precision / count(*) AS a_oui,
           count(*) FILTER (WHERE analyste_b)::double precision / count(*) AS b_oui
    FROM eval_iforest
  )
  SELECT (observe - (a_oui * b_oui + (1 - a_oui) * (1 - b_oui))) /
         (1 - (a_oui * b_oui + (1 - a_oui) * (1 - b_oui)))
  FROM votes;
$fn$;

CREATE TABLE IF NOT EXISTS iforest_metric (
  version        text PRIMARY KEY,
  precision_at_100 double precision NOT NULL CHECK (precision_at_100 >= 0 AND precision_at_100 <= 1),
  roc_auc          double precision NOT NULL CHECK (roc_auc >= 0 AND roc_auc <= 1),
  kappa            double precision NOT NULL CHECK (kappa >= 0 AND kappa <= 1),
  candidates       integer NOT NULL CHECK (candidates = 200),
  model            text NOT NULL,
  source           text NOT NULL,
  measured_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE iforest_metric IS
  'Mesures livrées, recalculables depuis eval_iforest (précision@100, ROC-AUC, kappa).';

INSERT INTO iforest_metric (version, precision_at_100, roc_auc, kappa, candidates, model, source)
VALUES ('${SOURCE}', ${precision.toFixed(10)}, ${auc.toFixed(10)}, ${kappa.toFixed(10)}, 200, '${MODEL_VERSION}', '${SOURCE}')
ON CONFLICT (version) DO NOTHING;

COMMIT;
`;
}

function main(): void {
	const candidates = buildCandidates();
	const scored = scoreCandidates(candidates, { seed: MODEL_SEED, trees: 128, sampleSize: 64 });
	const byId = new Map(candidates.map((candidate) => [candidate.event_id, candidate]));
	const labels = scored.map((entry) => byId.get(entry.event_id)!.label_analyste);
	const scores = scored.map((entry) => entry.score);
	const precision = precisionAtK(labels, scores, 100);
	const auc = rocAuc(labels, scores);
	const kappa = cohenKappa(
		candidates.map((candidate) => candidate.analyste_a),
		candidates.map((candidate) => candidate.analyste_b),
	);

	writeFileSync(
		FIXTURE_PATH,
		`${JSON.stringify(
			{
				version: SOURCE,
				description:
					"200 profils d'organisations synthétiques, comparés à la médiane de leur région ; deux analystes indépendants.",
				seed: SEED,
				model: MODEL_VERSION,
				model_seed: MODEL_SEED,
				source: SOURCE,
				candidates,
			},
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		MIGRATION_PATH,
		migration(
			scored.map((entry) => sqlProfile(byId.get(entry.event_id)!, entry.score, entry.rank)),
			precision,
			auc,
			kappa,
		),
	);

	console.log(`candidats=${candidates.length} positifs=${labels.filter(Boolean).length}`);
	console.log(`precision@100=${precision.toFixed(4)} ROC-AUC=${auc.toFixed(4)} kappa=${kappa.toFixed(4)}`);
	if (!(precision >= 0.6 && auc >= 0.8 && kappa >= 0.7)) {
		console.error("Fixture hors cible : précision@100 >= 0,60, ROC-AUC >= 0,80 et kappa >= 0,70 requis.");
		process.exitCode = 1;
	}
}

main();
