/**
 * Détection de dérive sémantique : comportement du détecteur, délai gagné sur
 * le signalement humain, et critère SQL tel qu'exécuté par le vérificateur.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRIFT_MIN_LEAD_DAYS,
  detectSemanticDrift,
  jensenShannon,
  type SemanticFeed,
} from "../src/analyse/derive-semantique.js";
import { buildSemanticDriftFixture } from "../src/analyse/derive-semantique-fixture.js";
import { evaluateSemanticDrift } from "../src/analyse/derive-semantique-backtest.js";
import { insertSemanticFixture, runSemanticDriftCheck } from "../src/analyse/derive-semantique-store.js";
import { query } from "../src/db.js";

const fixture = buildSemanticDriftFixture();

test("JSD est nulle pour une distribution identique et bornée quand tout change", () => {
  assert.equal(jensenShannon({ a: 3, b: 1 }, { a: 6, b: 2 }), 0);
  assert.ok(jensenShannon({ a: 1 }, { b: 1 }) > 0.99);
  assert.equal(jensenShannon({}, { a: 1 }), 0);
});

test("un pic d'une journée n'émet aucune alerte", () => {
  const observations = Array.from({ length: 90 }, (_, index) => ({
    day: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
    terms: index === 60
      ? { surprise: 90, inattendu: 60 }
      : { habituel: 20, courant: 15, normal: 10 },
    coverage: { "ZONE-A": 20, "ZONE-B": 25 },
  }));
  const feed: SemanticFeed = { sourceId: "SPIKE", observations, expected: "unchanged" };
  assert.deepEqual(detectSemanticDrift([feed]), []);
});

test("jeu synthétique : 5 dérives détectées, 10 flux inchangés sans alerte", () => {
  const alerts = detectSemanticDrift(fixture.feeds);
  const stableAlerts = alerts.filter((alert) => alert.sourceId.startsWith("STABLE-"));
  assert.deepEqual(stableAlerts, [], "aucune alerte sur un flux inchangé");
  assert.equal(new Set(alerts.map((alert) => alert.sourceId)).size, 5);
  assert.deepEqual(
    alerts.map((alert) => alert.kind),
    ["vocabulaire", "vocabulaire", "vocabulaire", "couverture", "couverture"],
  );

  const backtest = evaluateSemanticDrift(fixture.feeds, fixture.annotations);
  assert.equal(backtest.metrics.confirmedEarly, 5);
  assert.equal(backtest.metrics.unchangedAlerts, 0);
  assert.equal(backtest.metrics.unchangedSources, 10);
  for (const row of backtest.evals) {
    assert.equal(row.early, true, `${row.sourceId} doit être détectée tôt`);
    assert.ok((row.leadDays ?? 0) >= DRIFT_MIN_LEAD_DAYS);
  }
});

test("le critère SQL lit 5 dérives confirmées et zéro alerte sur flux inchangés", async () => {
  await insertSemanticFixture(fixture);
  await runSemanticDriftCheck({ source: fixture.source });

  const early = await query<{ confirmed_early: string; target: string }>(
    `SELECT count(*) FILTER (WHERE early) AS confirmed_early, count(*) AS target
       FROM semantic_drift_eval WHERE model = 'jsd-coverage@1'`,
  );
  assert.equal(Number(early.rows[0]?.confirmed_early), 5);
  assert.equal(Number(early.rows[0]?.target), 5);

  const unchanged = await query<{ alerts: string }>(
    `SELECT count(*) AS alerts FROM semantic_drift_alert a
       JOIN semantic_drift_feed f USING (source_id) WHERE f.expected = 'unchanged'`,
  );
  assert.equal(Number(unchanged.rows[0]?.alerts), 0);

  const metric = await query<{
    annotated_drifts: number;
    confirmed_early: number;
    unchanged_sources: number;
    unchanged_alerts: number;
  }>(
    `SELECT annotated_drifts, confirmed_early, unchanged_sources, unchanged_alerts
       FROM semantic_drift_metric WHERE model = 'jsd-coverage@1'`,
  );
  assert.deepEqual(
    [
      metric.rows[0]?.annotated_drifts,
      metric.rows[0]?.confirmed_early,
      metric.rows[0]?.unchanged_sources,
      metric.rows[0]?.unchanged_alerts,
    ],
    [5, 5, 10, 0],
  );
});
