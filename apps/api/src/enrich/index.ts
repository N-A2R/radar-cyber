import { enrichDomain, type WhoisResult } from "./whois.js";
import { resolveDomain, reverseIp, type DnsResolution } from "./dns.js";
import { certificatesFor, type CertInfo } from "./certs.js";

/** Réponse VirusTotal (seulement si `VT_API_KEY` est défini). */
export interface ReputationResult {
  malicious?: number;
  suspicious?: number;
  harmless?: number;
  undetected?: number;
  raw?: unknown;
}

export interface EnrichmentResult {
  domain?: WhoisResult;
  dns?: DnsResolution;
  certs?: CertInfo[];
  reverse?: string[];
  reputation?: ReputationResult;
  errors: string[];
}

function safe<T>(p: Promise<T>, label: string, errors: string[]): Promise<T | null> {
  return p.catch((e: unknown) => {
    errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  });
}

export async function enrichIndicator(indicator: { type: string; value: string }): Promise<EnrichmentResult> {
  const errors: string[] = [];
  const result: EnrichmentResult = { errors };
  const type = (indicator.type || "").toLowerCase();
  const value = indicator.value;
  if (type === "domain" || type === "url") {
    const domain = type === "url" ? new URL(value).hostname : value;
    const [whois, dns, certs] = await Promise.all([
      safe(enrichDomain(domain), "whois", errors),
      safe(resolveDomain(domain), "dns", errors),
      safe(certificatesFor(domain), "certs", errors),
    ]);
    if (whois) result.domain = whois;
    if (dns) result.dns = dns;
    if (certs) result.certs = certs;
  } else if (type === "ip") {
    const [ptr] = await Promise.all([safe(reverseIp(value), "reverse", errors)]);
    if (ptr) result.reverse = ptr;
    // réputation : VirusTotal si clé présente
    if (process.env.VT_API_KEY) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`https://www.virustotal.com/api/v3/ip_addresses/${value}`, { headers: { "x-apikey": process.env.VT_API_KEY! }, signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) result.reputation = (await res.json()) as ReputationResult;
        else errors.push(`vt: HTTP ${res.status}`);
      } catch (e: unknown) { errors.push(`vt: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }
  // cve : déjà traité par nvd/kev — rien
  return result;
}
