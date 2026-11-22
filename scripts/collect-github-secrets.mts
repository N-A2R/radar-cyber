/**
 * Collects redacted evidence of credential-shaped strings in public GitHub
 * repositories owned by organizations whose public profile locates them in
 * Nouvelle-Aquitaine.
 *
 *   pnpm collect:github-secrets
 *
 * Two passes are used: candidate config files of every public repository, then
 * GitHub code search for high-signal credential prefixes restricted to the
 * same organizations. File contents stay in memory. The artifact written to
 * db/data/ contains locations, repository identifiers, pinned commits, line
 * numbers, credential kinds and SHA-256 fingerprints — never a credential
 * value, file body, personal name or e-mail address.
 */
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { isNaLocation } from "../apps/api/src/github/na-location.js";
import { scanCode, type SecretFinding } from "../apps/api/src/github/secrets.js";
import {
  validateCorpus,
  type RedactedSecretRecord,
  type SecretCorpus,
} from "../apps/api/src/github/corpus.js";

const execFileAsync = promisify(execFile);
const OUTPUT = "db/data/github-na-secrets.json";
const QUERY_LOCATIONS = [
  "Bordeaux", "Nouvelle-Aquitaine", "Poitiers", "Limoges", "La Rochelle",
  "Pau", "Angoulême", "Niort", "Périgueux", "Mont-de-Marsan", "Agen", "Guéret",
  "Tulle", "Gironde", "Charente-Maritime",
] as const;
const SEARCH_PATTERNS = ["AKIA", "client_secret"] as const;
const MAX_ORGS = 30;
const ORG_QUERY_SIZE = 15;
const MAX_REPOS_PER_ORG = 2;
const MAX_FILES_PER_REPO = 6;
const BLOB_BATCH = 25;
const CONCURRENCY = 16;

type GitHubUser = { login: string; type?: string; location?: string | null };
type GitHubRepo = {
  full_name: string;
  default_branch: string;
  sha: string | null;
  fork?: boolean;
  archived?: boolean;
};
type TreeEntry = { path: string; sha: string; type: string; size?: number };
type BlobText = { text?: string | null };
type SearchedFile = { org: string; location: string; repo: string; path: string };

async function ghApi<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const args = ["api", "-X", "GET", path];
  for (const [key, value] of Object.entries(params)) args.push("-f", `${key}=${value}`);
  const { stdout } = await execFileAsync("gh", args, {
    maxBuffer: 48 * 1024 * 1024,
    timeout: 15_000,
  });
  return JSON.parse(stdout) as T;
}

async function ghGraphql<T>(query: string): Promise<T> {
  const { stdout } = await execFileAsync("gh", ["api", "graphql", "-f", `query=${query}`], {
    maxBuffer: 96 * 1024 * 1024,
    timeout: 20_000,
  });
  return JSON.parse(stdout) as T;
}

async function resolveCommitSha(fullName: string, defaultBranch: string): Promise<string | null> {
  try {
    const info = await ghApi<GitHubRepo>(`repos/${fullName}`);
    if (info.sha && /^[0-9a-f]{40}$/.test(info.sha)) return info.sha;
    const branch = defaultBranch || info.default_branch;
    const ref = await ghApi<{ object?: { sha?: string } }>(
      `repos/${fullName}/git/ref/heads/${branch}`,
    );
    const sha = ref.object?.sha;
    return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await work(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push([...items.slice(index, index + size)]);
  return result;
}

function isCandidateFile(entry: TreeEntry): boolean {
  if (entry.type !== "blob") return false;
  if (!entry.size || entry.size > 120_000) return false;
  const path = entry.path.toLowerCase();
  if (/(?:^|\/)(?:node_modules|vendor|dist|build|\.git|fixtures|__tests__)(?:\/|$)/.test(path)) return false;
  if (/[.]min[.]|\.lock$|package-lock|yarn\.lock|pnpm-lock/.test(path)) return false;
  if (/(?:^|\/)(?:test|tests|spec|specs)(?:\/|$)/.test(path)) return false;
  const name = path.split("/").pop() ?? "";
  if (/^\.env(?:\.|$)/.test(name)) return true;
  if (/(^|[-_.])(?:env|config|configuration|settings|secret|secrets|credential|credentials|token|auth)([-_.]|$)/.test(name)) return true;
  return /\.(?:ya?ml|toml|properties|ini|tf|pem|key|json|js|jsx|ts|tsx|py|rb|php|go|java|cs|sh|conf|cfg|xml|md)$/.test(name);
}

async function findNaOrganizations(): Promise<{ login: string; location: string }[]> {
  const batches = await mapLimit(QUERY_LOCATIONS, 6, async (location) => {
    try {
      const found = await ghApi<{ items?: GitHubUser[] }>("search/users", {
        q: `location:"${location}" type:org`,
        per_page: "30",
      });
      return (found.items ?? [])
        .filter((user) => user.type === "Organization")
        .map((user) => user.login);
    } catch {
      return [];
    }
  });

  // The search response omits profile locations: confirm them on the profiles
  // of the candidates before attributing any repository to the region.
  const logins = [...new Set(batches.flat())].slice(0, MAX_ORGS * 2);
  const profiles = await mapLimit(logins, CONCURRENCY, async (login) => {
    try {
      const profile = await ghApi<GitHubUser>(`users/${login}`);
      return profile.location && isNaLocation(profile.location)
        ? { login, location: profile.location }
        : null;
    } catch {
      return null;
    }
  });

  const byLogin = new Map<string, { login: string; location: string }>();
  for (const org of profiles) {
    if (org && !byLogin.has(org.login)) byLogin.set(org.login, org);
  }
  return [...byLogin.values()].slice(0, MAX_ORGS);
}

type RepoTarget = { org: string; location: string; repo: GitHubRepo };

async function findRepos(orgs: { login: string; location: string }[]): Promise<RepoTarget[]> {
  const batches = await mapLimit(orgs, CONCURRENCY, async (org) => {
    try {
      const repos = await ghApi<GitHubRepo[]>(`orgs/${org.login}/repos`, {
        type: "public",
        per_page: "30",
        sort: "updated",
      });
      const selected = repos
        .filter((repo) => !repo.fork && !repo.archived && repo.default_branch)
        .slice(0, MAX_REPOS_PER_ORG);
      const resolved = await mapLimit(selected, CONCURRENCY, async (repo) => {
        const sha = await resolveCommitSha(repo.full_name, repo.default_branch);
        return sha ? { org: org.login, location: org.location, repo: { ...repo, sha } } : null;
      });
      return resolved.filter((target): target is RepoTarget => target !== null);
    } catch {
      return [];
    }
  });
  return batches.flat();
}

type FileTarget = RepoTarget & { path: string; blobSha: string };

async function findFiles(targets: RepoTarget[]): Promise<FileTarget[]> {
  const batches = await mapLimit(targets, CONCURRENCY, async (target) => {
    try {
      const tree = await ghApi<{ tree?: TreeEntry[] }>(
        `repos/${target.repo.full_name}/git/trees/${encodeURIComponent(target.repo.default_branch)}`,
        { recursive: "1" },
      );
      return (tree.tree ?? [])
        .filter(isCandidateFile)
        .slice(0, MAX_FILES_PER_REPO)
        .map((entry) => ({ ...target, path: entry.path, blobSha: entry.sha }));
    } catch {
      return [];
    }
  });
  return batches.flat();
}

async function findSearchedFiles(orgs: { login: string; location: string }[]): Promise<SearchedFile[]> {
  const byLogin = new Map(orgs.map((org) => [org.login, org]));
  const queries = SEARCH_PATTERNS.flatMap((pattern) =>
    chunks(orgs, ORG_QUERY_SIZE).map((chunk) => ({
      pattern,
      q: `${pattern} ${chunk.map((org) => `org:${org.login}`).join(" ")}`,
    })),
  );
  const batches = await mapLimit(queries, 4, async ({ q }) => {
    try {
      const found = await ghApi<{
        items?: { repository: { full_name: string }; path: string }[];
      }>("search/code", { q, per_page: "10" });
      return found.items ?? [];
    } catch {
      return [];
    }
  });

  const files = new Map<string, SearchedFile>();
  for (const item of batches.flat()) {
    const owner = item.repository.full_name.split("/")[0] ?? "";
    const org = byLogin.get(owner);
    if (!org) continue;
    const key = `${item.repository.full_name}:${item.path}`;
    if (!files.has(key)) files.set(key, { org: org.login, location: org.location, repo: item.repository.full_name, path: item.path });
  }
  return [...files.values()];
}

function toRecord(
  finding: SecretFinding,
  target: { org: string; location: string; repo: string; commit: string; path: string },
): RedactedSecretRecord {
  return {
    org: target.org,
    location: target.location,
    repository: target.repo,
    commit: target.commit,
    path: target.path,
    line: finding.line,
    kind: finding.kind,
    fingerprint: finding.fingerprint,
  };
}

type ScanState = {
  seen: Map<string, RedactedSecretRecord>;
  commitByRepo: Map<string, string>;
  records: RedactedSecretRecord[];
  filesScanned: number;
};

function addFindings(findings: readonly SecretFinding[], target: {
  org: string;
  location: string;
  repo: string;
  commit: string;
  path: string;
}, state: ScanState): void {
  for (const finding of findings) {
    const key = `${target.org}:${finding.fingerprint}`;
    if (state.seen.has(key)) continue;
    const record = toRecord(finding, target);
    state.seen.set(key, record);
    state.records.push(record);
  }
}

async function scanBatch(
  files: readonly FileTarget[],
  state: ScanState,
): Promise<number> {
  const fields = files.map((file, index) => {
    const [owner, name] = file.repo.full_name.split("/");
    return `b${index}: repository(owner: "${owner}", name: "${name}") { object(expression: "${file.blobSha}") { ... on Blob { text } } }`;
  });
  const response = await ghGraphql<{ data?: Record<string, { object?: BlobText | null }> }>(
    `query { ${fields.join(" ")} }`,
  );

  let scanned = 0;
  for (const [index, file] of files.entries()) {
    const text = response.data?.[`b${index}`]?.object?.text;
    if (!text || text.length > 500_000 || text.includes("\u0000")) continue;
    scanned += 1;
    addFindings(scanCode(text), file, state);
  }
  return scanned;
}

async function scanSearchedFile(file: SearchedFile, state: ScanState): Promise<number> {
  try {
    const response = await ghApi<{ content?: string }>(`repos/${file.repo}/contents/${file.path}`);
    if (!response.content) return 0;
    const text = Buffer.from(response.content.replace(/\s/g, ""), "base64").toString("utf8");
    if (text.includes("\u0000") || text.length > 500_000) return 0;
    const findings = scanCode(text);
    if (findings.length === 0) return 1;

    let commit = state.commitByRepo.get(file.repo);
    if (!commit) {
      commit = await resolveCommitSha(file.repo, "");
      if (commit) state.commitByRepo.set(file.repo, commit);
    }
    if (!commit) return 0;
    addFindings(findings, { ...file, commit }, state);
    return 1;
  } catch {
    return 0;
  }
}

async function collect(): Promise<{
  records: RedactedSecretRecord[];
  filesScanned: number;
  orgs: { login: string; location: string }[];
  repositories: number;
}> {
  const state: ScanState = { seen: new Map(), commitByRepo: new Map(), records: [], filesScanned: 0 };
  const orgs = await findNaOrganizations();
  const targets = await findRepos(orgs);
  const files = await findFiles(targets);

  const groups = chunks(files, BLOB_BATCH);
  const scannedGroups = await mapLimit(groups, 4, (group) => scanBatch(group, state));
  state.filesScanned = scannedGroups.reduce((sum, n) => sum + n, 0);

  const searched = await findSearchedFiles(orgs);
  const scannedSearched = await mapLimit(searched, CONCURRENCY, (file) => scanSearchedFile(file, state));
  state.filesScanned += scannedSearched.reduce((sum, n) => sum + n, 0);

  const reposFromSearch = new Set(searched.map((file) => file.repo));
  return {
    records: state.records,
    filesScanned: state.filesScanned,
    orgs,
    repositories: new Set([...targets.map((target) => target.repo.full_name), ...reposFromSearch]).size,
  };
}

const { records, filesScanned, orgs, repositories } = await collect();

const corpus: SecretCorpus = {
  collectedAt: new Date().toISOString(),
  scope: "nouvelle-aquitaine",
  origin: "public-github",
  queryLocations: QUERY_LOCATIONS,
  organizations: orgs.map((org) => org.login),
  repositories,
  filesScanned,
  records,
};
validateCorpus(corpus);

// The artifact must never contain source text: fail closed if a key slips in.
const serialized = `${JSON.stringify(corpus, null, 2)}\n`;
if (/"(?:value|content|body|raw|snippet|secret_value|token_value)"/.test(serialized)) {
  throw new Error("refusing to write a corpus containing raw values");
}
writeFileSync(OUTPUT, serialized);

console.log(
  `Collected redacted GitHub secret evidence: ${records.length} findings, ` +
    `${filesScanned} files, ${repositories} repos, ${orgs.length} NA orgs -> ${OUTPUT}`,
);
