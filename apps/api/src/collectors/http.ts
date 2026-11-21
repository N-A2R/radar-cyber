// Client HTTP résilient pour collecteurs (radar-cyber).
// `fetch` global pour le clearnet ; `socks-proxy-agent` pour les URL `.onion`,
// qui n'existent que derrière Tor.

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { SocksProxyAgent } from "socks-proxy-agent";
import { decodeBody } from "./parsers/decode.js";
import {
  noteTorFailure,
  resetTorBackoff,
  rotatedTorSocks,
  torBackoffRemainingMs,
} from "./tor/tor-circuit.js";

export class SourceBlockedError extends Error {
  permanent: boolean;
  constructor(message: string, permanent = false) {
    super(message);
    this.name = "SourceBlockedError";
    this.permanent = permanent;
  }
}

/** Proxy SOCKS de Tor, désactivé par défaut. `socks5h` résout côté Tor. */
function torSocks(): string | null {
  const raw = process.env.RADAR_TOR_SOCKS?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** Une URL `.onion` ne résout nulle part ailleurs que dans Tor. */
export function isOnionUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    return host.endsWith(".onion");
  } catch {
    return false;
  }
}

/**
 * Requête via le proxy SOCKS. Aucun repli clearnet : sans configuration, ou
 * si le proxy refuse, on lève une erreur explicite et immédiate.
 */
function fetchThroughSocks(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ status: number; buffer: Buffer; contentType: string | null }> {
  const socks = rotatedTorSocks(url) ?? torSocks();
  if (!socks) {
    throw new SourceBlockedError(
      `URL .onion sans RADAR_TOR_SOCKS — collecte Tor refusée (aucun repli clearnet) : ${url}`,
      true,
    );
  }
  const agent = new SocksProxyAgent(socks);
  const target = new URL(url);
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;

  const { promise, resolve, reject } = Promise.withResolvers<{
    status: number;
    buffer: Buffer;
    contentType: string | null;
  }>();

  const req = send(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers: { ...headers, host: target.host },
      agent,
      timeout: timeoutMs,
    },
    (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          buffer: Buffer.concat(chunks),
          contentType: (res.headers["content-type"] as string | undefined) ?? null,
        }),
      );
      res.on("error", reject);
    },
  );
  req.on("timeout", () => req.destroy(new Error(`délai dépassé (${timeoutMs} ms) via Tor`)));
  req.on("error", reject);
  req.end();

  return promise;
}

export interface Validators {
  etag?: string;
  lastModified?: string;
}

const validatorsStore = new Map<string, Validators>();

export function getValidators(url: string): Validators | undefined {
  return validatorsStore.get(url);
}

export function setValidators(url: string, v: Validators): void {
  const prev = validatorsStore.get(url) ?? {};
  validatorsStore.set(url, { ...prev, ...v });
}

export interface FetchResilientOpts {
  timeoutMs?: number;
  maxAttempts?: number;
  accept?: string;
  ifNoneMatch?: string;
  ifModifiedSince?: string;
  /** En-têtes supplémentaires (ex. `Auth-Key` des API abuse.ch). */
  headers?: Record<string, string>;
  /** Clé de l'état de backoff ; l'URL sert de clé quand la source n'est pas nommée. */
  source?: string;
}

export interface FetchResilientResult {
  status: number;
  text: string;
  notModified: boolean;
  buffer?: Buffer;
  contentType?: string | null;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Négocie explicitement les quatre formats lus par les collecteurs. */
export const COLLECTOR_ACCEPT = "application/ld+json, application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.5";

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(60000, parseInt(trimmed, 10) * 1000);
  }
  const ts = Date.parse(trimmed);
  if (!isNaN(ts)) {
    const delay = ts - Date.now();
    if (delay <= 0) return 0;
    return Math.min(60000, delay);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Backoff entre deux collectes d'une même source après une erreur transitoire.
 * Paliers explicites : 1 min, 5 min, 30 min, 2 h (plafond).
 */
export const SOURCE_BACKOFF_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000] as const;

/** Délai après `failures` échecs consécutifs ; 0 avant le premier échec. */
export function backoffDelayMs(failures: number): number {
  if (!Number.isFinite(failures) || failures < 1) return 0;
  const index = Math.min(Math.floor(failures), SOURCE_BACKOFF_DELAYS_MS.length) - 1;
  return SOURCE_BACKOFF_DELAYS_MS[index];
}

/** Refus immédiat d'une source encore en backoff. */
export class SourceBackoffError extends Error {
  readonly source: string;
  readonly retryAfterMs: number;

  constructor(source: string, retryAfterMs: number) {
    super(`source ${source} en backoff : nouvelle tentative dans ${Math.ceil(retryAfterMs / 1000)} s`);
    this.name = "SourceBackoffError";
    this.source = source;
    this.retryAfterMs = retryAfterMs;
  }
}

type BackoffState = { failures: number; retryAt: number };
const backoffBySource = new Map<string, BackoffState>();

/** Temps restant avant de retenter une source (0 si elle est disponible). */
export function sourceBackoffRemainingMs(source: string, now = Date.now()): number {
  const state = backoffBySource.get(source);
  return state ? Math.max(0, state.retryAt - now) : 0;
}

/** Enregistre un échec transitoire et renvoie le délai désormais appliqué. */
export function noteSourceFailure(source: string, now = Date.now()): number {
  const failures = (backoffBySource.get(source)?.failures ?? 0) + 1;
  const delay = backoffDelayMs(failures);
  backoffBySource.set(source, { failures, retryAt: now + delay });
  return delay;
}

/** Remet le compteur à zéro après un succès. */
export function resetSourceBackoff(source: string): void {
  backoffBySource.delete(source);
}

function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function isTransientError(err: unknown): boolean {
  if (err instanceof SourceBlockedError || err instanceof SourceBackoffError) return false;
  const e = err as { name?: string; message?: string } | null;
  return e?.name === "AbortError" || e?.name === "TimeoutError"
    || /timeout|timed out|etimedout|délai dépassé/i.test(e?.message ?? "");
}

/**
 * Point d'entrée public : le backoff par source encadre les tentatives
 * immédiates (Retry-After / jitter) de `fetchResilientOnce`.
 */
export async function fetchResilient(
  url: string,
  opts: FetchResilientOpts = {},
): Promise<FetchResilientResult> {
  const source = opts.source?.trim() || url;
  const remaining = Math.max(sourceBackoffRemainingMs(source), torBackoffRemainingMs(source));
  if (remaining > 0) throw new SourceBackoffError(source, remaining);
  try {
    const result = await fetchResilientOnce(url, opts);
    if (isOnionUrl(url)) {
      if (isTransientStatus(result.status)) noteTorFailure(source, `HTTP ${result.status}`);
      else resetTorBackoff(source);
    } else if (isTransientStatus(result.status)) noteSourceFailure(source);
    else resetSourceBackoff(source);
    return result;
  } catch (err) {
    if (isOnionUrl(url)) noteTorFailure(source, err);
    else if (isTransientError(err)) noteSourceFailure(source);
    throw err;
  }
}

/** Tentatives HTTP immédiates pour une source déjà autorisée. */
async function fetchResilientOnce(
  url: string,
  opts: FetchResilientOpts = {}
): Promise<FetchResilientResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const maxAttempts = opts.maxAttempts ?? 3;
  const accept = opts.accept ?? COLLECTOR_ACCEPT;
  const known = getValidators(url);
  const ifNoneMatch = opts.ifNoneMatch ?? known?.etag;
  const ifModifiedSince = opts.ifModifiedSince ?? known?.lastModified;

  // Une URL `.onion` ne passe pas par `fetch` : elle sort par Tor ou échoue.
  if (isOnionUrl(url)) {
    const headers: Record<string, string> = {
      ...(opts.headers ?? {}),
      "User-Agent": UA,
      Accept: accept,
    };
    // Un circuit Tor à froid met 40 s : le délai du clearnet condamnerait
    // toutes les sources .onion. On plancher à 45 s.
    const r = await fetchThroughSocks(url, headers, Math.max(timeoutMs, 45000));
    if (r.status === 403) {
      throw new SourceBlockedError(`Source blocked (403) via Tor pour ${url}`, true);
    }
    return {
      status: r.status,
      text: decodeBody(r.buffer, r.contentType).text,
      notModified: false,
      buffer: r.buffer,
      contentType: r.contentType,
    };
  }

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {
      ...(opts.headers ?? {}),
      'User-Agent': UA,
      Accept: accept,
    };
    if (ifNoneMatch) headers["If-None-Match"] = ifNoneMatch;
    if (ifModifiedSince) headers["If-Modified-Since"] = ifModifiedSince;

    try {
      const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
      clearTimeout(timer);

      const etag = res.headers.get("etag");
      const lm = res.headers.get("last-modified");
      if (etag || lm) {
        setValidators(url, { etag: etag ?? undefined, lastModified: lm ?? undefined });
      }

      if (res.status === 304) {
        return { status: 304, text: "", notModified: true, contentType: null };
      }

      if (res.status === 403) {
        throw new SourceBlockedError(`Source blocked (403) for ${url}`, true);
      }

      if (res.status === 429 || res.status === 503) {
        if (attempt >= maxAttempts) {
          const ab = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
          const buffer = Buffer.from(ab);
          const text = buffer.toString("utf8");
          return { status: res.status, text, notModified: false, buffer, contentType: res.headers.get("content-type") };
        }
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        let delay: number;
        if (retryAfter !== null) {
          delay = retryAfter;
        } else {
          const base = Math.min(60000, 1000 * Math.pow(2, attempt - 1));
          delay = Math.floor(base * (0.5 + Math.random() * 0.5));
        }
        delay = Math.min(60000, delay);
        await sleep(delay);
        continue;
      }

      const ab = await res.arrayBuffer();
      const buffer = Buffer.from(ab);
      const text = buffer.toString("utf8");
      return { status: res.status, text, notModified: false, buffer, contentType: res.headers.get("content-type") };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (err instanceof SourceBlockedError) throw err;
      if (attempt >= maxAttempts) break;
      const base = Math.min(60000, 1000 * Math.pow(2, attempt - 1));
      const delay = Math.floor(base * (0.5 + Math.random() * 0.5));
      await sleep(Math.min(60000, delay));
    }
  }

  if (lastError) throw lastError;
  throw new Error(`fetchResilient failed for ${url}`);
}

export class HostLimiter {
  private lastRun = new Map<string, number>();
  private queues = new Map<string, Promise<unknown>>();
  private intervalMs: number;

  constructor(intervalMs = 1000) {
    this.intervalMs = intervalMs;
  }

  async schedule<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(host) ?? Promise.resolve();
    const next = prev.then(async () => {
      const now = Date.now();
      const last = this.lastRun.get(host) ?? 0;
      const wait = Math.max(0, this.intervalMs - (now - last));
      if (wait > 0) await sleep(wait);
      this.lastRun.set(host, Date.now());
      return fn();
    });
    this.queues.set(host, next.catch(() => undefined));
    return next as Promise<T>;
  }
}
