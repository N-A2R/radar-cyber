/**
 * Executable example: read the live regional observatory with the TypeScript SDK.
 * Run: RADAR_API_BASE_URL=http://127.0.0.1:8080/api tsx examples/overview.ts
 */
import { createRadarClient, NA_DEPARTMENTS } from "../src/index.js";

const client = createRadarClient();

const [health, stats, overview] = await Promise.all([
  client.getHealth(),
  client.getStats(),
  client.getNaOverview(),
]);

if (!health.ok) throw new Error("API health check failed");
if (health.sources !== stats.sources.total) {
  throw new Error("source counts disagree between /health and /stats");
}
if (overview.departments.length !== NA_DEPARTMENTS.length) {
  throw new Error("regional overview is not limited to the twelve NA departments");
}

console.log("sdk=typescript scope=NA");
console.log(`organisations=${stats.orgs} sources=${health.sources} events=${stats.events}`);
console.log(
  `na_departments=${overview.departments.length} ` +
    `na_organisations=${overview.total.organisations} na_events=${overview.total.events}`,
);
console.log("status=OK");
