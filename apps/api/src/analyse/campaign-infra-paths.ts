/**
 * Lecture de la projection matérialisée campaign_infra_paths.
 *
 * Une seule requête répond à « qui utilise quoi, contre qui, quand » :
 * campagne et famille (qui), domaine de l'actif (quoi), identifiant
 * d'organisation victime (contre qui), date d'observation et sources (quand,
 * d'où vient le fait). Aucun nom de victime ni contenu de revendication.
 */
import { ingestQuery, query } from "../db.js";

export type CampaignInfraPath = {
	campaign_cle: string;
	campaign_label: string;
	campaign_family: string;
	campaign_debut: Date;
	campaign_fin: Date;
	incident_id: string;
	asset_id: number;
	asset_kind: string;
	asset_value: string;
	victim_org_id: number;
	observed_at: Date;
	source: string;
	asset_source: string;
	evidence_campaign: Record<string, unknown>;
	evidence_asset: Record<string, unknown>;
};

export type FiltresChemins = {
	domaine?: string;
	campagne?: string;
	limite?: number;
};

const COLONNES = `
	campaign_cle, campaign_label, campaign_family, campaign_debut, campaign_fin,
	incident_id, asset_id, asset_kind, asset_value, victim_org_id, observed_at,
	source, asset_source, evidence_campaign, evidence_asset
`;

/** Lit la projection ; les filtres sont optionnels et bornés. */
export async function campaignInfraPaths(filtres: FiltresChemins = {}): Promise<CampaignInfraPath[]> {
	const conditions = ["evidence_campaign IS NOT NULL", "evidence_asset IS NOT NULL"];
	const params: unknown[] = [];
	if (filtres.domaine) {
		params.push(filtres.domaine.trim().toLowerCase());
		conditions.push(`asset_value = $${params.length}`);
	}
	if (filtres.campagne) {
		params.push(filtres.campagne);
		conditions.push(`campaign_cle = $${params.length}`);
	}
	const limite = Math.min(Math.max(Math.trunc(filtres.limite ?? 200), 1), 1000);
	params.push(limite);
	const resultat = await query<CampaignInfraPath>(
		`SELECT ${COLONNES} FROM campaign_infra_paths
		  WHERE ${conditions.join(" AND ")}
		  ORDER BY observed_at DESC, campaign_cle, incident_id
		  LIMIT $${params.length}`,
		params,
	);
	return resultat.rows;
}

/** Reconstruit la projection après une écriture dans campaign/event/asset. */
export async function refreshCampaignInfraPaths(): Promise<void> {
	await ingestQuery("REFRESH MATERIALIZED VIEW CONCURRENTLY campaign_infra_paths");
}
