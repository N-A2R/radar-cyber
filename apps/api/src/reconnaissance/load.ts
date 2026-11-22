/**
 * Read-only loader for the reconnaissance detector.
 *
 * It maps three existing observation stores onto the detector's identifier
 * and counter rows. No organization name, IP address, hostname or victim
 * data leaves this module: only department codes, identifiers and counts.
 *
 * Observed means observed: the DNS query keeps only domains that currently
 * resolve after a successful lookup. Rows still waiting for a first answer are
 * excluded here and cannot inflate the false-positive denominator.
 */
import { query } from "../db.js";
import { NA_DEPARTMENT_SQL_LABELS } from "../cveNa/index.js";
import type {
	DnsRow,
	ExposureRow,
	ReconInput,
	SubdomainRow,
} from "./detect.js";

const DEPARTMENTS = [...NA_DEPARTMENT_SQL_LABELS] as string[];

type ExposureDbRow = {
	orgId: number;
	dept: string | null;
	domain: string | null;
	website: string | null;
	hostnames: string[];
	fingerprintPorts: number;
	sharedIp: boolean;
};

type SubdomainDbRow = {
	orgId: number;
	dept: string | null;
	registeredDomain: string | null;
	observedDomain: string;
	subdomainCount: number;
	ambiguous: boolean;
};

type DnsDbRow = {
	orgId: number;
	dept: string | null;
	domain: string;
	active: boolean;
	lastSuccess: string | Date | null;
};

const EXPOSURE_SQL = `
  WITH shared_ip AS (
    SELECT ip, count(DISTINCT org_id)::int AS orgs
      FROM exposition_service
     GROUP BY ip
  )
  SELECT o.id::int AS "orgId", o.dept, o.domain, o.website,
         COALESCE(
           jsonb_agg(DISTINCT h.value) FILTER (WHERE h.value IS NOT NULL),
           '[]'::jsonb
         ) AS "hostnames",
         count(DISTINCT e.port)
           FILTER (WHERE e.technology IS NOT NULL AND e.technology <> '')::int
           AS "fingerprintPorts",
         COALESCE(bool_or(s.orgs > 1), false) AS "sharedIp"
    FROM exposition_service e
    JOIN org o ON o.id = e.org_id
    LEFT JOIN shared_ip s ON s.ip = e.ip
    LEFT JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(e.evidence -> 'hostnames') = 'array'
          THEN e.evidence -> 'hostnames'
        ELSE '[]'::jsonb
      END
    ) AS h(value) ON true
   WHERE o.dept = ANY($1::text[])
   GROUP BY o.id, o.dept, o.domain, o.website
`;

/**
 * Ambiguity is decided on distinct organizations, never on CT rows. A single
 * organization with forty subdomains is unambiguous; counting rows would call
 * every productive domain ambiguous and suppress the whole signal.
 */
const SUBDOMAIN_SQL = `
  WITH domain_orgs AS (
    SELECT lower(o2.domain) AS domaine, count(DISTINCT o2.id)::int AS orgs
      FROM ct_sous_domaine c
      JOIN org o2 ON lower(o2.domain) = lower(c.domaine)
     GROUP BY lower(o2.domain)
  )
  SELECT o.id::int AS "orgId", o.dept,
         o.domain AS "registeredDomain",
         c.domaine AS "observedDomain",
         count(DISTINCT c.sous_domaine)::int AS "subdomainCount",
         (d.orgs > 1) AS "ambiguous"
    FROM ct_sous_domaine c
    JOIN org o ON lower(o.domain) = lower(c.domaine)
    JOIN domain_orgs d ON d.domaine = lower(c.domaine)
   WHERE o.dept = ANY($1::text[])
   GROUP BY o.id, o.dept, o.domain, c.domaine, d.orgs
`;

const DNS_SQL = `
  SELECT o.id::int AS "orgId", o.dept, d.domain, d.active,
         d.last_success AS "lastSuccess"
    FROM dns_domaine d
    JOIN LATERAL unnest(d.org_ids) AS x(oid) ON true
    JOIN org o ON o.id = x.oid
   WHERE o.dept = ANY($1::text[])
     AND d.active
     AND d.last_success IS NOT NULL
`;

const BASELINE_SQL = `
  SELECT (SELECT count(*)::int FROM org) AS organizations,
         (SELECT count(*)::int FROM source) AS sources,
         (SELECT count(*)::int FROM event) AS events,
         (SELECT count(*)::int FROM exposition_service) AS exposures,
         (SELECT count(*)::int FROM ct_sous_domaine) AS subdomains,
         (SELECT count(*)::int FROM dns_domaine) AS "dnsDomains",
         (SELECT count(*)::int FROM dns_domaine
           WHERE active AND last_success IS NOT NULL) AS "dnsResolved"
`;

/** SQL actually executed; published with the measurement as reproducible proof. */
export const SQL = {
	exposures: EXPOSURE_SQL,
	subdomains: SUBDOMAIN_SQL,
	dns: DNS_SQL,
	baseline: BASELINE_SQL,
} as const;

export type ReconBaseline = {
	organizations: number;
	sources: number;
	events: number;
	exposures: number;
	subdomains: number;
	dnsDomains: number;
	dnsResolved: number;
	departments: readonly string[];
};

export type LoadedReconnaissance = {
	input: ReconInput;
	baseline: ReconBaseline;
};

export async function loadReconnaissanceInput(): Promise<LoadedReconnaissance> {
	const [exposures, subdomains, dns, baseline] = await Promise.all([
		query<ExposureDbRow>(EXPOSURE_SQL, [DEPARTMENTS]),
		query<SubdomainDbRow>(SUBDOMAIN_SQL, [DEPARTMENTS]),
		query<DnsDbRow>(DNS_SQL, [DEPARTMENTS]),
		query<ReconBaseline>(BASELINE_SQL),
	]);

	const exposureRows: ExposureRow[] = exposures.rows.map((row) => ({
		orgId: row.orgId,
		dept: row.dept,
		domain: row.domain,
		website: row.website,
		hostnames: Array.isArray(row.hostnames) ? row.hostnames : [],
		fingerprintPorts: row.fingerprintPorts,
		sharedIp: row.sharedIp,
	}));
	const subdomainRows: SubdomainRow[] = subdomains.rows.map((row) => ({
		orgId: row.orgId,
		dept: row.dept,
		registeredDomain: row.registeredDomain,
		observedDomain: row.observedDomain,
		subdomainCount: row.subdomainCount,
		ambiguous: row.ambiguous,
	}));
	const dnsRows: DnsRow[] = dns.rows.map((row) => ({
		orgId: row.orgId,
		dept: row.dept,
		domain: row.domain,
		active: row.active,
		lastSuccess:
			row.lastSuccess instanceof Date ? row.lastSuccess.toISOString() : row.lastSuccess,
	}));

	return {
		input: { exposures: exposureRows, subdomains: subdomainRows, dns: dnsRows },
		baseline: { ...(baseline.rows[0] as ReconBaseline), departments: DEPARTMENTS },
	};
}
