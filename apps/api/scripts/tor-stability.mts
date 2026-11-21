/**
 * Mesure reproductible de la stabilité du collecteur Tor (radar-cyber).
 *
 * Pour chaque source `.onion` déclarée : un fetch réel via le chemin de
 * production (`fetchResilient`), la latence, le code HTTP, la cause d'échec
 * et la stratégie de détection du parseur. Aucune écriture en base.
 *
 * Usage :
 *   RADAR_TOR_SOCKS=socks5h://127.0.0.1:9050 \
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *   apps/api/node_modules/.bin/tsx apps/api/scripts/tor-stability.mts \
 *     --phase before --out bench/results/tor-stability-before.json \
 *     --concurrency 8 --timeout 45000
 */
import { writeFileSync } from "node:fs";
import { query } from "../src/db.js";
import { fetchResilient } from "../src/collectors/http.js";
import { decodeBody } from "../src/collectors/parsers/decode.js";
import { detectItems } from "../src/collectors/generic.js";

type Phase = "before" | "after" | string;

interface SourceRow {
  id: string;
  url: string;
  name: string;
  enabled: boolean;
}

export type TorCause =
  | "ok"
  | "circuit"
  | "timeout"
  | "blocked"
  | "invalid_content"
  | "http_error";

export interface TorMeasure {
  id: string;
  url: string;
  name: string;
  enabled: boolean;
  ok: boolean;
  status: number | null;
  ms: number;
  bytes: number;
  charset: string | null;
  cause: TorCause;
  strategy: string | null;
  items: number;
  detail: string | null;
  extrait: string | null;
  sous_cause: string | null;
}

const BLOCK_RE =
  /just a moment|checking your browser|ddos protection|cloudflare|captcha|access denied|forbidden|attention required|enable javascript/i;

function arg(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] ?? fallback : fallback;
}

function classifyError(err: unknown): { cause: TorCause; detail: string } {
  const e = err as { name?: string; message?: string; permanent?: boolean } | null;
  const msg = `${e?.name ?? ""} ${e?.message ?? ""}`;
  const detail = msg.slice(0, 240);
  if (/timeout|timed out|etimedout|délai dépassé/i.test(msg)) return { cause: "timeout", detail };
  if (/blocked|403|bloqu/i.test(msg) || e?.permanent) return { cause: "blocked", detail };
  if (/socks|connect|econnrefused|econnreset|circuit|onion|host unreachable|network/i.test(msg))
    return { cause: "circuit", detail };
  return { cause: "circuit", detail };
}

async function measure(row: SourceRow, timeoutMs: number): Promise<TorMeasure> {
  const t0 = Date.now();
  try {
    // maxAttempts: 1 — on mesure une source, pas la stratégie de retry.
    const res = await fetchResilient(row.url, { timeoutMs, maxAttempts: 1, source: row.id });
    const ms = Date.now() - t0;
    const buffer = res.buffer ?? Buffer.from(res.text ?? "", "utf8");
    const decoded = decodeBody(buffer, res.contentType ?? null);
    const text = decoded.text;
    const extrait = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
    const sous_cause = decoded.uncertain ? "encodage-incertain"
      : text.trim().length < 120 ? "corps-court"
      : /<script\b/i.test(text) && !/<p\b|<article\b|<li\b/i.test(text) ? "coquille-js" : null;
    let strategy: string | null = null;
    let items = 0;
    if (res.status === 200) {
      try {
        const detected = detectItems(text, res.contentType ?? null);
        strategy = detected.strategy;
        items = detected.items.length;
      } catch {
        strategy = "parse-error";
      }
    }
    let cause: TorCause = "ok";
    if (res.status === 401 || res.status === 403 || res.status === 429) cause = "blocked";
    else if (res.status !== 200) cause = "http_error";
    else if (BLOCK_RE.test(text.slice(0, 4000))) cause = "blocked";
    else if (text.trim().length < 120) cause = "invalid_content";
    else if (items === 0) cause = "invalid_content";
    return {
      id: row.id,
      url: row.url,
      name: row.name,
      enabled: row.enabled,
      ok: cause === "ok",
      status: res.status,
      ms,
      bytes: buffer.length,
      charset: decoded.charset,
      cause,
      strategy,
      items,
      detail: res.status !== 200 ? `HTTP ${res.status}` : null,
      extrait: cause === "invalid_content" ? extrait : null,
      sous_cause: cause === "invalid_content" ? sous_cause : null,
    };
  } catch (err) {
    const ms = Date.now() - t0;
    const { cause, detail } = classifyError(err);
    return {
      id: row.id,
      url: row.url,
      name: row.name,
      enabled: row.enabled,
      ok: false,
      status: null,
      ms,
      bytes: 0,
      charset: null,
      cause,
      strategy: null,
      items: 0,
      detail,
      extrait: null,
      sous_cause: null,
    };
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
}

async function main(): Promise<void> {
  const phase: Phase = arg("phase", "before");
  const limit = Number(arg("limit", "0"));
  const concurrency = Math.max(1, Number(arg("concurrency", "6")));
  const timeoutMs = Number(arg("timeout", "45000"));
  const out = arg("out", `bench/results/tor-stability-${phase}.json`);

  const { rows } = await query<SourceRow>(
    "SELECT id, url, name, enabled FROM source WHERE url ILIKE '%onion%' ORDER BY id" +
      (limit > 0 ? ` LIMIT ${limit}` : ""),
  );
  const results: TorMeasure[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < rows.length) {
      const row = rows[next++];
      const m = await measure(row!, timeoutMs);
      results.push(m);
      console.error(
        `${m.ok ? "OK " : "KO "} ${m.id.slice(0, 40).padEnd(40)} ${String(m.status).padStart(4)} ` +
          `${String(m.ms).padStart(6)}ms ${m.cause.padEnd(15)} ${(m.strategy ?? "-").padEnd(18)} items=${m.items} ${m.detail ?? ""}`,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()));

  const byId = new Map(results.map((r) => [r.id, r]));
  const causes: Record<string, number> = {};
  for (const r of results) causes[r.cause] = (causes[r.cause] ?? 0) + 1;
  const ok = results.filter((r) => r.ok);
  const times = results.map((r) => r.ms);
  const summary = {
    phase,
    at: new Date().toISOString(),
    method:
      "Un fetch réel par source .onion via fetchResilient (chemin de production), " +
      "maxAttempts=1, decodeBody + detectItems. Aucune écriture en base.",
    total: results.length,
    enabled: results.filter((r) => r.enabled).length,
    ok: ok.length,
    taux_succes: results.length ? +((ok.length / results.length) * 100).toFixed(1) : 0,
    latence_ms: {
      median: median(times),
      median_ok: median(ok.map((r) => r.ms)),
      p90: percentile(times, 0.9),
      max: Math.max(0, ...times),
    },
    causes,
    strategies: results.reduce<Record<string, number>>((acc, r) => {
      const k = r.strategy ?? "none";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    par_source: Object.fromEntries([...byId].map(([id, r]) => [id, r])),
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
  console.error(`\nÉcrit : ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
