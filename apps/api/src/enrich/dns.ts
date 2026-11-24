import { assertPublicDomain, fetchBoundedJson } from "../security/network.js";
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
  Status?: number;
  Answer?: DohAnswer[];
}

/** Réponse DoH brute : le statut permet de distinguer NXDOMAIN (3) d'une panne. */
export interface DohQueryResult {
  status: number;
  answers: string[];
}

// Le cache est typé par l'appelant : la valeur stockée est inconnue jusqu'au cast.
const cache = new Map<string, { value: unknown; exp: number }>();

function cached<T>(key: string, fn: () => Promise<T>, ttlMs = 60_000): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.value as T);
  return fn().then((v) => { cache.set(key, { value: v, exp: Date.now() + ttlMs }); return v; });
}

/**
 * Interroge DoH et rend le statut DNS avec les réponses.
 *
 * `doh()` reste le raccourci historique (tableau vide sur panne) ; l'historique
 * DNS a besoin de distinguer « pas d'enregistrement » (NXDOMAIN, statut 3) de
 * « source en panne » pour ne pas fabriquer un faux changement.
 */
export async function dohQuery(name: string, type: string): Promise<DohQueryResult> {
  const j = await fetchBoundedJson<DohResponse>(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
    timeoutMs: TIMEOUT_MS,
    maxBytes: 64_000,
    headers: { Accept: "application/dns-json" },
  });
  const answers = (j.Answer ?? []).map((a) => a.data).filter((d): d is string => Boolean(d));
  return { status: j.Status ?? 0, answers };
}

export async function doh(name: string, type: string): Promise<string[]> {
  try {
    return (await dohQuery(name, type)).answers;
  } catch {
    return [];
  }
}

/**
 * Seules les réponses validées sont mises en cache. NXDOMAIN (statut 3) est
 * une réponse légitime : elle donne des listes vides ; une panne du résolveur
 * lève et n'est pas confondue avec une absence d'enregistrement.
 */
export async function resolveDomain(domain: string): Promise<DnsResolution> {
  const cible = assertPublicDomain(domain);
  return cached(`resolve:${cible}`, async () => {
    const [a, aaaa] = await Promise.all([dohQuery(cible, "A"), dohQuery(cible, "AAAA")]);
    return { a: a.answers, aaaa: aaaa.answers };
  });
}

export async function reverseIp(ip: string): Promise<string[]> {
  return cached(`ptr:${ip}`, async () => {
    // convert to in-addr.arpa
    let q = ip;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      q = ip.split(".").reverse().join(".") + ".in-addr.arpa";
    }
    return (await dohQuery(q, "PTR")).answers;
  });
}
