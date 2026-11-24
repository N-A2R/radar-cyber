#!/usr/bin/env -S npx tsx
/**
 * Vérifie l'objectif chiffré de la détection de dérive sémantique.
 *
 *   pnpm verifie:derive-semantique
 *
 * Crée une base PostgreSQL éphémère, y charge le jeu synthétique déterministe
 * (5 flux dérivants annotés, 10 flux inchangés), exécute le détecteur via le
 * point d'entrée de persistance, puis imprime les deux requêtes du critère et
 * leur sortie brute. Aucune donnée de production n'est lue ni modifiée ; la
 * base est détruite dans tous les cas.
 */
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";
import { buildSemanticDriftFixture } from "../apps/api/src/analyse/derive-semantique-fixture.js";
import { SEMANTIC_DRIFT_MODEL } from "../apps/api/src/analyse/derive-semantique.js";

const TARGET_EARLY = 5;
const TARGET_FALSE_ALERTS = 0;

const SQL_EARLY = `SELECT count(*) FILTER (WHERE early) AS confirmed_early, count(*) AS target
  FROM semantic_drift_eval WHERE model = '${SEMANTIC_DRIFT_MODEL}';`;
const SQL_UNCHANGED = `SELECT count(*) AS alerts
  FROM semantic_drift_alert a
  JOIN semantic_drift_feed f USING (source_id)
 WHERE f.expected = 'unchanged';`;

function table(columns: readonly string[], rows: readonly (readonly unknown[])[]): void {
  const cells = rows.map((row) => row.map((value) => value === null ? "NULL" : String(value)));
  const widths = columns.map((name, index) =>
    Math.max(name.length, ...cells.map((row) => row[index]?.length ?? 0)));
  console.log(` ${columns.map((name, i) => name.padEnd(widths[i]!)).join(" | ")} `);
  console.log(`-${widths.map((width) => "-".repeat(width + 2)).join("-")}-`);
  for (const row of cells) {
    console.log(` ${row.map((value, i) => value.padEnd(widths[i]!)).join(" | ")} `);
  }
  console.log(`(${rows.length} row${rows.length === 1 ? "" : "s"})`);
}

const db = await createTestDatabase();
process.env.DATABASE_URL = db.url;
const { query, closePools } = await import("../apps/api/src/db.js");
const { insertSemanticFixture, runSemanticDriftCheck } = await import(
  "../apps/api/src/analyse/derive-semantique-store.js"
);

let code = 1;
try {
  const fixture = buildSemanticDriftFixture();
  const inserted = await insertSemanticFixture(fixture);
  await runSemanticDriftCheck({ source: fixture.source });

  console.log("== Jeu synthétique ==");
  console.log(`flux : ${fixture.feeds.length} (dérives annotées : ${fixture.annotations.length}, inchangés : ${fixture.feeds.filter((f) => f.expected === "unchanged").length})`);
  console.log(`observations quotidiennes insérées : ${inserted}`);
  console.log(`modèle : ${SEMANTIC_DRIFT_MODEL}`);

  console.log("\n== Critère : dérives confirmées >= 7 jours avant signalement ==");
  console.log(`SQL> ${SQL_EARLY}`);
  const early = await query<{ confirmed_early: string; target: string }>(SQL_EARLY);
  table(["confirmed_early", "target"], early.rows.map((row) => [row.confirmed_early, row.target]));
  const confirmed = Number(early.rows[0]?.confirmed_early ?? 0);

  console.log("\n== Critère : zéro alerte sur les flux synthétiques inchangés ==");
  console.log(`SQL> ${SQL_UNCHANGED}`);
  const unchanged = await query<{ alerts: string }>(SQL_UNCHANGED);
  table(["alerts"], unchanged.rows.map((row) => [row.alerts]));
  const falseAlerts = Number(unchanged.rows[0]?.alerts ?? 0);

  console.log("\n== Détail par dérive annotée ==");
  const detail = await query<{
    source_id: string;
    onset_day: string;
    reported_day: string;
    detected_on: string | null;
    lead_days: number | null;
    early: boolean;
  }>(`SELECT source_id, onset_day::text, reported_day::text, detected_on::text, lead_days, early
        FROM semantic_drift_eval WHERE model = $1 ORDER BY source_id`, [SEMANTIC_DRIFT_MODEL]);
  table(
    ["source_id", "onset_day", "reported_day", "detected_on", "lead_days", "early"],
    detail.rows.map((row) => [row.source_id, row.onset_day, row.reported_day, row.detected_on, row.lead_days, row.early]),
  );

  console.log("\n== Métrique persistée ==");
  const metric = await query<Record<string, unknown>>(
    `SELECT model, annotated_drifts, confirmed_early, unchanged_sources, unchanged_alerts, median_lead_days
       FROM semantic_drift_metric WHERE model = $1`,
    [SEMANTIC_DRIFT_MODEL],
  );
  table(Object.keys(metric.rows[0] ?? {}), metric.rows.map((row) => Object.values(row)));

  console.log("\n== Objectif ==");
  const reached = confirmed >= TARGET_EARLY && falseAlerts === TARGET_FALSE_ALERTS;
  console.log(
    `OBJECTIF : ${reached ? "atteint" : "partiel"} — ${confirmed} / ${TARGET_EARLY} dérives confirmées >= 7 jours avant signalement, ` +
    `${falseAlerts} / ${TARGET_FALSE_ALERTS} alertes sur ${fixture.feeds.filter((f) => f.expected === "unchanged").length} flux synthétiques inchangés`,
  );
  code = reached ? 0 : 1;
} finally {
  await closePools();
  await dropTestDatabase(db);
}
process.exit(code);
