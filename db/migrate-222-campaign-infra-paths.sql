-- 222 : campagne → infrastructure → victime, répondu en une seule requête.
--
-- campaign_infra_paths est une projection matérialisée : une arête par
-- (campagne, incident, actif, organisation victime) réellement observée.
--   qui          : campaign_cle, campaign_family, victim_org_id
--   quoi         : asset_id, asset_kind, asset_value (domaine)
--   quand        : observed_at, campaign_debut, campaign_fin
--   source       : source (source de l'incident), asset_source (source du domaine)
--
-- Chaque arête porte ses deux preuves (evidence_campaign, evidence_asset),
-- toujours renseignées, et aucun nom de victime, titre d'événement ou corps
-- de revendication n'est matérialisé. Les domaines sont ceux de la table
-- asset, rattachés à l'organisation par event.org_id ou event.asset_id.
--
-- Requête unique attendue :
--   SELECT campaign_family, asset_value, victim_org_id, observed_at, source
--   FROM campaign_infra_paths
--   WHERE evidence_campaign IS NOT NULL AND evidence_asset IS NOT NULL;

BEGIN;

CREATE MATERIALIZED VIEW IF NOT EXISTS campaign_infra_paths AS
SELECT DISTINCT
  c.cle                                            AS campaign_cle,
  c.label                                          AS campaign_label,
  c.family                                         AS campaign_family,
  c.debut                                          AS campaign_debut,
  c.fin                                            AS campaign_fin,
  e.id                                             AS incident_id,
  a.id                                             AS asset_id,
  a.kind                                           AS asset_kind,
  lower(btrim(a.value))                            AS asset_value,
  e.org_id                                         AS victim_org_id,
  COALESCE(e.valid_at, e.observed_at, e.collected_at) AS observed_at,
  e.source_id                                      AS source,
  COALESCE(x.source, 'asset:' || a.status)         AS asset_source,
  jsonb_build_object(
    'campaign', c.cle,
    'incident', e.id,
    'family', c.family,
    'confiance', c.confiance,
    'source', e.source_id
  )                                                AS evidence_campaign,
  jsonb_build_object(
    'asset', a.id,
    'kind', a.kind,
    'domain', lower(btrim(a.value)),
    'status', a.status,
    'source', COALESCE(x.source, 'asset:' || a.status)
  )                                                AS evidence_asset
FROM campaign c
JOIN event e ON e.id = ANY (c.incidents)
JOIN asset a ON a.id = e.asset_id
            OR (e.asset_id IS NULL AND a.org_id = e.org_id)
LEFT JOIN org_enrichissement x
       ON x.org_id = a.org_id
      AND x.champ = 'domaine'
      AND lower(btrim(x.valeur)) = lower(btrim(a.value))
WHERE a.kind = 'domain'
  AND a.value IS NOT NULL AND btrim(a.value) <> ''
  AND e.org_id IS NOT NULL
  AND e.source_id IS NOT NULL;

-- Index unique : permet REFRESH MATERIALIZED VIEW CONCURRENTLY sans bloquer
-- les lecteurs, et garantit une arête par quadruplet campagne/incident/actif/victime.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_infra_paths_edge_idx
  ON campaign_infra_paths (campaign_cle, incident_id, asset_id, victim_org_id);
CREATE INDEX IF NOT EXISTS campaign_infra_paths_domain_idx
  ON campaign_infra_paths (asset_value, observed_at DESC);
CREATE INDEX IF NOT EXISTS campaign_infra_paths_campaign_idx
  ON campaign_infra_paths (campaign_cle, observed_at DESC);
CREATE INDEX IF NOT EXISTS campaign_infra_paths_source_idx
  ON campaign_infra_paths (source);

COMMENT ON MATERIALIZED VIEW campaign_infra_paths IS
  'Arêtes campagne → actif → victime, avec date et source, pour la requête qui utilise quoi contre qui quand.';

COMMIT;
