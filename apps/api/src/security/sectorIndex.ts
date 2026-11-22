/**
 * Sector security-debt index for the whole Nouvelle-Aquitaine region.
 *
 * The index is deliberately computed from four observable signals only:
 * patch lag (disclosure to regional visibility), TLS certificate health,
 * SPF and DMARC for public organisational domains. No victim data, no paid
 * feed and no per-person measurement enters this module.
 *
 * Every function here is pure: the network probes and the frozen inputs live
 * in scripts, so the published number can be recomputed offline.
 */

export const SECTORS = [
  "agroalimentaire", "industrie", "construction", "commerce", "sante",
  "enseignement", "public", "services", "autre",
] as const;

export type Sector = (typeof SECTORS)[number];

export const WEIGHTS = {
  patchLag: 0.25,
  tls: 0.25,
  spf: 0.25,
  dmarc: 0.25,
} as const;

export type TlsStatus =
  | "ok"
  | "expired"
  | "weak"
  | "hostname_mismatch"
  | "unreachable";

export type SpfStatus = "valid" | "permissive" | "missing" | "unknown";
export type DmarcStatus = "valid" | "monitor" | "missing" | "unknown";

/** One public-domain observation. No personal or victim field is allowed. */
export type SignalObservation = {
  domain: string;
  sector: Sector;
  department: string | null;
  tls: TlsStatus;
  spf: SpfStatus;
  dmarc: DmarcStatus;
  observedAt: string;
};

export type ObservationCounts = {
  tls: { ok: number; total: number };
  spf: { valid: number; total: number };
  dmarc: { valid: number; total: number };
};

export type SectorIndex = {
  sector: Sector;
  organizations: number;
  index: number;
  patchLagDays: number;
  patchLagScore: number;
  tlsScore: number;
  spfScore: number;
  dmarcScore: number;
  measuredHosts: number;
  basis: "sector" | "regional-fallback";
  signalBasis: Record<"tls" | "spf" | "dmarc", "sector" | "regional">;
};

export type SectorIndexReport = {
  scope: string;
  rule: string;
  totalOrganizations: number;
  sectorsIndexed: number;
  patchLagDays: number;
  minHostsPerSector: number;
  sectors: SectorIndex[];
};

/** Patch-lag window used by the NVD corpus: 0 days = 100, 30 days = 0. */
export const PATCH_LAG_WINDOW_DAYS = 30;

export function scorePatchLag(days: number): number {
  if (!Number.isFinite(days) || days < 0) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - (days / PATCH_LAG_WINDOW_DAYS) * 100)));
}

/** A `+all` SPF mechanism authorises every sender and scores as permissive. */
export function classifySpf(txtRecords: readonly string[]): SpfStatus {
  const records = txtRecords
    .filter((value) => value.trim().toLowerCase().startsWith("v=spf1"));
  if (records.length === 0) return "missing";
  const combined = records.join(" ").toLowerCase();
  if (/(^|\s)\+all(\s|$)/.test(combined)) return "permissive";
  return "valid";
}

/** DMARC is healthy only with an enforcement policy (reject or quarantine). */
export function classifyDmarc(txtRecords: readonly string[]): DmarcStatus {
  const record = txtRecords.find((value) => value.trim().toLowerCase().startsWith("v=dmarc1"));
  if (!record) return "missing";
  return /(?:^|[;\s])p\s*=\s*(?:reject|quarantine)(?=[;\s]|$)/i.test(record) ? "valid" : "monitor";
}

export type TlsInput = {
  authorized: boolean;
  validTo: Date | null;
  keyBits: number | null;
  protocol: string | null;
  /** EC curves report a smaller bit count that is not comparable to RSA. */
  curve?: string | null;
  now?: Date;
};

export function classifyTls(input: TlsInput): TlsStatus {
  const now = input.now ?? new Date();
  if (input.validTo && input.validTo.getTime() < now.getTime()) return "expired";
  if (!input.curve && input.keyBits !== null && input.keyBits < 2048) return "weak";
  if (input.protocol === "TLSv1" || input.protocol === "TLSv1.1") return "weak";
  if (!input.authorized) return "hostname_mismatch";
  return "ok";
}

export function countObservations(observations: readonly SignalObservation[]): ObservationCounts {
  return {
    tls: {
      ok: observations.filter((o) => o.tls === "ok").length,
      total: observations.filter((o) => o.tls !== "unreachable").length,
    },
    spf: {
      valid: observations.filter((o) => o.spf === "valid").length,
      total: observations.filter((o) => o.spf !== "unknown").length,
    },
    dmarc: {
      valid: observations.filter((o) => o.dmarc === "valid").length,
      total: observations.filter((o) => o.dmarc !== "unknown").length,
    },
  };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}
export function scoreObservations(counts: ObservationCounts): Pick<SectorIndex, "tlsScore" | "spfScore" | "dmarcScore"> {
  return {
    tlsScore: rate(counts.tls.ok, counts.tls.total),
    spfScore: rate(counts.spf.valid, counts.spf.total),
    dmarcScore: rate(counts.dmarc.valid, counts.dmarc.total),
  };
}

export type ComputeInput = {
  organizations: Readonly<Partial<Record<Sector, number>>>;
  observations: readonly SignalObservation[];
  patchLagDays: number;
  minHostsPerSector?: number;
};

/**
 * Build one index per sector. The organisation denominator always comes from
 * the whole region; a sector with too few probed hosts falls back to the
 * regional signal rates and is labelled as such instead of being dropped.
 */
export function computeSectorIndices(input: ComputeInput): SectorIndexReport {
  const minHosts = input.minHostsPerSector ?? 3;
  const missing = SECTORS.filter((sector) => !input.organizations[sector]);
  if (missing.length > 0) {
    throw new Error(`Missing region-wide organisation counts for: ${missing.join(", ")}`);
  }

  const patchLagScore = scorePatchLag(input.patchLagDays);
  const regionalScores = scoreObservations(countObservations(input.observations));

  const sectors = SECTORS.map<SectorIndex>((sector) => {
    const own = input.observations.filter((observation) => observation.sector === sector);
    const hasOwnSample = own.length >= minHosts;
    const ownCounts = countObservations(own);
    const hasTls = hasOwnSample && ownCounts.tls.total > 0;
    const hasSpf = hasOwnSample && ownCounts.spf.total > 0;
    const hasDmarc = hasOwnSample && ownCounts.dmarc.total > 0;
    const scores = {
      tlsScore: hasTls ? rate(ownCounts.tls.ok, ownCounts.tls.total) : regionalScores.tlsScore,
      spfScore: hasSpf ? rate(ownCounts.spf.valid, ownCounts.spf.total) : regionalScores.spfScore,
      dmarcScore: hasDmarc ? rate(ownCounts.dmarc.valid, ownCounts.dmarc.total) : regionalScores.dmarcScore,
    };
    const signalBasis: SectorIndex["signalBasis"] = {
      tls: hasTls ? "sector" : "regional",
      spf: hasSpf ? "sector" : "regional",
      dmarc: hasDmarc ? "sector" : "regional",
    };
    const index = Math.round(
      WEIGHTS.patchLag * patchLagScore +
      WEIGHTS.tls * scores.tlsScore +
      WEIGHTS.spf * scores.spfScore +
      WEIGHTS.dmarc * scores.dmarcScore,
    );
    return {
      sector,
      organizations: input.organizations[sector] ?? 0,
      index,
      patchLagDays: input.patchLagDays,
      patchLagScore,
      tlsScore: scores.tlsScore,
      spfScore: scores.spfScore,
      dmarcScore: scores.dmarcScore,
      measuredHosts: own.length,
      basis: hasTls && hasSpf && hasDmarc ? "sector" : "regional-fallback",
      signalBasis,
    };
  });

  return {
    scope: "Nouvelle-Aquitaine (12 departments)",
    rule: "weighted mean of patch-lag, TLS, SPF and DMARC subscores (0.25 each); any signal without a usable sample falls back to the regional rate",
    totalOrganizations: sectors.reduce((sum, item) => sum + item.organizations, 0),
    sectorsIndexed: sectors.filter((item) => item.organizations > 0 && Number.isFinite(item.index)).length,
    patchLagDays: input.patchLagDays,
    minHostsPerSector: minHosts,
    sectors,
  };
}
