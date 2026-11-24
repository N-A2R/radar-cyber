/**
 * Proven attribution of a relevant CVE to a Nouvelle-Aquitaine organisation.
 *
 * An attribution is emitted only when the observed service carries a public
 * CPE with an explicit version, that product is named by the CVE relevance
 * rule, and the version lies inside an NVD affected-version range. No version
 * is ever guessed from a port, a banner or a CVSS score.
 */
import { normaliseToken } from "./index.js";
import { versionAffected, type CveExploitability } from "../exploitability/index.js";

/** A relevant CVE enriched with the public proof link from the PoC corpus. */
export interface TraceableCve extends CveExploitability {
	publicPocUrl?: string | null;
}

export interface ObservedServiceCpe {
	orgId: number;
	port: number;
	service: string;
	category: string;
	/** Exact CPE string stored in exposition_service.evidence.cpes. */
	cpe: string;
	/** Product and version parsed from that CPE, not inferred from the service. */
	product: string;
	version: string;
	source: string;
	sourceUrl: string;
	consultedAt: string;
}

export interface ProvenExposureCase {
	orgId: number;
	port: number;
	service: string;
	category: string;
	cveId: string;
	product: string;
	version: string;
	cpe: string;
	inKev: boolean;
	publicPocUrl: string | null;
	nvdUrl: string;
	source: string;
	sourceUrl: string;
	consultedAt: string;
}

export type RejectionReason =
	| "no_cpe_version"
	| "stale_observation"
	| "missing_source_url"
	| "no_relevant_cve"
	| "version_outside_range";

export const REJECTION_REASONS: readonly RejectionReason[] = [
	"no_cpe_version",
	"stale_observation",
	"missing_source_url",
	"no_relevant_cve",
	"version_outside_range",
];

export interface ProvenExposureTrace {
	cases: ProvenExposureCase[];
	rejected: Record<RejectionReason, number>;
}

/** Days during which a public observation is still considered citable. */
export const MAX_OBSERVATION_AGE_DAYS = 7;

/**
 * Trace cases from observations that already carry a parsed CPE product and
 * version. The caller must have parsed the CPE from public evidence; this
 * function never derives a product or a version from anything else.
 */
export function traceProvenExposures(
	observations: readonly ObservedServiceCpe[],
	cves: readonly TraceableCve[],
	options: { asOf: string; maxAgeDays?: number },
): ProvenExposureTrace {
	const maxAgeDays = options.maxAgeDays ?? MAX_OBSERVATION_AGE_DAYS;
	const asOf = Date.parse(options.asOf);
	if (!Number.isFinite(asOf)) throw new Error("invalid asOf timestamp");
	const byProduct = new Map<string, TraceableCve[]>();
	for (const cve of cves) {
		for (const name of cve.matches) {
			const key = normaliseToken(name);
			if (!key) continue;
			const list = byProduct.get(key) ?? [];
			list.push(cve);
			byProduct.set(key, list);
		}
	}

	const rejected = Object.fromEntries(
		REJECTION_REASONS.map((reason) => [reason, 0]),
	) as Record<RejectionReason, number>;
	const cases: ProvenExposureCase[] = [];
	const seen = new Set<string>();
	for (const observation of observations) {
		const product = normaliseToken(observation.product);
		const version = observation.version?.trim() ?? "";
		if (!version || !observation.cpe?.trim() || !product) {
			rejected.no_cpe_version += 1;
			continue;
		}
		const consulted = Date.parse(observation.consultedAt);
		const age = asOf - consulted;
		if (!Number.isFinite(age) || age > maxAgeDays * 86_400_000 || age < -86_400_000) {
			rejected.stale_observation += 1;
			continue;
		}
		if (!observation.sourceUrl?.trim()) {
			rejected.missing_source_url += 1;
			continue;
		}
		const candidates = byProduct.get(product) ?? [];
		if (candidates.length === 0) {
			rejected.no_relevant_cve += 1;
			continue;
		}
		const matched = candidates.filter((cve) =>
			versionAffected(version, cve.ranges, observation.product),
		);
		if (matched.length === 0) {
			rejected.version_outside_range += 1;
			continue;
		}
		for (const cve of matched) {
			const key = `${observation.orgId}|${observation.port}|${cve.id}|${observation.cpe}`;
			if (seen.has(key)) continue;
			seen.add(key);
			cases.push({
				orgId: observation.orgId,
				port: observation.port,
				service: observation.service,
				category: observation.category,
				cveId: cve.id,
				product: observation.product,
				version,
				cpe: observation.cpe,
				inKev: cve.inKev,
				publicPocUrl: cve.hasPoc ? cve.publicPocUrl ?? null : null,
				nvdUrl: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve.id)}`,
				source: observation.source,
				sourceUrl: observation.sourceUrl,
				consultedAt: observation.consultedAt,
			});
		}
	}
	cases.sort((a, b) =>
		a.cveId.localeCompare(b.cveId) || a.orgId - b.orgId || a.port - b.port || a.cpe.localeCompare(b.cpe),
	);
	return { cases, rejected };
}
