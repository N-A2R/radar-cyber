/**
 * Deterministic SIREN verification and homonymy audit.
 *
 * Pure module: no network, no database, no writes. Callers supply the rows and
 * the independent corroboration they trust; this module only applies the rules
 * and reports which SIRENs can be called verified.
 *
 * A SIREN is verified when:
 *   1. it has exactly nine digits and passes the INSEE Luhn check;
 *   2. its identity group (normalized name + city + department) is not disputed
 *      by another SIREN, OR the exact SIREN is corroborated by an independent
 *      register snapshot / traceable register proof.
 *
 * Unresolved homonyms are never resolved by picking a winner: the engine stays
 * abstinent and the SIREN is reported as ambiguous.
 */
import { normalize } from "../match/core.js";

export type SirenVerdict = "verified" | "ambiguous" | "invalid";

export interface SirenCandidate {
  id: number;
  siren: string;
  /** The exact SIREN and identity appear in an independent register snapshot. */
  registerMatch: boolean;
  /** A traceable register proof is attached to this organization. */
  proofMatch: boolean;
}

export interface HomonymGroup {
  identity: string;
  members: readonly SirenCandidate[];
}

export interface AuditCounts {
  totalWithSiren: number;
  invalid: number;
  ambiguous: number;
}

/** Nine digits and the INSEE Luhn checksum (even positions, 1-based, doubled). */
export function isValidSiren(siren: string | null | undefined): boolean {
  if (!siren || !/^\d{9}$/.test(siren)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = Number(siren[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Stable identity key: accents, case and punctuation are ignored. */
export function identityKey(
  name: string,
  city: string | null | undefined,
  dept: string | null | undefined,
): string {
  return `${normalize(name)}|${normalize(city ?? "")}|${normalize(dept ?? "")}`;
}

/** Parenthetical trade names are not part of the legal name. */
export function legalName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "");
}

/** Raw organization fields needed to place a SIREN in an identity group. */
export interface SirenIdentityRow {
  id: number;
  siren: string;
  name: string;
  city: string | null | undefined;
  dept: string | null | undefined;
}

/** Organizations sharing a normalized name, city and department. */
export interface IdentityGroup {
  identity: string;
  members: Array<{ id: number; siren: string }>;
}

/**
 * Group raw rows with the same normalization the verdict rules use.
 * Keeping this in one place prevents SQL collation or punctuation differences
 * from hiding a homonymy dispute.
 */
export function groupByIdentity(rows: readonly SirenIdentityRow[]): IdentityGroup[] {
  const groups = new Map<string, IdentityGroup>();
  for (const row of rows) {
    const identity = identityKey(legalName(row.name), row.city, row.dept);
    let group = groups.get(identity);
    if (!group) {
      group = { identity, members: [] };
      groups.set(identity, group);
    }
    group.members.push({ id: row.id, siren: row.siren });
  }
  return [...groups.values()];
}

/**
 * Verdict for every member of one identity group.
 *
 * A group with a single distinct SIREN needs no corroboration: there is no
 * homonymy dispute to resolve. A disputed group requires an independent proof
 * for the member's exact SIREN; otherwise the member stays ambiguous.
 */
export function auditHomonymGroup(group: HomonymGroup): Map<number, SirenVerdict> {
  const distinctSirens = new Set(group.members.map((m) => m.siren));
  const verdicts = new Map<number, SirenVerdict>();
  for (const member of group.members) {
    if (!isValidSiren(member.siren)) {
      verdicts.set(member.id, "invalid");
    } else if (distinctSirens.size === 1) {
      verdicts.set(member.id, "verified");
    } else {
      verdicts.set(
        member.id,
        member.registerMatch || member.proofMatch ? "verified" : "ambiguous",
      );
    }
  }
  return verdicts;
}

/** Share of SIREN-bearing organizations left verified after the audit. */
export function verifiedRate(counts: AuditCounts): number {
  if (counts.totalWithSiren <= 0) return 0;
  const verified = counts.totalWithSiren - counts.invalid - counts.ambiguous;
  return Math.max(0, verified) / counts.totalWithSiren;
}

/** Percentage with two decimals, for reports and console output. */
export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}
