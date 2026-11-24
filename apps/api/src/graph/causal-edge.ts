/**
 * Chaînes fournisseur → victime : construction pure d'une arête causale.
 *
 * Aucune donnée personnelle n'entre ou ne sort de ce module : uniquement des
 * identifiants d'organisation, des domaines publics, des noms de fournisseurs
 * publics et des horodatages. Une arête n'est produite que si les deux preuves
 * exigées par la migration 227 sont présentes et datées : observation DNS du
 * fournisseur et indicateur de certificat suspect.
 */

export const SUPPLY_CHAIN_RELATION = "supply_chain";
export const CAUSAL_EDGE_METHOD = "derive-certificat-suspect@1";

/** Douze départements de Nouvelle-Aquitaine (référentiel régional). */
export const NA_DEPARTMENTS = [
  "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

const NA_DEPARTMENT_SET: ReadonlySet<string> = new Set(NA_DEPARTMENTS);

export interface SupplyChainObservation {
  /** Nom public issu du catalogue dns_fournisseur. */
  provider: string;
  /** Domaine public observé, propriété de l'organisation cible. */
  domain: string;
  orgId: number;
  dept: string;
  /** Première vue de l'indicateur CT. */
  firstSeenAt: Date | string;
  /** Date de l'observation NS/MX. */
  observedAt: Date | string;
  indicatorId: string | number;
  indicatorMotif: string;
  indicatorSource: string;
}

export interface SupplyChainEvidence {
  first_seen_at: string;
  method: string;
  indicator_source: string;
  indicator_id: string;
  indicator_motif: string;
  provider: string;
  catalogue: string;
  observed_at: string;
  domain: string;
  dept: string;
  portee_source: string;
  ancrage: string;
}

export interface CausalEdgeRecord {
  sourceId: string;
  targetId: string;
  relationType: string;
  pathLength: number;
  path: string[];
  evidence: SupplyChainEvidence;
  method: string;
}

/** ISO-8601 UTC à la seconde : format attendu par la contrainte SQL. */
function utcSecond(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Identifiant de nœud stable, dérivé du nom public du fournisseur. */
export function providerNodeId(provider: string): string {
  const slug = provider
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `provider:${slug}`;
}



/**
 * Construit un chemin en deux sauts : fournisseur → domaine → organisation.
 * Renvoie `null` dès qu'une preuve manque ou sort du périmètre régional :
 * aucune inférence, aucune date de collecte prise pour une première vue.
 */
export function buildSupplyChainEdge(observation: SupplyChainObservation): CausalEdgeRecord | null {
  const provider = observation.provider.trim().toLowerCase();
  const domain = observation.domain.trim().toLowerCase();
  const firstSeenAt = utcSecond(observation.firstSeenAt);
  const observedAt = utcSecond(observation.observedAt);
  // Domaine public attendu : au moins deux labels alphanumériques.
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)) return null;
  if (!provider || !NA_DEPARTMENT_SET.has(observation.dept)) return null;
  if (!firstSeenAt || !observedAt) return null;
  if (!String(observation.indicatorSource).trim() || !String(observation.indicatorMotif).trim()) {
    return null;
  }
  if (!Number.isInteger(observation.orgId) || observation.orgId <= 0) return null;

  const sourceId = providerNodeId(provider);
  const targetId = `org:${observation.orgId}`;
  const path = [sourceId, `domain:${domain}`, targetId];

  return {
    sourceId,
    targetId,
    relationType: SUPPLY_CHAIN_RELATION,
    pathLength: 2,
    path,
    method: CAUSAL_EDGE_METHOD,
    evidence: {
      first_seen_at: firstSeenAt,
      method: "certificat_suspect+fournisseur_dns+organisation_na",
      indicator_source: observation.indicatorSource,
      indicator_id: String(observation.indicatorId),
      indicator_motif: observation.indicatorMotif,
      provider,
      catalogue: "dns_fournisseur",
      observed_at: observedAt,
      domain,
      dept: observation.dept,
      portee_source: "globale",
      ancrage: "organisation_na",
    },
  };
}
