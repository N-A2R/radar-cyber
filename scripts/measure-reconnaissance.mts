/**
 * Reproducible measurement of reconnaissance-phase detections in
 * Nouvelle-Aquitaine.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:reconnaissance
 *   DATABASE_URL=... pnpm measure:reconnaissance --json=bench/results/reconnaissance.json
 *
 * The script reads the real observation stores through the same loader and
 * pure detector as GET /api/reconnaissance. The JSON carries identifiers,
 * department codes, signal names and counters only: no hostname, IP address,
 * organization name or victim data.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import { SQL } from "../apps/api/src/reconnaissance/load.js";
import { measureReconnaissance } from "../apps/api/src/reconnaissance/measure.js";

const argv = process.argv.slice(2);
const output =
  argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/reconnaissance-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureReconnaissance();
  const result = {
    command: "pnpm measure:reconnaissance",
    scope: measurement.scope,
    basis: measurement.basis,
    count: measurement.count,
    candidates: measurement.candidates,
    falsePositives: measurement.falsePositives,
    falsePositiveRate: Number(measurement.falsePositiveRate.toFixed(6)),
    signals: measurement.signals,
    candidateSignals: measurement.candidateSignals,
    observations: measurement.observations,
    baseline: measurement.baseline,
    detections: measurement.detections,
    sql: SQL,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `NA reconnaissance: ${measurement.count} detections / ${measurement.candidates} candidates ` +
      `(${(measurement.falsePositiveRate * 100).toFixed(2)}% false positives) -> ${output}`,
  );
  console.log(
    `verified signals: service_fingerprint=${measurement.signals.service_fingerprint} ` +
      `subdomain_enumeration=${measurement.signals.subdomain_enumeration} ` +
      `dns_observation=${measurement.signals.dns_observation}`,
  );
  console.log(
    `candidate signals: service_fingerprint=${measurement.candidateSignals.service_fingerprint} ` +
      `subdomain_enumeration=${measurement.candidateSignals.subdomain_enumeration} ` +
      `dns_observation=${measurement.candidateSignals.dns_observation}`,
  );
  console.log(
    `baseline: organizations=${measurement.baseline.organizations} ` +
      `sources=${measurement.baseline.sources} events=${measurement.baseline.events} ` +
      `dns_resolved=${measurement.baseline.dnsResolved}`,
  );
} finally {
  await closePools();
}
