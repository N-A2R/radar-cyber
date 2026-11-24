/**
 * Antériorité des mentions .onion géolocalisées sur les premières victimes
 * régionales (chantier 115).
 *
 * Une mention n'est pas un incident : `onion_lead` garde la trace de la
 * mention, de son territoire NA et, lorsqu'une preuve existe, du premier
 * événement confirmé du même département. `lead_days` est calculé en base à
 * partir des deux dates ; ce module ne fait que lire et résumer ce calcul.
 */
import { query, withTransaction } from "../db.js";
import { leadDays } from "./pre-claim-detection.js";

/** Seuil de l'objectif : trois jours d'avance sur la première victime. */
export const MIN_ONION_LEAD_DAYS = 3;

/** Requête du critère, exécutée telle quelle par le vérificateur externe. */
export const ONION_LEAD_OBJECTIVE_SQL =
  "SELECT count(*) FROM onion_lead WHERE lead_days>=3 AND confirmed_event_id IS NOT NULL";

export type OnionLeadRow = {
  lead_key: string;
  onion_host: string;
  territory: string;
  territory_source: string;
  mention_at: string;
  confirmed_event_id: string | null;
  confirmed_event_at: string | null;
  lead_days: string | null;
  match_rule: string | null;
  is_bench: boolean;
};

export type OnionAnterioriteSummary = {
  total: number;
  qualified: number;
  medianLeadDays: number;
  byTerritory: { territory: string; qualified: number }[];
};

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Écart en jours entre la mention et la première victime confirmée. */
export function anterioriteDays(mentionAt: string, confirmedAt: string | null): number {
  return confirmedAt === null ? Number.NaN : leadDays(mentionAt, confirmedAt);
}

/** Vrai seulement si le lien existe et dépasse le seuil de trois jours. */
export function isQualifiedOnionLead(
  row: Pick<OnionLeadRow, "confirmed_event_id" | "lead_days">,
  minLeadDays = MIN_ONION_LEAD_DAYS,
): boolean {
  if (row.confirmed_event_id === null || row.lead_days === null) return false;
  const days = Number(row.lead_days);
  return Number.isFinite(days) && days >= minLeadDays;
}

/** Lecture des leads persistés ; aucun appel réseau, aucune donnée victime. */
export async function loadOnionLeads(): Promise<OnionLeadRow[]> {
  const result = await query<OnionLeadRow>(`
    SELECT lead_key, onion_host, territory, territory_source, mention_at::text,
           confirmed_event_id::text, confirmed_event_at::text,
           lead_days::text, match_rule, is_bench
      FROM onion_lead
     ORDER BY lead_key
  `);
  return result.rows;
}

/** Résumé régional des leads qualifiés, sans nom d'organisation. */
export function summariseOnionAnteriorite(
  rows: readonly OnionLeadRow[],
  minLeadDays = MIN_ONION_LEAD_DAYS,
): OnionAnterioriteSummary {
  const qualified = rows.filter((row) => isQualifiedOnionLead(row, minLeadDays));
  const byTerritory = new Map<string, number>();
  for (const row of qualified) {
    byTerritory.set(row.territory, (byTerritory.get(row.territory) ?? 0) + 1);
  }
  return {
    total: rows.length,
    qualified: qualified.length,
    medianLeadDays: median(qualified.map((row) => Number(row.lead_days))),
    byTerritory: [...byTerritory.entries()]
      .map(([territory, count]) => ({ territory, qualified: count }))
      .sort((a, b) => a.territory.localeCompare(b.territory)),
  };
}

/** Découvre les mentions réelles puis écrit les liens manquants, en une transaction. */
export async function refreshOnionAnteriorite(): Promise<{ discovered: number; linked: number }> {
  return withTransaction(async (client) => {
    const discovered = await client.query<{ refresh_onion_leads_from_events: number }>(
      "SELECT public.refresh_onion_leads_from_events()",
    );
    const linked = await client.query<{ link_onion_leads_to_events: number }>(
      "SELECT public.link_onion_leads_to_events()",
    );
    return {
      discovered: Number(discovered.rows[0]?.refresh_onion_leads_from_events ?? 0),
      linked: Number(linked.rows[0]?.link_onion_leads_to_events ?? 0),
    };
  });
}
