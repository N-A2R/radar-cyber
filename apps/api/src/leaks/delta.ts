/**
 * Difference between two published sets of NA leak attachments.
 *
 * Only identifiers already present in a published measurement are compared:
 * claim id, organization id, domain root and source. No quarantine payload is
 * read, and no victim data can appear in the result.
 */
import type { DomainAttachment } from "./by-domain.js";

export type LeakDelta = {
  added: DomainAttachment[];
  removed: DomainAttachment[];
};

/** Identity of a counted attachment in a published measurement. */
function key(attachment: DomainAttachment): string {
  return `${attachment.claimId}|${attachment.orgId}|${attachment.domain}|${attachment.source}`;
}

/**
 * Reports attachments that appeared or disappeared between two measurements.
 * Ordering is deterministic so the result can be published as evidence.
 */
export function diffLeakAttachments(
  previous: readonly DomainAttachment[],
  current: readonly DomainAttachment[],
): LeakDelta {
  const before = new Map(previous.map((a) => [key(a), a]));
  const after = new Map(current.map((a) => [key(a), a]));
  const sorted = (map: Map<string, DomainAttachment>, other: Map<string, DomainAttachment>) =>
    [...map]
      .filter(([id]) => !other.has(id))
      .map(([, attachment]) => attachment)
      .sort((a, b) => key(a).localeCompare(key(b)));
  return { added: sorted(after, before), removed: sorted(before, after) };
}
