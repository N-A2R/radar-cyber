/**
 * Attaches leak claims to Nouvelle-Aquitaine organizations using domains only.
 *
 * A claim is a public fact about an organization (a third-party claim about a
 * breach). Its `domainHint` is the only victim-related field this module ever
 * reads: raw bodies, titles, e-mails and other victim data must stay in the
 * TLP:RED quarantine and are deliberately absent from the input types.
 *
 * Matching is intentionally strict: one registrable domain root, one NA
 * department. Ambiguous roots (shared by two NA organizations) are not
 * attached. Gray sources such as ransomwatch stay eligible; no paid source
 * and no network call are involved.
 */
import { DEPT_LABELS } from "../collectors/relevance.js";
import { domaineRacine } from "../match/domaine.js";

/** A leak claim reduced to the fields needed for a domain decision. */
export type LeakClaim = {
  id: string | number;
  source: string;
  domainHint: string | null;
  status?: string | null;
};

/** An organization as read from the referential (no personal data). */
export type DomainOrganization = {
  id: number;
  department: string | null;
  domain: string | null;
  website: string | null;
};

/** The public result of a domain attachment: identifiers only. */
export type DomainAttachment = {
  claimId: string;
  orgId: number;
  domain: string;
  source: string;
};

const NA_LABELS: ReadonlySet<string> = new Set(Object.values(DEPT_LABELS));

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Accepts both INSEE codes ("33") and department names ("Gironde"). */
export function isNaDepartment(department: string | null | undefined): boolean {
  if (!department) return false;
  const value = fold(department);
  const label = /^\d{2}$/.test(value) ? DEPT_LABELS[value] : value;
  return label !== undefined && NA_LABELS.has(label);
}

/** Registrable roots of an organization's verified domain and website. */
export function organizationRoots(org: DomainOrganization): string[] {
  const roots = new Set<string>();
  for (const value of [org.domain, org.website]) {
    const root = domaineRacine(value);
    if (root !== null) roots.add(root);
  }
  return [...roots];
}

/**
 * Attaches each claim to at most one NA organization, by exact domain root.
 * Duplicate claim ids and rejected claims are ignored; so are roots shared by
 * several NA organizations, which would be a guess rather than a match.
 */
export function attachLeaksByDomain(
  claims: readonly LeakClaim[],
  organizations: readonly DomainOrganization[],
): DomainAttachment[] {
  const owners = new Map<string, number>();
  for (const org of organizations) {
    if (!isNaDepartment(org.department)) continue;
    for (const root of organizationRoots(org)) {
      owners.set(root, owners.has(root) ? -1 : org.id);
    }
  }

  const attachments: DomainAttachment[] = [];
  const seen = new Set<string>();
  for (const claim of claims) {
    if (claim.status !== undefined && claim.status !== null && fold(claim.status) === "rejected") continue;
    const root = domaineRacine(claim.domainHint);
    if (root === null) continue;
    const orgId = owners.get(root);
    if (orgId === undefined || orgId === -1) continue;
    const claimId = String(claim.id);
    if (seen.has(claimId)) continue;
    seen.add(claimId);
    attachments.push({ claimId, orgId, domain: root, source: claim.source });
  }
  return attachments;
}

/** Number of distinct leaks attached to an NA organization by domain. */
export function countLeaksByDomain(
  claims: readonly LeakClaim[],
  organizations: readonly DomainOrganization[],
): number {
  return attachLeaksByDomain(claims, organizations).length;
}
