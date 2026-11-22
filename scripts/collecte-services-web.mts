#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Materialises HTTP-verified organisation domains as exposed web services.
 *
 * Source: `org_enrichissement` rows whose proof records a real HTTP 200 answer
 * on the organisation's own domain. DNS resolution supplies the public IP;
 * the domain, status and provider are kept as evidence. No page content, no
 * organisation name and no victim data is stored.
 *
 * Usage:
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-web.mts \
 *     --limit=200 [--apply] [--report=bench/results/services-web-2026-11-22.json]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve4 } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	enregistrerServicesWeb,
	isPublicIpv4,
	measureExposition,
	webServiceFromVerifiedWebsite,
	type VerifiedWebsiteRow,
	type WebService,
} from "../apps/api/src/exposition/web-service.js";

const PROVENANCE_SQL = `
  SELECT e.org_id AS "orgId", o.dept, o.domain, e.source, e.confiance AS confidence, e.preuve AS proof
  FROM org_enrichissement e
  JOIN org o ON o.id = e.org_id
  WHERE e.champ = 'domaine'
    AND e.confiance >= 0.8
    AND e.preuve->>'statut' = '200'
    AND o.dept = ANY($1::text[])
  ORDER BY e.org_id
`;
const DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}


async function withConcurrency<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await work(items[index]!);
		}
	}));
	return results;
}

export async function collectWebServices(): Promise<{
	applied: boolean;
	examined: number;
	written: number;
	services: WebService[];
	measurement: Awaited<ReturnType<typeof measureExposition>>;
}> {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "200")));
	const report = option("report", "bench/results/services-web-2026-11-22.json");
	const consultedAt = new Date();
	const rows = await query<VerifiedWebsiteRow>(PROVENANCE_SQL, [DEPARTMENTS]);
	const offset = Math.max(0, Number(option("offset", "0")));
	const candidates = rows.rows.slice(offset, offset + limit);
	const resolved = await withConcurrency(candidates, 16, async (row) => {
		const domain = row.domain?.trim().toLowerCase();
		if (!domain) return null;
		try {
			const addresses = await resolve4(domain, { timeout: 4000 });
			return addresses.find(isPublicIpv4) ?? null;
		} catch {
			return null;
		}
	});
	const services = candidates
		.map((row, index) => webServiceFromVerifiedWebsite(row, resolved[index] ?? "", consultedAt))
		.filter((service): service is WebService => service !== null);
	const written = apply ? await enregistrerServicesWeb(services) : 0;
	const measurement = await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		applied: apply,
		source: "org_enrichissement:http-200",
		examined: candidates.length,
		written,
		services: services.map((service) => ({
			orgId: service.orgId, domain: service.evidence.domain, ip: service.ip,
			port: service.port, sourceUrl: service.sourceUrl, provider: service.evidence.provider,
		})),
		measurement,
	}, null, 2)}\n`);
	return { applied: apply, examined: candidates.length, written, services, measurement };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const result = await collectWebServices();
		console.log(
			`NA web services: ${result.examined} proofs examined, ${result.services.length} resolved, ` +
				`${result.written} written (apply=${result.applied}); ` +
				`organisations with service=${result.measurement.organisationsWithService}`,
		);
	} finally {
		await closePools();
	}
}
