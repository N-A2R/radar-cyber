/**
 * Collects redacted metadata for public repositories and object-storage
 * buckets that expose Nouvelle-Aquitaine data.
 *
 *   pnpm collect:na-containers
 *   pnpm collect:na-containers --json=db/data/na-public-containers.json
 *
 * Free sources only: public GitHub search/tree metadata, data.gouv.fr dataset
 * metadata and the local event catalogue. File bodies are never downloaded;
 * a HEAD request only checks anonymous readability. The published corpus
 * contains identifiers and counters, never a person's name or contact detail.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
  countDataFiles,
  fingerprint,
  hasNaDataMetadata,
  naSignal,
  dataSignal,
  parseContainerUrl,
  type ContainerRef,
} from "../apps/api/src/public-containers/detect.js";
import {
  validateCorpus,
  type ContainerCorpus,
  type ContainerRecord,
} from "../apps/api/src/public-containers/corpus.js";

const argv = process.argv.slice(2);
const OUTPUT = argv.find((a) => a.startsWith("--json="))?.slice(7) ??
  "db/data/na-public-containers.json";
const MAX_CANDIDATES = 60;
const TIMEOUT_MS = 6_000;
const DEADLINE_MS = 42_000;
const START = Date.now();
const expired = () => Date.now() - START > DEADLINE_MS;
const TOKEN = process.env.GH_TOKEN ?? "";

const HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "radar-cyber-na-public-containers/1.0",
};
if (TOKEN) HEADERS.Authorization = `Bearer ${TOKEN}`;

const QUERIES = [
  "nouvelle-aquitaine in:name,description",
  "aquitaine in:name,description",
  "bordeaux data in:name,description",
  "poitiers data in:name,description",
  "limoges data in:name,description",
  "la rochelle data in:name,description",
  "pau data in:name,description",
  "charente data in:name,description",
  "gironde data in:name,description",
  "vienne data in:name,description",
  "pyrénées-atlantiques in:name,description",
  "niort data in:name,description",
  "angoulême data in:name,description",
  "dordogne données in:name,description",
];

type Repo = {
  full_name: string;
  name: string;
  description: string | null;
  topics?: string[];
  default_branch: string;
  fork: boolean;
  archived: boolean;
};

async function json<T>(url: string, headers = HEADERS): Promise<T | null> {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function headStatus(url: string): Promise<number> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(4_000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return output;
}

function metadataText(repo: Repo): string {
  return [repo.name, repo.description ?? "", ...(repo.topics ?? [])].join(" ");
}

function record(ref: ContainerRef, text: string, dataFiles: number, status: number, origin: string): ContainerRecord {
  return {
    id: fingerprint(`${ref.kind}:${ref.host}:${ref.ownerHash}:${ref.name}`),
    kind: ref.kind,
    host: ref.host,
    name: ref.name,
    ownerHash: ref.ownerHash,
    naSignal: naSignal(text).join(","),
    dataSignal: dataSignal(text).join(","),
    dataFiles,
    status,
    origin,
    checkedAt: new Date().toISOString(),
  };
}

async function githubRepos(): Promise<{ records: ContainerRecord[]; scanned: number }> {
  const pages = await mapLimit(QUERIES, 6, async (queryText) => {
    if (expired()) return [];
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(queryText)}&per_page=100`;
    const data = await json<{ items?: Repo[] }>(url);
    return data?.items ?? [];
  });
  const unique = new Map<string, Repo>();
  for (const repo of pages.flat()) {
    if (!repo.fork && !repo.archived && /^[A-Za-z0-9._-]{1,120}$/.test(repo.name)) {
      unique.set(repo.full_name, repo);
    }
  }
  const candidates = [...unique.values()]
    .filter((repo) => hasNaDataMetadata(metadataText(repo)))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .slice(0, MAX_CANDIDATES);

  const enriched = await mapLimit(candidates, 10, async (repo) => {
    if (expired()) return null;
    const url = `https://api.github.com/repos/${repo.full_name}/git/trees/` +
      `${encodeURIComponent(repo.default_branch)}?recursive=1`;
    const tree = await json<{ tree?: { path: string; type: string }[]; truncated?: boolean }>(url);
    if (!tree || tree.truncated || !tree.tree) return null;
    const paths = tree.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path);
    const dataFiles = countDataFiles(paths);
    if (dataFiles < 1) return null;
    const ref = parseContainerUrl(`https://github.com/${repo.full_name}`);
    return ref ? record(ref, metadataText(repo), dataFiles, 200, "github-search") : null;
  });
  return { records: enriched.filter((r): r is ContainerRecord => r !== null), scanned: unique.size };
}

/** Object-storage URLs cited by NA open-data metadata or by regional events. */
async function storageCandidates(): Promise<{ records: ContainerRecord[]; scanned: number }> {
  const datasets = await json<{ data?: { title: string; resources?: { title?: string; url?: string }[] }[] }>(
    "https://www.data.gouv.fr/api/1/datasets/?q=nouvelle-aquitaine&page_size=20",
    { "User-Agent": "radar-cyber-na-public-containers/1.0", signal: AbortSignal.timeout(5_000) },
  );
  const hints: { url: string; text: string; origin: string }[] = [];
  for (const dataset of datasets?.data ?? []) {
    for (const resource of dataset.resources ?? []) {
      if (resource.url) hints.push({ url: resource.url, text: `${dataset.title} ${resource.title ?? ""}`, origin: "data-gouv" });
    }
  }
  const events = await query<{ source_url: string; title: string }>(
    `SELECT source_url, title FROM event
     WHERE source_url ~* '(github|gitlab|bitbucket|amazonaws|storage.googleapis|blob.core.windows)'
     LIMIT 200`,
  );
  for (const event of events.rows) hints.push({ url: event.source_url, text: event.title, origin: "event-metadata" });

  const storage = hints.filter((hint) => /amazonaws|storage.googleapis|blob.core.windows/.test(hint.url));
  const records = await mapLimit(storage, 8, async (hint) => {
    if (!hasNaDataMetadata(hint.text)) return null;
    if (expired()) return null;
    const ref = parseContainerUrl(hint.url);
    if (!ref || ref.kind !== "bucket") return null;
    const status = await headStatus(hint.url);
    return record(ref, hint.text, 1, status, hint.origin);
  });
  return { records: records.filter((r): r is ContainerRecord => r !== null), scanned: hints.length };
}

try {
  const [repos, storage] = await Promise.all([githubRepos(), storageCandidates()]);
  const records = new Map<string, ContainerRecord>();
  for (const item of [...repos.records, ...storage.records]) records.set(item.id, item);
  const corpus: ContainerCorpus = {
    collectedAt: new Date().toISOString(),
    scope: "nouvelle-aquitaine",
    method: "GitHub public search and tree file names; anonymous HEAD only",
    candidatesScanned: repos.scanned + storage.scanned,
    records: [...records.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  const validated = validateCorpus(corpus);
  writeFileSync(OUTPUT, `${JSON.stringify(validated, null, 2)}\n`);
  const accessible = validated.records.filter((r) => r.status === 200 || r.status === 206);
  console.log(`Public NA containers collected: ${accessible.length} accessible ` +
    `(${repos.records.length} repositories, ${storage.records.length} storage candidates, ` +
    `scanned=${validated.candidatesScanned}) -> ${OUTPUT}`);
} finally {
  await closePools();
}
