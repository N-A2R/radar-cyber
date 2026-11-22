/**
 * Free, bounded network probe for the region-wide security-debt index.
 *
 * Targets come from public Nouvelle-Aquitaine corpora already versioned in
 * the repository. Only DNS TXT (DoH) and TLS handshakes are used: no paid
 * service, no authentication, no victim or personal data.
 *
 * Usage:
 *   tsx scripts/collect-security-signals.mts --per-sector 30 --budget-ms 45000
 *
 * Each run stays below 60 seconds; the deadline is enforced in-process.
 */
import { readFileSync, writeFileSync } from "node:fs";
import tls from "node:tls";
import {
  classifyDmarc,
  classifySpf,
  classifyTls,
  SECTORS,
  type SignalObservation,
} from "../apps/api/src/security/sectorIndex.js";

type CertificateWithBits = { valid_to?: string; bits?: number; asn1Curve?: string; isoCurve?: string };
type DohAnswer = { Answer?: { data?: string }[] };

type Target = {
  domain: string;
  sector: Sector;
  department: string | null;
};

function option(name: string, fallback: string): string {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readJsonl(path: string): Record<string, unknown>[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function domainOf(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/** Produce labelled public targets from the sector-specific source corpora. */
export function buildTargets(corpusDir = "bench/corpus"): Target[] {
  const byDomain = new Map<string, Target>();
  const add = (raw: string | undefined | null, sector: Sector, department: string | null): void => {
    const domain = domainOf(raw);
    if (!domain || !domain.includes(".") || byDomain.has(domain)) return;
    byDomain.set(domain, { domain, sector, department });
  };

  const health = readJsonl(`${corpusDir}/sante-enseignement.jsonl`);
  for (const row of health) {
    const type = text(row.type);
    if (["ehpad", "ch", "chu", "clinique"].includes(type)) {
      add(text(row.url), "sante", text(row["département"]) || null);
    } else if (["collège", "lycée", "école", "université", "iut"].includes(type)) {
      add(text(row.url), "enseignement", text(row["département"]) || null);
    }
  }

  const schools = readJsonl(`${corpusDir}/institutions-complet.jsonl`);
  for (const row of schools) {
    const type = text(row.type);
    const sector: Sector = ["collège", "lycée", "école", "université", "iut"].includes(type)
      ? "enseignement" : "public";
    add(text(row.url), sector, text(row.departement) || null);
  }

  const institutions = readJsonl(`${corpusDir}/institutions.jsonl`);
  for (const row of institutions) {
    const type = text(row.type);
    add(text(row.url), type === "universite" ? "enseignement" : "public", null);
  }

  const farms = readJsonl(`${corpusDir}/sources-agriculture.jsonl`);
  for (const row of farms) {
    add(text(row.url_site) || text(row.url_actualites), "agroalimentaire", null);
  }

  const active = readJsonl(`${corpusDir}/sources-na-1000.jsonl`);
  for (const row of active) {
    const family = text(row.famille);
    const sector: Sector = family === "institutionnel" ? "public" : "services";
    add(text(row.url), sector, text(row.departement) || null);
  }

  return [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}

/** Round-robin across sectors so a budget cut does not empty a whole sector. */
export function capPerSector(targets: readonly Target[], perSector: number): Target[] {
  const kept: Target[] = [];
  for (const sector of SECTORS) {
    const own = targets.filter((target) => target.sector === sector).slice(0, perSector);
    kept.push(...own);
  }
  return kept;
}

async function txtRecords(name: string, timeoutMs: number): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`;
    const response = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = await response.json() as DohAnswer; // DNS JSON API: stable Answer[].data shape
    return (payload.Answer ?? [])
      .map((answer) => (answer.data ?? "").replace(/^"|"$/g, ""))
      .filter((value) => value.length > 0);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function tlsStatus(host: string, timeoutMs: number): Promise<SignalObservation["tls"]> {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port: 443,
      servername: host,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });
    let done = false;
    const finish = (status: SignalObservation["tls"]): void => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(status);
    };
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      const peer: CertificateWithBits = cert; // Node exposes `bits` at runtime on some versions
      const protocol = socket.getProtocol();
      finish(classifyTls({
        authorized: socket.authorized,
        validTo: peer.valid_to ? new Date(peer.valid_to) : null,
        keyBits: typeof peer.bits === "number" ? peer.bits : null,
        curve: peer.asn1Curve ?? peer.isoCurve ?? null,
        protocol,
      }));
    });
    socket.once("timeout", () => finish("unreachable"));
    socket.once("error", () => finish("unreachable"));
  });
}

async function probe(target: Target, timeoutMs: number): Promise<SignalObservation> {
  const [domainTxt, dmarcTxt, tlsResult] = await Promise.all([
    txtRecords(target.domain, timeoutMs),
    txtRecords(`_dmarc.${target.domain}`, timeoutMs),
    tlsStatus(target.domain, timeoutMs),
  ]);
  return {
    domain: target.domain,
    sector: target.sector,
    department: target.department,
    tls: tlsResult,
    spf: classifySpf(domainTxt),
    dmarc: classifyDmarc(dmarcTxt),
    observedAt: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const perSector = Number(option("per-sector", "30"));
  const budgetMs = Number(option("budget-ms", "45000"));
  const concurrency = Number(option("concurrency", "24"));
  const timeoutMs = Number(option("timeout-ms", "2500"));
  const output = option("output", "bench/corpus/security-observations-na.jsonl");

  const queue = capPerSector(buildTargets(), perSector);
  const deadline = Date.now() + budgetMs;
  const observations: SignalObservation[] = [];

  async function worker(): Promise<void> {
    while (queue.length > 0 && Date.now() < deadline) {
      const target = queue.shift();
      if (target) observations.push(await probe(target, timeoutMs));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const body = observations.map((item) => JSON.stringify(item)).join("\n");
  writeFileSync(output, body.length > 0 ? `${body}\n` : "");

  const bySector = new Map<Sector, number>();
  for (const item of observations) bySector.set(item.sector, (bySector.get(item.sector) ?? 0) + 1);
  console.log(`Probed ${observations.length} public NA domains (${Math.round((Date.now() - (deadline - budgetMs)) / 1000)} s)`);
  for (const sector of SECTORS) console.log(`  ${sector.padEnd(16)} ${bySector.get(sector) ?? 0}`);
  console.log(`Written to ${output}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
