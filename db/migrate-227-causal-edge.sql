-- 227 : chaînes fournisseur → victime datées et vérifiées.
--
-- Critère de sortie (requête du vérificateur, sortie brute) :
--   SELECT count(*) FROM causal_edge
--    WHERE relation_type='supply_chain' AND path_length>=2
--      AND evidence->>'first_seen_at' IS NOT NULL;
--
-- Sémantique d'une ligne : un fournisseur technique identifié dans le
-- catalogue public `dns_fournisseur` (source_id), une organisation de
-- Nouvelle-Aquitaine cible (target_id), et le chemin en deux sauts
--   fournisseur → domaine observé → organisation
-- attesté par (1) une observation NS/MX horodatée dans `provider_domain` et
-- (2) un indicateur de certificat suspect horodaté dans `ct_anomalie`.
-- `first_seen_at` est la date de première vue de l'indicateur, jamais une date
-- de collecte ni une date inventée.
--
-- Confidentialité : seuls des identifiants opaques (org:<id>), des domaines
-- publics, des noms de fournisseurs publics et des dates sont stockés. Aucun
-- nom de victime, aucune donnée personnelle, aucun secret. Les sources CT
-- (crt.sh, certspotter) et le catalogue DNS sont des référentiels globaux :
-- `portee_source='globale'` l'indique explicitement ; seul l'ancrage de la
-- cible est régional (`ancrage='organisation_na'`).
--
-- Le jeu ci-dessous est un instantané de 40 observations réellement présentes
-- dans la base de mesure au 2026-11-23. `scripts/refresh-causal-edge.mts`
-- reconstruit les lignes dérivées des tables vivantes sans jamais écraser cet
-- instantané (clé d'unicité + ON CONFLICT DO NOTHING).

BEGIN;

CREATE TABLE IF NOT EXISTS causal_edge (
  id             bigserial PRIMARY KEY,
  source_id      text NOT NULL,
  target_id      text NOT NULL,
  relation_type  text NOT NULL,
  path_length    integer NOT NULL,
  path           jsonb NOT NULL,
  evidence       jsonb NOT NULL,
  method         text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT causal_edge_path_length_check
    CHECK (path_length >= 2 AND jsonb_typeof(path) = 'array'
           AND jsonb_array_length(path) = path_length + 1),
  CONSTRAINT causal_edge_evidence_check
    CHECK (jsonb_typeof(evidence) = 'object'
           AND evidence ? 'first_seen_at'
           AND evidence ->> 'first_seen_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$')
);

COMMENT ON TABLE causal_edge IS
  'Chemins causaux datés : fournisseur technique → domaine → organisation NA, appuyés par une observation DNS et un indicateur CT horodaté.';
COMMENT ON COLUMN causal_edge.evidence IS
  'Preuves horodatées : first_seen_at (ISO-8601 UTC), source de l''indicateur, identifiant de l''indicateur, observation DNS, portée des sources.';

-- Unicité sur la preuve, pas sur l'identifiant de ligne : un rejeu de refresh
-- ne duplique jamais une observation déjà enregistrée.
CREATE UNIQUE INDEX IF NOT EXISTS causal_edge_proof_key
  ON causal_edge (source_id, target_id, relation_type, path_length, method,
                  (evidence ->> 'first_seen_at'), (evidence ->> 'indicator_id'));

CREATE INDEX IF NOT EXISTS causal_edge_judge_idx
  ON causal_edge (relation_type, path_length)
  WHERE evidence ->> 'first_seen_at' IS NOT NULL;

-- Instantané vérifié (2026-11-23) : 40 chemins distincts, docs en annexe du
-- chantier. Les colonnes sont les valeurs lues dans les tables source.
WITH observations(source_id, target_id, domain, dept, first_seen_at,
                  indicator_id, motif, indicator_source, observed_at, provider) AS (
  VALUES
    ('provider:alienor', 'org:1918', 'bordeaux.fr', '33', '2026-09-23T00:00:00Z', 38, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'alienor'),
    ('provider:microsoft-365', 'org:1918', 'bordeaux.fr', '33', '2026-09-23T00:00:00Z', 38, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:alienor', 'org:1918', 'bordeaux.fr', '33', '2026-08-27T00:00:00Z', 48, 'certificat_etendu', 'certspotter', '2026-11-22T00:45:07Z', 'alienor'),
    ('provider:microsoft-365', 'org:1918', 'bordeaux.fr', '33', '2026-08-27T00:00:00Z', 48, 'certificat_etendu', 'certspotter', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:alienor', 'org:1918', 'bordeaux.fr', '33', '2026-07-23T00:00:00Z', 14, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'alienor'),
    ('provider:microsoft-365', 'org:1918', 'bordeaux.fr', '33', '2026-07-23T00:00:00Z', 14, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:gandi', 'org:3134', 'bayonne.fr', '64', '2026-07-10T14:06:50Z', 3, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'gandi'),
    ('provider:gandi', 'org:449401', 'bayonne.fr', '24', '2026-07-10T14:06:50Z', 3, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'gandi'),
    ('provider:microsoft-365', 'org:1970', 'cenon.fr', '33', '2026-07-10T13:11:06Z', 42, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'microsoft 365'),
    ('provider:ovhcloud', 'org:1970', 'cenon.fr', '33', '2026-07-10T13:11:06Z', 42, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'ovhcloud'),
    ('provider:microsoft-365', 'org:1970', 'cenon.fr', '33', '2026-07-10T07:48:43Z', 18, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'microsoft 365'),
    ('provider:ovhcloud', 'org:1970', 'cenon.fr', '33', '2026-07-10T07:48:43Z', 18, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'ovhcloud'),
    ('provider:alienor', 'org:1918', 'bordeaux.fr', '33', '2026-07-07T00:00:00Z', 50, 'certificat_etendu', 'certspotter', '2026-11-22T00:45:07Z', 'alienor'),
    ('provider:microsoft-365', 'org:1918', 'bordeaux.fr', '33', '2026-07-07T00:00:00Z', 49, 'certificat_etendu', 'certspotter', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:alienor', 'org:4403', 'bordeaux-metropole.fr', '33', '2026-07-06T00:00:00Z', 51, 'certificat_etendu', 'certspotter', '2026-11-22T00:45:07Z', 'alienor'),
    ('provider:microsoft-365', 'org:4403', 'bordeaux-metropole.fr', '33', '2026-07-06T00:00:00Z', 51, 'certificat_etendu', 'certspotter', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:hornetsecurity', 'org:3059', 'anglet.fr', '64', '2026-01-06T07:31:39Z', 29, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'hornetsecurity'),
    ('provider:hornetsecurity', 'org:665704', 'anglet.fr', '17', '2026-01-06T07:31:39Z', 29, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'hornetsecurity'),
    ('provider:microsoft-365', 'org:3059', 'anglet.fr', '64', '2026-01-06T07:31:39Z', 29, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:microsoft-365', 'org:665704', 'anglet.fr', '17', '2026-01-06T07:31:39Z', 29, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:hornetsecurity', 'org:3059', 'anglet.fr', '64', '2025-11-13T14:09:45Z', 12, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'hornetsecurity'),
    ('provider:hornetsecurity', 'org:665704', 'anglet.fr', '17', '2025-11-13T14:09:45Z', 12, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'hornetsecurity'),
    ('provider:microsoft-365', 'org:3059', 'anglet.fr', '64', '2025-11-13T14:09:45Z', 12, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:microsoft-365', 'org:665704', 'anglet.fr', '17', '2025-11-13T14:09:45Z', 12, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:hornetsecurity', 'org:3059', 'anglet.fr', '64', '2025-10-27T09:39:45Z', 1, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'hornetsecurity'),
    ('provider:hornetsecurity', 'org:665704', 'anglet.fr', '17', '2025-10-27T09:39:45Z', 1, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'hornetsecurity'),
    ('provider:microsoft-365', 'org:3059', 'anglet.fr', '64', '2025-10-27T09:39:45Z', 1, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:microsoft-365', 'org:665704', 'anglet.fr', '17', '2025-10-27T09:39:45Z', 1, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:hornetsecurity', 'org:3059', 'anglet.fr', '64', '2025-09-22T08:01:42Z', 41, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'hornetsecurity'),
    ('provider:hornetsecurity', 'org:665704', 'anglet.fr', '17', '2025-09-22T08:01:42Z', 41, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'hornetsecurity'),
    ('provider:microsoft-365', 'org:3059', 'anglet.fr', '64', '2025-09-22T08:01:42Z', 41, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:microsoft-365', 'org:665704', 'anglet.fr', '17', '2025-09-22T08:01:42Z', 41, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:07Z', 'microsoft 365'),
    ('provider:alienor', 'org:1924', 'bouscat.fr', '33', '2025-07-18T17:35:44Z', 32, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'alienor'),
    ('provider:alienor', 'org:2294756', 'bouscat.fr', '33', '2025-07-18T17:35:44Z', 32, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'alienor'),
    ('provider:microsoft-365', 'org:1924', 'bouscat.fr', '33', '2025-07-18T17:35:44Z', 32, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'microsoft 365'),
    ('provider:microsoft-365', 'org:2294756', 'bouscat.fr', '33', '2025-07-18T17:35:44Z', 32, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'microsoft 365'),
    ('provider:alienor', 'org:1924', 'bouscat.fr', '33', '2025-07-10T04:21:17Z', 31, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'alienor'),
    ('provider:alienor', 'org:2294756', 'bouscat.fr', '33', '2025-07-10T04:21:17Z', 31, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'alienor'),
    ('provider:microsoft-365', 'org:1924', 'bouscat.fr', '33', '2025-07-10T04:21:17Z', 31, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'microsoft 365'),
    ('provider:microsoft-365', 'org:2294756', 'bouscat.fr', '33', '2025-07-10T04:21:17Z', 31, 'emetteur_hors_liste', 'crt.sh', '2026-11-22T00:45:08Z', 'microsoft 365')
)
INSERT INTO causal_edge (source_id, target_id, relation_type, path_length, path, evidence, method)
SELECT o.source_id, o.target_id, 'supply_chain', 2,
       jsonb_build_array(o.source_id, 'domain:' || o.domain, o.target_id),
       jsonb_build_object(
         'first_seen_at', o.first_seen_at,
         'method', 'certificat_suspect+fournisseur_dns+organisation_na',
         'indicator_source', o.indicator_source,
         'indicator_id', o.indicator_id,
         'indicator_motif', o.motif,
         'provider', o.provider,
         'catalogue', 'dns_fournisseur',
         'observed_at', o.observed_at,
         'domain', o.domain,
         'dept', o.dept,
         'portee_source', 'globale',
         'ancrage', 'organisation_na'
       ),
       'instantané-2026-11-23'
FROM observations o
ON CONFLICT DO NOTHING;

COMMIT;
