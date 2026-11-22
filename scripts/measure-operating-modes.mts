#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of the number of operating modes identified.
 *
 * Read-only against the live database; no network call, no paid service, no
 * victim data in the output. Only Nouvelle-Aquitaine events (`regional = true`)
 * are clustered; grey sources are included on the same footing as official
 * ones.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-operating-modes.mts
 *
 * Add `--json=bench/results/operating-modes.json` to publish the measurement.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	clusterOperatingModes,
	type ModeEvent,
} from "../apps/api/src/analyse/operating-modes.js";

type EventRow = {
  id: number;
  family: string;
  assertion_type: string;
  title: string;
  evidence: unknown;
  source_id: string;
  regional: boolean;
};

type BaselineRow = {
  organisations: string;
  sources: string;
  events: string;
};

const argv = process.argv.slice(2);
const jsonPath = argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length) ?? null;

function evidenceOf(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

async function measure(): Promise<void> {
  const [events, baseline] = await Promise.all([
    query<EventRow>(
      `SELECT e.id, e.family, e.assertion_type, e.title, e.evidence,
              e.source_id, e.regional
         FROM event e
        ORDER BY e.id`,
    ),
    query<BaselineRow>(
      `SELECT (SELECT count(*) FROM org)::text AS organisations,
              (SELECT count(*) FROM source)::text AS sources,
              (SELECT count(*) FROM event)::text AS events`,
    ),
  ]);

  const modeEvents: ModeEvent[] = events.rows.map((row) => ({
    id: Number(row.id),
    family: row.family,
    assertionType: row.assertion_type,
    title: row.title,
    evidence: evidenceOf(row.evidence),
    sourceId: row.source_id,
    regional: row.regional === true,
  }));
  const analysis = clusterOperatingModes(modeEvents);
  if (analysis.regional === 0) {
    throw new Error("no Nouvelle-Aquitaine event found: refusing to publish a zero-mode measurement");
  }

  const row = baseline.rows[0];
  const result = {
    generatedAt: new Date().toISOString(),
    scope: "Nouvelle-Aquitaine (event.regional = true); grey sources included",
    baseline: {
      organisations: Number(row?.organisations ?? 0),
      sources: Number(row?.sources ?? 0),
      events: Number(row?.events ?? 0),
    },
    input: {
      scanned: analysis.scanned,
      regional: analysis.regional,
      classified: analysis.classified,
      unclassified: analysis.unclassified,
    },
    modesIdentified: analysis.count,
    modes: analysis.modes,
  };
  const serialised = `${JSON.stringify(result, null, 2)}\n`;
  process.stdout.write(serialised);
  if (jsonPath !== null) writeFileSync(jsonPath, serialised, "utf8");
}

measure()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void closePools();
  });
