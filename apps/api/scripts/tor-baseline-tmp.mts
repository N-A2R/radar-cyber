/**
 * Mesure TEMPORAIRE (avant modifications) du collecteur Tor.
 * Usage : RADAR_TOR_SOCKS=socks5h://127.0.0.1:9050 DATABASE_URL=... \
 *   node_modules/.bin/tsx scripts/tor-baseline-tmp.mts --limit 5 --concurrency 2
 */
import { writeFileSync } from "node:fs";
import { query } from "../src/db.js";
import { fetchResilient } from "../src/collectors/http.js";
import { detectItems } from "../src/collectors/generic.js";

type Row = { id: string; url: string; name: string };
type Mesure = {
  id: string;
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  bytes: number;
  cause: string;
  strategy: string | null;
  items: number | null;
  detail?: string;
};

const args = process.argv.slice(2);
function arg(name: string, fallback: number): number {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
}
const limit = arg("limit", 0);
const concurrency = Math.max(1, arg("concurrency", 3));
const timeoutMs = arg("timeout", 45000);
const out = (() => {
  const i = args.indexOf("--out");
  return i >= 0 ? args[i + 1] : null;
})();

function classifyError(err: unknown): string {
  const e = err as { name?: string; message?: string; permanent?: boolean } | null;
  const msg = `${e?.name ?? ""} ${e?.message ?? ""}`;
  if (e?.permanent || /403|blocked|bloqu/i.test(msg)) return "blocked";
  if (/délai dépassé|timeout|timed out|ETIMEDOUT/i.test(msg)) return "timeout";
  if (/SOCKS5|CONNECT|ECONNREFUSED|ECONNRESET|circuit|onion/i.test(msg)) return "circuit";
  return "circuit";
}

const BLOCK_RE = /just a moment|checking your browser|ddos|cloudflare|captcha|access denied|forbidden|attention required/i;

async function mesurer(row: Row): Promise<Mesure> {
  const t0 = Date.now();
  try {
    const res = await fetchResilient(row.url, { timeoutMs, maxAttempts: 1, source: row.id });
    const ms = Date.now() - t0;
    const text = res.text ?? "";
    let items: number | null = null;
    let strategy: string | null = null;
    if (res.status === 200) {
      try {
        const detected = detectItems(text, res.contentType ?? null);
        items = detected.items.length;
        strategy = detected.strategy;
      } catch {
        items = null;
      }
    }
    let cause = "ok";
    if (res.status === 403 || res.status === 401) cause = "blocked";
    else if (res.status === 429) cause = "blocked";
    else if (res.status !== 200) cause = "http_error";
    else if (text.length < 200 || BLOCK_RE.test(text.slice(0, 4000))) cause = "invalid_content";
    else if (items === 0) cause = "invalid_content";
    return {
      id: row.id,
      url: row.url,
      ok: cause === "ok",
      status: res.status,
      ms,
      bytes: Buffer.byteLength(text),
      cause,
      strategy,
      items,
    };
  } catch (err) {
    const ms = Date.now() - t0;
    return {
      id: row.id,
      url: row.url,
      ok: false,
      status: null,
      ms,
      bytes: 0,
      cause: classifyError(err),
      strategy: null,
      items: null,
      detail: String((err as Error)?.message ?? err).slice(0, 200),
    };
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

async function main() {
  const r = await query<Row>(
    "SELECT id, url, name FROM source WHERE url ILIKE '%onion%' ORDER BY id" + (limit > 0 ? ` LIMIT ${limit}` : ""),
  );
  const rows = r.rows;
  const results: Mesure[] = [];
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      const m = await mesurer(row);
      results.push(m);
      console.error(`${m.ok ? "OK " : "KO "} ${m.id.slice(0, 42).padEnd(42)} ${String(m.status).padStart(4)} ${String(m.ms).padStart(6)}ms ${m.cause} ${m.strategy ?? "-"} items=${m.items ?? "-"} ${m.detail ?? ""}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()));
  results.sort((a, b) => a.id.localeCompare(b.id));
  const ok = results.filter((m) => m.ok);
  const usable = results.filter((m) => m.status === 200 && (m.items ?? 0) > 0);
  const causes: Record<string, number> = {};
  for (const m of results) causes[m.cause] = (causes[m.cause] ?? 0) + 1;
  const summary = {
    at: new Date().toISOString(),
    total: results.length,
    http_200: results.filter((m) => m.status === 200).length,
    ok: ok.length,
    usable_content: usable.length,
    taux_succes: results.length ? +(ok.length / results.length * 100).toFixed(1) : 0,
    latence_ms: {
      median: median(results.map((m) => m.ms)),
      median_ok: median(ok.map((m) => m.ms)),
      p90: (() => { const s = results.map((m) => m.ms).sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] ?? 0; })(),
      max: Math.max(0, ...results.map((m) => m.ms)),
    },
    causes,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (out) writeFileSync(out, JSON.stringify(summary, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
