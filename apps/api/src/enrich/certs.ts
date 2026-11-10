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

export async function certificatesFor(domain: string): Promise<CertInfo[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, { signal: ctrl.signal });
    if (!res.ok) return [];
    const j: unknown = await res.json();
    if (!Array.isArray(j)) return [];
    return j.slice(0, 50).map((raw) => {
      const c = raw as CrtShEntry;
      return {
        name: c.name_value ?? c.common_name ?? "",
        issuer: c.issuer_name ?? "",
        notBefore: c.not_before ?? "",
        notAfter: c.not_after ?? "",
      };
    });
  } finally { clearTimeout(t); }
}
