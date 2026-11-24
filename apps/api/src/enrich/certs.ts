import { assertPublicDomain, fetchBoundedJson } from "../security/network.js";
// Certificats via crt.sh. HTTP 200 + JSON array.

const TIMEOUT_MS = 8000;

export interface CertInfo {
  name: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
}
interface CrtShEntry {
  name_value?: string;
  common_name?: string;
  issuer_name?: string;
  not_before?: string;
  not_after?: string;
}

/** `timeoutMs` : crt.sh dépasse souvent 8 s (28 s observés) — la découverte d'actifs allonge. */
export async function certificatesFor(domain: string, timeoutMs = TIMEOUT_MS): Promise<CertInfo[]> {
  const cible = assertPublicDomain(domain);
  const j = await fetchBoundedJson<unknown>(`https://crt.sh/?q=${encodeURIComponent(cible)}&output=json`, {
    timeoutMs,
    maxBytes: 512_000,
  });
  if (!Array.isArray(j)) throw new Error("crt.sh : réponse JSON inattendue");
  return j.slice(0, 50).map((raw): CertInfo => {
    const c = (raw && typeof raw === "object" ? raw : {}) as CrtShEntry;
    return {
      name: c.name_value ?? c.common_name ?? "",
      issuer: c.issuer_name ?? "",
      notBefore: c.not_before ?? "",
      notAfter: c.not_after ?? "",
    };
  });
}
