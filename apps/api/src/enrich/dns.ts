// DNS over HTTPS (Cloudflare) : A/AAAA et reverse PTR. Cache mémoire court.

const TIMEOUT_MS = 5000;

export interface DnsResolution {
  a: string[];
  aaaa: string[];
}

interface DohAnswer {
  data?: string;
}

interface DohResponse {
  Answer?: DohAnswer[];
}

// Le cache est typé par l'appelant : la valeur stockée est inconnue jusqu'au cast.
const cache = new Map<string, { value: unknown; exp: number }>();

function cached<T>(key: string, fn: () => Promise<T>, ttlMs = 60_000): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.value as T);
  return fn().then((v) => { cache.set(key, { value: v, exp: Date.now() + ttlMs }); return v; });
}

export async function doh(name: string, type: string): Promise<string[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { Accept: "application/dns-json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const j = (await res.json()) as DohResponse;
    return (j.Answer ?? []).map((a) => a.data).filter((d): d is string => Boolean(d));
  } finally { clearTimeout(t); }
}

export async function resolveDomain(domain: string): Promise<DnsResolution> {
  return cached(`resolve:${domain}`, async () => ({
    a: await doh(domain, "A"),
    aaaa: await doh(domain, "AAAA"),
  }));
}

export async function reverseIp(ip: string): Promise<string[]> {
  return cached(`ptr:${ip}`, async () => {
    // convert to in-addr.arpa
    let q = ip;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      q = ip.split(".").reverse().join(".") + ".in-addr.arpa";
    }
    return doh(q, "PTR");
  });
}
