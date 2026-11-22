/**
 * Pure detection rules for public repositories and object-storage buckets
 * exposing Nouvelle-Aquitaine data.
 *
 * Only public metadata is inspected: repository name, description, topics,
 * tree file names and HTTP status codes. No file body, no victim name, no
 * e-mail address and no phone number ever enters this module.
 */
import { createHash } from "node:crypto";

export const NA_DEPARTMENTS = [
  "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

/** Explicit geography: the region, its departments and their prefectures. */
const NA_TERMS = [
  "nouvelle aquitaine", "aquitaine", "charente", "charente maritime", "correze",
  "creuse", "dordogne", "gironde", "landes", "lot et garonne",
  "pyrenees atlantiques", "deux sevres", "vienne", "haute vienne",
  "bordeaux", "poitiers", "limoges", "la rochelle", "angouleme", "perigueux",
  "gueret", "tulle", "niort", "agen", "pau", "bayonne", "biarritz",
] as const;

/** The container advertises data, not merely a place or a technology. */
const DATA_TERMS = [
  "data", "dataset", "donnees", "open data", "opendata", "csv", "tsv", "json",
  "geojson", "carto", "cartographie", "geographie", "osm", "openstreetmap",
  "statistique", "statistiques", "gis", "wfs", "wms", "gtfs", "siren", "sirene",
  "rna", "insee", "observatoire", "inventaire", "dataviz", "visualisation",
  "base de donnees", "bd", "repertoire",
] as const;

export type ContainerKind = "repository" | "gist" | "bucket";

export type ContainerRef = {
  kind: ContainerKind;
  host: string;
  name: string;
  ownerHash: string;
};

export type UrlHostAllowlist = readonly string[];

export const ALLOWED_HOSTS: UrlHostAllowlist = [
  "github.com", "gist.github.com", "gitlab.com", "bitbucket.org",
  "s3.amazonaws.com", "storage.googleapis.com", "blob.core.windows.net",
];

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function isNaDepartment(code: string | null | undefined): boolean {
  return !!code && (NA_DEPARTMENTS as readonly string[]).includes(code);
}

/** Returns the explicit Nouvelle-Aquitaine terms found in public metadata. */
export function naSignal(text: string): string[] {
  const value = normalize(text);
  const words = ` ${value} `;
  return NA_TERMS.filter((term) => words.includes(` ${term} `));
}

/** Returns the explicit data terms found in public metadata. */
export function dataSignal(text: string): string[] {
  const value = normalize(text);
  const words = ` ${value} `;
  return DATA_TERMS.filter((term) => words.includes(` ${term} `));
}

export function hasNaDataMetadata(text: string): boolean {
  return naSignal(text).length > 0 && dataSignal(text).length > 0;
}

const DATA_FILE = /\.(csv|tsv|json|jsonl|ndjson|geojson|gpkg|parquet|xlsx|xls|shp|kml|gpx|sqlite|dbf|rds|zip)$/i;
const NON_DATA_FILE = /^(package|package-lock|tsconfig|composer|manifest|\.eslintrc)\.json$/i;

function isDataFile(path: string): boolean {
  const file = path.split("/").at(-1) ?? "";
  return DATA_FILE.test(file) && !NON_DATA_FILE.test(file);
}

/** A tree containing at least one data file is evidence of data content. */
export function hasDataFile(paths: readonly string[]): boolean {
  return paths.some(isDataFile);
}

export function countDataFiles(paths: readonly string[]): number {
  return paths.filter(isDataFile).length;
}

/** Anonymous HTTP reads only: a public container answers 200 or 206. */
export function isPublicReadable(status: number): boolean {
  return status === 200 || status === 206;
}

function ownerHash(owner: string): string {
  return fingerprint(`owner:${normalize(owner)}`);
}

function hostnameOf(rawUrl: string): { host: string; path: string } | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.includes(host) || /\.s3\.(?:[a-z0-9-]+\.)?amazonaws\.com$/.test(host) ||
    host.endsWith(".storage.googleapis.com") || /^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(host)
    ? { host, path: url.pathname.replace(/\/+$/, "") }
    : null;
}

/**
 * Recognises the public code and object-storage shapes used by the collection.
 * The owner account is hashed; only the repository or bucket name is kept.
 */
export function parseContainerUrl(rawUrl: string): ContainerRef | null {
  const parsed = hostnameOf(rawUrl);
  if (!parsed) return null;
  const { host, path } = parsed;
  const segments = path.split("/").filter(Boolean);
  if (host === "gist.github.com") {
    const [owner, id] = segments;
    return owner && id ? { kind: "gist", host, name: id, ownerHash: ownerHash(owner) } : null;
  }
  if (host === "github.com" || host === "gitlab.com" || host === "bitbucket.org") {
    const [owner, name] = segments;
    if (!owner || !name || !/^[A-Za-z0-9._-]+$/.test(name)) return null;
    return { kind: "repository", host, name, ownerHash: ownerHash(owner) };
  }
  if (host.endsWith(".blob.core.windows.net")) {
    const [name] = segments;
    return name ? { kind: "bucket", host, name, ownerHash: ownerHash(host) } : null;
  }
  const s3 = /^([a-z0-9][a-z0-9.-]{1,60})\.s3\.(?:[a-z0-9-]+\.)?amazonaws\.com$/.exec(host);
  if (s3?.[1]) return { kind: "bucket", host: "s3.amazonaws.com", name: s3[1], ownerHash: ownerHash(host) };
  if (host.endsWith(".storage.googleapis.com")) {
    const name = host.slice(0, -".storage.googleapis.com".length);
    return name ? { kind: "bucket", host: "storage.googleapis.com", name, ownerHash: ownerHash(host) } : null;
  }
  if (host === "s3.amazonaws.com" || host === "storage.googleapis.com") {
    const [name] = segments;
    return name && /^[a-z0-9][a-z0-9.-]{1,60}$/.test(name)
      ? { kind: "bucket", host, name, ownerHash: ownerHash(host) }
      : null;
  }
  return null;
}
