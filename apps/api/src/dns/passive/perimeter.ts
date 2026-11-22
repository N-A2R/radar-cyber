/**
 * NA-only domain perimeter for the passive DNS sensor.
 *
 * A domain enters the perimeter only when its row is explicitly located in
 * Nouvelle-Aquitaine: the institutional reference corpus or an organisation
 * with an NA department. Nothing is guessed from a name, and no victim record
 * is ever used as an observation target.
 */
import { readFile } from "node:fs/promises";
import { query } from "../../db.js";
import { naDepartmentCode } from "../../geo/na-departments.js";
import { normalizeDomain } from "../historique.js";

export interface PassiveDomain {
  domain: string;
  source: "org-referentiel" | "institution-corpus";
  orgId: number | null;
}

interface OrgRow {
  id: number;
  dept: string | null;
  domain: string | null;
  website: string | null;
}

interface CorpusRow {
  departement?: unknown;
  url?: unknown;
}

const CORPUS_URL = new URL("../../../../../bench/corpus/institutions-complet.jsonl", import.meta.url);

/** Accepts both INSEE codes ('16', '016') and French department names. */
export function isNaDepartment(value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const raw = String(value).trim();
  const code = /^\d{3}$/.test(raw) ? raw.slice(1) : raw;
  return naDepartmentCode(code) !== null;
}

export function fromOrgRow(row: OrgRow): PassiveDomain | null {
  if (!isNaDepartment(row.dept)) return null;
  const domain = normalizeDomain(row.domain) ?? normalizeDomain(row.website);
  return domain ? { domain, source: "org-referentiel", orgId: row.id } : null;
}

export function fromCorpusRow(row: CorpusRow): PassiveDomain | null {
  if (!isNaDepartment(row.departement)) return null;
  const domain = normalizeDomain(typeof row.url === "string" ? row.url : null);
  return domain ? { domain, source: "institution-corpus", orgId: null } : null;
}

export async function loadCorpusDomains(): Promise<PassiveDomain[]> {
  const text = await readFile(CORPUS_URL, "utf8");
  const domains: PassiveDomain[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const entry = fromCorpusRow(JSON.parse(line) as CorpusRow);
    if (entry) domains.push(entry);
  }
  return domains;
}

async function loadOrgDomains(): Promise<PassiveDomain[]> {
  const result = await query<OrgRow>(
    `SELECT id, dept, domain, website FROM org
      WHERE dept IS NOT NULL AND (domain IS NOT NULL OR website IS NOT NULL)`,
  );
  return result.rows.flatMap((row) => {
    const entry = fromOrgRow(row);
    return entry ? [entry] : [];
  });
}

/** Sorted, unique perimeter. An org-backed entry wins over a corpus entry. */
export async function loadPassiveDomains(): Promise<PassiveDomain[]> {
  const [orgDomains, corpusDomains] = await Promise.all([loadOrgDomains(), loadCorpusDomains()]);
  const byDomain = new Map<string, PassiveDomain>();
  for (const entry of [...orgDomains, ...corpusDomains]) {
    const current = byDomain.get(entry.domain);
    if (!current || (current.orgId === null && entry.orgId !== null)) {
      byDomain.set(entry.domain, entry);
    }
  }
  return [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}
