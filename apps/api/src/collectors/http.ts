// Client HTTP résilient pour collecteurs (radar-cyber).
// Global fetch uniquement — aucune dépendance.

export class SourceBlockedError extends Error {
  permanent: boolean;
  constructor(message: string, permanent = false) {
    super(message);
    this.name = "SourceBlockedError";
    this.permanent = permanent;
  }
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
}

export interface FetchResilientResult {
  status: number;
  text: string;
  notModified: boolean;
}

const UA = "RadarCyberNA/0.2 (+https://github.com/j0ltdevv/radar-cyber)";

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
export async function fetchResilient(
  url: string,
  opts: FetchResilientOpts = {}
): Promise<FetchResilientResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const maxAttempts = opts.maxAttempts ?? 3;
  const accept = opts.accept ?? "*/*";

  const known = getValidators(url);
  const ifNoneMatch = opts.ifNoneMatch ?? known?.etag;
  const ifModifiedSince = opts.ifModifiedSince ?? known?.lastModified;

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
        return { status: 304, text: "", notModified: true };
      }

      if (res.status === 403) {
        throw new SourceBlockedError(`Source blocked (403) for ${url}`, true);
      }

      if (res.status === 429 || res.status === 503) {
        if (attempt >= maxAttempts) {
          const text = await res.text().catch(() => "");
          return { status: res.status, text, notModified: false };
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

      const text = await res.text();
      return { status: res.status, text, notModified: false };
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
