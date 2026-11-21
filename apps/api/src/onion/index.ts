/**
 * Live/productive .onion site index for the Nouvelle-Aquitaine observatory.
 *
 * The index is rebuilt from versioned repository evidence only: the SQL source
 * catalog and the newest Tor probe snapshot in bench/results. No network call,
 * no paid service, no claim text and no victim data enter this module.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface OnionSource {
  id: string;
  name: string;
  url: string;
}

export interface OnionProbeRow {
  id: string;
  status: number | null;
  items: number;
}

export interface OnionProbeSnapshot {
  file: string;
  at: string;
  rows: OnionProbeRow[];
}

export interface OnionSite {
  host: string;
  sourceIds: string[];
  live: boolean;
  productive: boolean;
  items: number;
  httpStatus: number | null;
}

export interface OnionIndex {
  scope: "nouvelle-aquitaine";
  evidenceFile: string;
  evidenceAt: string;
  sourceCount: number;
  siteCount: number;
  liveSites: number;
  productiveSites: number;
  liveAndProductiveSites: number;
  sites: OnionSite[];
}

/** A site is the onion host; several catalog sources may point at one host. */
export function onionHost(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    return host.endsWith(".onion") ? host : null;
  } catch {
    return null;
  }
}

/** Reads the `(id, name, family, url, ...)` tuples of the catalog SQL files. */
export function parseOnionCatalog(sql: string): OnionSource[] {
  const sources: OnionSource[] = [];
  const seen = new Set<string>();
  const tuple = /\(\s*'(onion:[^']+)'\s*,\s*'([^']*)'[\s\S]{0,600}?'(https?:\/\/[^\s']+)'/g;
  for (const match of sql.matchAll(tuple)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    sources.push({ id, name: match[2], url: match[3] });
  }
  return sources;
}

/** The freshest snapshot wins; ties break on file name for reproducibility. */
export function pickLatestProbe(snapshots: OnionProbeSnapshot[]): OnionProbeSnapshot {
  if (snapshots.length === 0) throw new Error("no Tor probe evidence found");
  return [...snapshots].sort((a, b) =>
    b.at.localeCompare(a.at) || a.file.localeCompare(b.file),
  )[0];
}

/**
 * A site is live when at least one of its sources answered HTTP 200 through
 * Tor, and productive when at least one yielded an extractable item. Both are
 * required for the published figure. Only allowlisted fields leave this
 * function: probe snippets, claim titles and victim data are never copied.
 */
export function buildOnionIndex(sources: OnionSource[], probe: OnionProbeSnapshot): OnionIndex {
  const byId = new Map(probe.rows.map((row) => [row.id, row]));
  const grouped = new Map<string, OnionSite>();

  for (const source of sources) {
    const host = onionHost(source.url);
    if (!host) continue;
    let site = grouped.get(host);
    if (!site) {
      site = { host, sourceIds: [], live: false, productive: false, items: 0, httpStatus: null };
      grouped.set(host, site);
    }
    site.sourceIds.push(source.id);
    const row = byId.get(source.id);
    if (!row) continue;
    if (row.status === 200) site.live = true;
    if (row.items > 0) site.productive = true;
    site.items = Math.max(site.items, row.items);
    if (row.status !== null && (site.httpStatus === null || row.status > site.httpStatus)) {
      site.httpStatus = row.status;
    }
  }

  const sites = [...grouped.values()].sort((a, b) => a.host.localeCompare(b.host));
  return {
    scope: "nouvelle-aquitaine",
    evidenceFile: probe.file,
    evidenceAt: probe.at,
    sourceCount: sources.length,
    siteCount: sites.length,
    liveSites: sites.filter((site) => site.live).length,
    productiveSites: sites.filter((site) => site.productive).length,
    liveAndProductiveSites: sites.filter((site) => site.live && site.productive).length,
    sites,
  };
}

const CATALOG_FILES = [
  "db/sources-onion.sql",
  "db/sources-onion-cybercrime.sql",
  "db/sources-onion-ransomlook.sql",
];
const RESULTS_DIR = "bench/results";

/** Rebuilds the index from the catalog and newest committed Tor measurement. */
export function loadOnionIndex(): OnionIndex {
  const repo = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));
  const sources = CATALOG_FILES.flatMap((file) => parseOnionCatalog(readFileSync(repo(file), "utf8")));
  const dir = repo(RESULTS_DIR);
  const snapshots = readdirSync(dir)
    .filter((name) => /^tor-stability-.*\.json$/.test(name))
    .flatMap((name) => {
      try {
        const raw: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
        if (typeof raw !== "object" || raw === null) return [];
        const record = raw as { at?: unknown; results?: unknown };
        if (typeof record.at !== "string" || !Array.isArray(record.results)) return [];
        const rows: OnionProbeRow[] = record.results.flatMap((entry: unknown) => {
          if (typeof entry !== "object" || entry === null) return [];
          const row = entry as { id?: unknown; status?: unknown; items?: unknown };
          if (typeof row.id !== "string") return [];
          return [{
            id: row.id,
            status: typeof row.status === "number" ? row.status : null,
            items: typeof row.items === "number" ? row.items : 0,
          }];
        });
        return [{ file: `${RESULTS_DIR}/${name}`, at: record.at, rows }];
      } catch {
        return [];
      }
    });
  return buildOnionIndex(sources, pickLatestProbe(snapshots));
}
