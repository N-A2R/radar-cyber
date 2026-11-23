/**
 * Reproducible measurement of the top-5 hosting-outage scenario in Nouvelle-Aquitaine.
 *
 *   pnpm measure:hosting-outage
 *   pnpm measure:hosting-outage --json=bench/results/hosting-outage.json
 *
 * Read-only: no DNS query, no paid service, no victim data. The output contains
 * aggregate counters and provider names only.
 */
import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

const { measureHostingOutage } = await import("../apps/api/src/analyse/hosting-outage-store.js");
const { closePools } = await import("../apps/api/src/db.js");

const argv = process.argv.slice(2);
const outageSize = Number(argv.find((arg) => arg.startsWith("--outage="))?.slice(9) ?? 5);
const output =
	argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length) ??
	"bench/results/hosting-outage.json";

try {
	const measurement = await measureHostingOutage(outageSize);
	const result = {
		command: "pnpm measure:hosting-outage",
		scope: measurement.scope,
		outageSize: measurement.outageSize,
		providers: measurement.providers,
		organizationsAffected: measurement.organizationsAffected,
		totals: {
			organizationsObserved: measurement.organizationsObserved,
			domainsObserved: measurement.domainsObserved,
			attributedDomains: measurement.attributedDomains,
			unknownHosts: measurement.unknownHosts,
			sumProviderOrganizations: measurement.sumProviderOrganizations,
			overlappingOrganizations: measurement.overlappingOrganizations,
		},
		baseline: measurement.baseline,
		corpus: measurement.corpus,
		sources: [
			"bench/corpus/institutions-complet.jsonl (public institutional corpus, ids and URLs only)",
			"dns_passive_resolution (public NS/MX observations)",
			"HOSTING_CATALOGUE (public provider suffix facts)",
		],
		measuredAt: measurement.measuredAt,
	};
	mkdirSync(dirname(output), { recursive: true });
	writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
	const list = measurement.providers.map((provider) => `${provider.name}=${provider.organizations}`).join(", ");
	console.log(
		`OBJECTIF organisations touchées=${measurement.organizationsAffected} ` +
			`(chute simultanée des ${measurement.outageSize} principaux hébergeurs : ${list}) -> ${output}`,
	);
} finally {
	await closePools();
}
