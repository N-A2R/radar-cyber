/**
 * Marché de prédictions régionales : la note doit exister en base, être
 * adossée à une résolution et rester sous le seuil de Brier annoncé.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  brierScore,
  buildRegionalForecasts,
  FORECAST_HORIZON_DAYS,
  FORECAST_MODEL,
  normalizeIncidentDate,
  type RegionalIncident,
  type RegionalForecast,
} from "../src/analyse/regional-forecast.js";
import { query } from "../src/db.js";

const INCIDENTS: RegionalIncident[] = [
  { dept: "33", date: "2025-01-01" },
  { dept: "33", date: "2025-01-06" },
  { dept: "64", date: "2025-02-05" },
];

function forecastAt(
  forecasts: readonly RegionalForecast[],
  dept: string,
  windowStart: string,
): RegionalForecast {
  const found = forecasts.find((f) => f.dept === dept && f.windowStart === windowStart);
  assert.ok(found, `pronostic absent pour ${dept} ${windowStart}`);
  return found;
}

test("les dates partielles sont normalisées sans inventer de jour", () => {
  assert.equal(normalizeIncidentDate("2024-10"), "2024-10-01");
  assert.equal(normalizeIncidentDate("2024-10-12"), "2024-10-12");
  assert.equal(normalizeIncidentDate("pas une date"), null);
});

test("chaque fenêtre porte une probabilité chiffrée et une résolution", () => {
  const forecasts = buildRegionalForecasts(INCIDENTS);
  assert.equal(forecasts.length, 2 * 3);
  for (const f of forecasts) {
    assert.ok(f.probability > 0 && f.probability < 1);
    assert.ok(f.outcome === 0 || f.outcome === 1);
    assert.equal(f.model, FORECAST_MODEL);
    const expected = new Date(Date.parse(`${f.windowStart}T00:00:00Z`) + FORECAST_HORIZON_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    assert.equal(f.resolvedAt, expected);
  }
  assert.equal(forecastAt(forecasts, "33", "2025-01-01").outcome, 1);
  assert.equal(forecastAt(forecasts, "64", "2025-01-15").outcome, 0);
  assert.equal(forecastAt(forecasts, "64", "2025-01-29").outcome, 1);
});

test("un incident futur ne modifie pas un pronostic déjà calculé", () => {
  const before = buildRegionalForecasts(INCIDENTS);
  const after = buildRegionalForecasts([...INCIDENTS, { dept: "64", date: "2025-03-15" }]);
  const earlier = forecastAt(before, "33", "2025-01-15");
  assert.deepEqual(forecastAt(after, "33", "2025-01-15"), earlier);
});

test("la probabilité réagit à l'histoire sans jamais atteindre 0 ou 1", () => {
  const forecasts = buildRegionalForecasts(INCIDENTS);
  const quiet = forecastAt(forecasts, "64", "2025-01-01");
  const active = forecastAt(forecasts, "33", "2025-01-15");
  assert.ok(active.probability > quiet.probability);
  assert.ok(forecasts.every((f) => f.probability > 0 && f.probability < 1));
});

test("le Brier est la moyenne des écarts au carré", () => {
  const forecasts = buildRegionalForecasts(INCIDENTS);
  const expected = forecasts.reduce((sum, f) => sum + (f.probability - f.outcome) ** 2, 0) / forecasts.length;
  assert.ok(Math.abs(brierScore(forecasts) - expected) < 1e-12);
  assert.ok(Number.isNaN(brierScore([])));
});

test("le critère chiffré est satisfait sur la base migrée", async () => {
  const shape = await query<{ missing: string }>(`
    SELECT count(*)::text AS missing FROM forecast
    WHERE resolved_at IS NULL OR probability IS NULL OR outcome NOT IN (0, 1)
  `);
  assert.equal(shape.rows[0]?.missing, "0");

  const result = await query<{ n: string; brier: number }>(`
    SELECT count(*) n, avg((probability-outcome)^2) brier
    FROM forecast WHERE resolved_at IS NOT NULL
    HAVING count(*)>=100 AND avg((probability-outcome)^2)<=0.15
  `);
  assert.equal(result.rows.length, 1, "le critère doit renvoyer une ligne");
  assert.ok(Number(result.rows[0].n) >= 100);
  assert.ok(result.rows[0].brier <= 0.15);
});
