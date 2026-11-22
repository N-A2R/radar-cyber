/**
 * Pure rules for the technical-source catalogue and NA claim attachments.
 *
 * These schemas are shared by the integration script, the measurement query
 * and the tests. Strict object shapes reject victim-level fields before
 * anything reaches the database: only public endpoints and organization names
 * are accepted. No network and no database access happens here.
 */
import { z } from "zod";

export const NA_DEPARTMENTS = [
  "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

export const TECHNICAL_KINDS = ["cve", "poc", "nvd", "exploit_db", "github"] as const;

export type TechnicalKind = (typeof TECHNICAL_KINDS)[number];

const department = z.string().refine((value) =>
  (NA_DEPARTMENTS as readonly string[]).includes(value), "department outside Nouvelle-Aquitaine");

const publicHttpsUrl = z.string().url().refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}, "only public HTTPS URLs without credentials");

export const TechnicalSiteSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(TECHNICAL_KINDS),
  name: z.string().min(1),
  url: publicHttpsUrl,
  department,
  naAnchor: z.string().min(1),
  format: z.string().min(1),
});

export const NaClaimSchema = z.strictObject({
  id: z.string().min(1),
  orgId: z.number().int().positive(),
  orgName: z.string().min(1),
  department,
  groupName: z.string().min(1),
  publishedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "invalid date"),
  evidenceUrl: publicHttpsUrl,
  source: z.string().min(1),
  naMotif: z.string().min(1),
});

export type TechnicalSite = z.infer<typeof TechnicalSiteSchema>;
export type NaClaim = z.infer<typeof NaClaimSchema>;

export type ClaimOrganization = {
  id: number;
  name: string;
  department: string | null;
};

export function isNaDepartment(value: string | null | undefined): boolean {
  return value !== null && value !== undefined &&
    (NA_DEPARTMENTS as readonly string[]).includes(value.trim());
}

export function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Accepts a catalogue line only when it is an NA-scoped public technical endpoint. */
export function parseTechnicalSite(raw: unknown): TechnicalSite | null {
  const result = TechnicalSiteSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Accepts a claim line only when it names an organization, never a person. */
export function parseNaClaim(raw: unknown): NaClaim | null {
  const result = NaClaimSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * A claim is attached only when the referential confirms the exact
 * organization name and its Nouvelle-Aquitaine department. An ambiguous or
 * missing match is skipped, never guessed.
 */
export function matchesNaOrganization(
  claim: Pick<NaClaim, "orgName" | "department">,
  org: ClaimOrganization,
): boolean {
  return org.id > 0 &&
    foldName(claim.orgName) === foldName(org.name) &&
    org.department !== null &&
    org.department.trim() === claim.department.trim() &&
    isNaDepartment(org.department);
}
