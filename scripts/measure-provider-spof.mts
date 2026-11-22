/**
 * Reproducible measurement of digital single points of failure in Nouvelle-Aquitaine.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:provider-spof
 *   DATABASE_URL=... pnpm measure:provider-spof --json=bench/results/provider-spof.json
 *
 * The output contains aggregate counters and provider names only. No victim
 * data, organization name or domain is read or written.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { measureProviderSpof, SQL } from "../apps/api/src/analyse/provider-spof-store.js";
import { closePools } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const output =
	argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
	"bench/results/provider-spof.json";

try {
	const measurement = await measureProviderSpof();
	const result = {
		command: "pnpm measure:provider-spof",
		scope: measurement.scope,
		threshold: measurement.threshold,
		providers: measurement.providers,
		totals: {
			organizationsObserved: measurement.organizationsObserved,
			organizationsAttributed: measurement.organizationsAttributed,
			domainsObserved: measurement.domainsObserved,
			unknownHosts: measurement.unknownHosts,
		},
		baseline: measurement.baseline,
		sql: SQL,
		measuredAt: measurement.measuredAt,
	};
	mkdirSync(dirname(output), { recursive: true });
	writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
	const list = measurement.providers
		.map((provider) => `${provider.name}=${provider.organizations}`)
		.join(", ");
	console.log(
		`NA providers above ${measurement.threshold} organizations: ` +
			`${measurement.providers.length} (${list}) -> ${output}`,
	);
} finally {
	await closePools();
}
