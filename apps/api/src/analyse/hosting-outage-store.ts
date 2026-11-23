/**
 * Read-only inputs for the Nouvelle-Aquitaine hosting-outage simulation.
 *
 * Sources: the frozen institutional corpus (identifiers and URLs only), the
 * passive DNS observations already stored in the database, and the regional
 * department filter. Organization names, event contents and victim data are
 * never selected.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { query } from "../db.js";
import { normalizeDomain } from "../dns/historique.js";
import {
	DEFAULT_OUTAGE_SIZE,
	simulateHostingOutage,
	type HostingObservation,
	type HostingOutageSimulation,
} from "./hosting-outage.js";

export const NA_DEPARTMENTS: readonly string[] = [
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
];

const CORPUS_PATH = fileURLToPath(
	new URL("../../../../bench/corpus/institutions-complet.jsonl", import.meta.url),
);

export const SQL = {
	observations: `SELECT domain, record_type AS "recordType", value
	                 FROM dns_passive_resolution
	                WHERE record_type IN ('NS', 'MX')
	                ORDER BY domain, record_type, value`,
	organizations: `SELECT entity_code AS "entityCode", id
	                  FROM org
	                 WHERE entity_code = ANY($1::text[])
	                   AND dept = ANY($2::text[])`,
	baseline: `SELECT (SELECT count(*) FROM org)::text AS organizations,
	                  (SELECT count(*) FROM source)::text AS sources,
	                  (SELECT count(*) FROM event)::text AS events`,
} as const;

interface CorpusRow {
	id?: unknown;
	url?: unknown;
	url_preuve?: unknown;
}

interface DnsRow {
	domain: string;
	recordType: "NS" | "MX";
	value: string;
}

export interface HostingOutageMeasurement extends HostingOutageSimulation {
	baseline: { organizations: number; sources: number; events: number };
	corpus: { institutions: number; domains: number; organizationsWithDomain: number };
	measuredAt: string;
}

/** Read only the identifier and the public URL of each corpus institution. */
function readCorpus(): Array<{ code: string; domain: string }> {
	const entries: Array<{ code: string; domain: string }> = [];
	for (const line of readFileSync(CORPUS_PATH, "utf8").split("\n")) {
		if (!line.trim()) continue;
		const row = JSON.parse(line) as CorpusRow;
		if (typeof row.id !== "string") continue;
		const code = row.id.replace(/^na-[a-z]+-/, "");
		if (code === row.id) continue;
		const domain = normalizeDomain(
			typeof row.url === "string" ? row.url : typeof row.url_preuve === "string" ? row.url_preuve : null,
		);
		if (domain) entries.push({ code, domain });
	}
	return entries;
}

/** Build the observations from real passive DNS records and opaque organization ids. */
export async function measureHostingOutage(
	outageSize = DEFAULT_OUTAGE_SIZE,
): Promise<HostingOutageMeasurement> {
	const corpusRows = readCorpus();
	const codes = [...new Set(corpusRows.map((row) => row.code))].sort();
	const [dns, organizations, totals] = await Promise.all([
		query<DnsRow>(SQL.observations),
		query<{ entityCode: string; id: number }>(SQL.organizations, [codes, [...NA_DEPARTMENTS]]),
		query<{ organizations: string; sources: string; events: string }>(SQL.baseline),
	]);

	const orgByCode = new Map(organizations.rows.map((row) => [row.entityCode, row.id]));
	const orgIdsByDomain = new Map<string, Set<number>>();
	for (const row of corpusRows) {
		const id = orgByCode.get(row.code);
		if (id === undefined) continue;
		let ids = orgIdsByDomain.get(row.domain);
		if (!ids) {
			ids = new Set<number>();
			orgIdsByDomain.set(row.domain, ids);
		}
		ids.add(id);
	}

	const records = new Map<string, { ns: Set<string>; mx: Set<string> }>();
	for (const row of dns.rows) {
		let entry = records.get(row.domain);
		if (!entry) {
			entry = { ns: new Set(), mx: new Set() };
			records.set(row.domain, entry);
		}
		const host = row.value.trim().toLowerCase().replace(/\.$/, "");
		if (!host) continue;
		(row.recordType === "NS" ? entry.ns : entry.mx).add(host);
	}

	const observations: HostingObservation[] = [...records.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([domain, entry]) => ({
			domain,
			organizationIds: [...(orgIdsByDomain.get(domain) ?? [])].sort((a, b) => a - b),
			nameServers: [...entry.ns].sort(),
			mailExchangers: [...entry.mx].sort(),
		}));

	const simulation = simulateHostingOutage(observations, outageSize);
	const baseline = totals.rows[0] ?? { organizations: "0", sources: "0", events: "0" };
	return {
		...simulation,
		baseline: {
			organizations: Number(baseline.organizations),
			sources: Number(baseline.sources),
			events: Number(baseline.events),
		},
		corpus: {
			institutions: corpusRows.length,
			domains: new Set(corpusRows.map((row) => row.domain)).size,
			organizationsWithDomain: new Set(
				corpusRows.filter((row) => orgByCode.has(row.code)).map((row) => row.code),
			).size,
		},
		measuredAt: new Date().toISOString(),
	};
}
