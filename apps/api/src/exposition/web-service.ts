/**
 * Exposed web services backed by an HTTP-verified organisation domain.
 *
 * An HTTP 200 answer on the organisation's own registered domain is a direct
 * observation of a public web service. This module turns the proof already
 * stored in `org_enrichissement` into rows of the shared `exposition_service`
 * inventory, with a distinct source name so Shodan InternetDB measurements
 * remain identifiable. Only technical metadata is kept: no title, no name and
 * no victim-related field is copied into the evidence.
 */
import { ingestQuery, query } from "../db.js";
import { normalizeDomainValue } from "../match/domaine.js";
import {
	NOUVELLE_AQUITAINE_DEPARTMENTS,
	isNouvelleAquitaineDepartment,
} from "../regionalLanguages/index.js";

export const WEB_SERVICE_SOURCE = "http-200";
export const MINIMUM_CONFIDENCE = 0.8;

export type VerifiedWebsiteRow = {
	orgId: number;
	dept: string | null;
	domain: string | null;
	source: string;
	confidence: number;
	proof: Record<string, unknown> | null;
};

export type WebService = {
	orgId: number;
	ip: string;
	port: 80 | 443;
	category: "web";
	service: "http" | "https";
	technology: "http-server";
	version: null;
	source: string;
	sourceUrl: string;
	consultedAt: Date;
	evidence: {
		domain: string;
		url: string;
		status: number;
		provider: string;
	};
};

function statusOf(proof: Record<string, unknown>): number | null {
	const raw = proof.statut ?? proof.status;
	const value = typeof raw === "string" ? Number(raw) : raw;
	return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** Keeps only origin and path: a proof URL must not carry tracking parameters. */
function citableUrl(value: unknown, domain: string): string | null {
	if (typeof value !== "string" || !value) return null;
	try {
		const url = new URL(value);
		if (normalizeDomainValue(url.hostname) !== domain) return null;
		const scheme = url.protocol === "http:" ? "http" : "https";
		const path = url.pathname && url.pathname !== "/" ? url.pathname.replace(/\/$/, "") : "";
		return `${scheme}://${domain}${path}`;
	} catch {
		return null;
	}
}

/** Only a routable IPv4 address is accepted; loopback and private ranges are not observations. */
export function isPublicIpv4(value: string): boolean {
	const parts = value.split(".").map(Number);
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
	if ([0, 10, 127].includes(parts[0]!) || parts[0]! >= 224) return false;
	if (parts[0] === 169 && parts[1] === 254) return false;
	if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) return false;
	if (parts[0] === 192 && parts[1] === 168) return false;
	return true;
}

/**
 * Converts one HTTP-verified provenance row into one web service candidate.
 * `null` means the row is not a usable observation; never guess a domain or a
 * status. The IP is supplied by the collector after a real DNS resolution.
 */
export function webServiceFromVerifiedWebsite(
	row: VerifiedWebsiteRow,
	ip: string,
	consultedAt: Date,
	source: string = WEB_SERVICE_SOURCE,
): WebService | null {
	if (!isNouvelleAquitaineDepartment(row.dept)) return null;
	const domain = normalizeDomainValue(row.domain);
	if (!domain || !row.source.trim() || !(row.confidence >= MINIMUM_CONFIDENCE)) return null;
	const proof = row.proof;
	if (!proof || statusOf(proof) !== 200) return null;
	const url = citableUrl(proof.urlFinale, domain);
	if (!url || !isPublicIpv4(ip)) return null;
	const service = url.startsWith("https://") ? "https" : "http";
	return {
		orgId: row.orgId,
		ip,
		port: service === "https" ? 443 : 80,
		category: "web",
		service,
		technology: "http-server",
		version: null,
		source,
		sourceUrl: url,
		consultedAt,
		evidence: { domain, url, status: 200, provider: row.source },
	};
}

/** One row per organisation, domain, IP and port; repeated runs are harmless. */
export async function enregistrerServicesWeb(services: readonly WebService[]): Promise<number> {
	let written = 0;
	for (const service of services) {
		await ingestQuery(
			`INSERT INTO exposition_service
			 (org_id, ip, port, category, service, technology, version, source, source_url, consulted_at, evidence)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
			 ON CONFLICT (org_id, ip, port, source) DO UPDATE SET
			   category = EXCLUDED.category, service = EXCLUDED.service,
			   technology = EXCLUDED.technology, version = EXCLUDED.version,
			   source_url = EXCLUDED.source_url, consulted_at = EXCLUDED.consulted_at,
			   evidence = EXCLUDED.evidence`,
			[
				service.orgId, service.ip, service.port, service.category, service.service,
				service.technology, service.version, service.source, service.sourceUrl,
				service.consultedAt, JSON.stringify(service.evidence),
			],
		);
		written += 1;
	}
	return written;
}

export type ExpositionMeasurement = {
	scope: "nouvelle-aquitaine";
	organisationsWithService: number;
	organisationsInScope: number;
	services: number;
	bySource: Record<string, number>;
	measuredAt: string;
};
export async function measureExposition(): Promise<ExpositionMeasurement> {
	const departments = Object.keys(NOUVELLE_AQUITAINE_DEPARTMENTS);
	const result = await query<{
		organisations: string;
		organisations_with_service: string;
		services: string;
		by_source: Record<string, string> | null;
	}>(
		`WITH observed AS (
		   SELECT e.org_id, e.source
		   FROM exposition_service e
		   JOIN org o ON o.id = e.org_id
		   WHERE o.dept = ANY($1::text[])
		 ), per_source AS (
		   SELECT source, count(*)::text AS total FROM observed GROUP BY source
		 )
		 SELECT
		   (SELECT count(*)::text FROM org WHERE dept = ANY($1::text[])) AS organisations,
		   (SELECT count(DISTINCT org_id)::text FROM observed) AS organisations_with_service,
		   (SELECT count(*)::text FROM observed) AS services,
		   (SELECT COALESCE(jsonb_object_agg(source, total), '{}'::jsonb) FROM per_source)
		     AS by_source`,
		[departments],
	);
	const row = result.rows[0]!;
	const bySource: Record<string, number> = {};
	for (const [source, total] of Object.entries(row.by_source ?? {})) bySource[source] = Number(total);
	return {
		scope: "nouvelle-aquitaine",
		organisationsWithService: Number(row.organisations_with_service),
		organisationsInScope: Number(row.organisations),
		services: Number(row.services),
		bySource,
		measuredAt: new Date().toISOString(),
	};
}
