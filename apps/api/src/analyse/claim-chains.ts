/**
 * Chaînes d'affirmations répétées sans source primaire.
 *
 * Projection en lecture seule de `claim_chain` : empreintes, compteurs et
 * dates uniquement. Aucun titre, nom de victime, URL ou donnée personnelle ne
 * sort de ce module. La détection est déterministe et reproductible.
 */

export const RUMEUR_REPETITIONS = 3;
export const RUMEUR_AGE_JOURS = 30;

export type ClaimChainRow = {
  claim_key: string;
  repetitions: number;
  primary_source_count: number;
  source_count: number;
  group_count: number;
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
};

export type ClaimChain = {
  claimKey: string;
  repetitions: number;
  primarySourceCount: number;
  sourceCount: number;
  groupCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  ageDays: number | null;
  verdict: "rumeur" | "etayee" | "non_datee" | "recente";
};

export type ClaimChainSummary = {
  chains: number;
  rumeurs: number;
  etayees: number;
  recentes: number;
  nonDatees: number;
  repetitionsTotales: number;
};

function instant(value: Date | string | null): number | null {
  if (value === null) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function iso(value: Date | string | null): string | null {
  const time = instant(value);
  return time === null ? null : new Date(time).toISOString();
}

/** Âge en jours depuis la première affirmation, ou null si non datée. */
export function ageEnJours(firstSeenAt: Date | string | null, now: Date = new Date()): number | null {
  const time = instant(firstSeenAt);
  if (time === null) return null;
  return Math.floor((now.getTime() - time) / 86_400_000);
}

/**
 * Une rumeur : au moins trois affirmations, aucune étayée par un document de
 * première main, et une première datation connue ancienne d'au moins 30 jours.
 */
export function estRumeur(row: ClaimChainRow, now: Date = new Date()): boolean {
  const age = ageEnJours(row.first_seen_at, now);
  return row.repetitions >= RUMEUR_REPETITIONS
    && row.primary_source_count === 0
    && age !== null
    && age >= RUMEUR_AGE_JOURS;
}

export function projectClaimChains(rows: readonly ClaimChainRow[], now: Date = new Date()): ClaimChain[] {
  return rows.map((row) => {
    const age = ageEnJours(row.first_seen_at, now);
    const verdict = age === null
      ? "non_datee"
      : estRumeur(row, now)
        ? "rumeur"
        : row.primary_source_count > 0
          ? "etayee"
          : "recente";
    return {
      claimKey: row.claim_key,
      repetitions: row.repetitions,
      primarySourceCount: row.primary_source_count,
      sourceCount: row.source_count,
      groupCount: row.group_count,
      firstSeenAt: iso(row.first_seen_at),
      lastSeenAt: iso(row.last_seen_at),
      ageDays: age,
      verdict,
    };
  });
}

export function summarizeClaimChains(rows: readonly ClaimChainRow[], now: Date = new Date()): ClaimChainSummary {
  const chains = projectClaimChains(rows, now);
  return {
    chains: chains.length,
    rumeurs: chains.filter((chain) => chain.verdict === "rumeur").length,
    etayees: chains.filter((chain) => chain.verdict === "etayee").length,
    recentes: chains.filter((chain) => chain.verdict === "recente").length,
    nonDatees: chains.filter((chain) => chain.verdict === "non_datee").length,
    repetitionsTotales: chains.reduce((total, chain) => total + chain.repetitions, 0),
  };
}
