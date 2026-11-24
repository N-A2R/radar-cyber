-- 215 — prioriser les CVE par EPSS croisé à l'exposition observée.
--
-- `epss` donne une probabilité d'exploitation par CVE, sans lieu.
-- `exposition_service` donne des services observés, avec source et date,
-- sans attribution de CVE (la liste `evidence->vulns` couvre l'hôte entier).
-- Le croisement porte sur une paire (CVE, service) : la CVE est présente dans
-- la preuve primaire du service et son score EPSS atteint 0,5. Le rang est
-- attribué par score décroissant, puis CVE, puis service, sans tirage au sort.
--   exposé      = service cité (source_url non vide) et consulté il y a < 7 jours ;
--   exploitable = score EPSS >= 0,5 publié/rafraîchi il y a < 7 jours ;
--   confirmé    = exposé ET exploitable.
--
-- « Confirmé » qualifie la qualité de l'observation (source primaire citée,
-- fenêtre de sept jours des deux côtés). Ce n'est PAS une affirmation
-- d'exploitation active : le catalogue KEV est conservé comme signal distinct.
--
-- Aucune donnée personnelle : ni IP, ni URL de consultation, ni nom
-- d'organisation ne sont copiés ici. `service_id` renvoie à la ligne existante
-- de l'inventaire ; `nvd_url` est dérivée de l'identifiant public de la CVE.

BEGIN;

CREATE TABLE IF NOT EXISTS epss_exposure_eval (
  rank             integer PRIMARY KEY CHECK (rank > 0),
  cve              text NOT NULL,
  epss_score       double precision NOT NULL CHECK (epss_score BETWEEN 0 AND 1),
  epss_updated_at  timestamptz NOT NULL,
  service_id       bigint NOT NULL,
  service_port     integer NOT NULL,
  service_category text NOT NULL,
  service_tech     text NOT NULL,
  service_source   text NOT NULL,
  observed_at      timestamptz NOT NULL,
  observed_recent  boolean NOT NULL,
  cited            boolean NOT NULL,
  score_recent     boolean NOT NULL,
  exposed          boolean NOT NULL,
  exploitable      boolean NOT NULL,
  confirmed        boolean NOT NULL,
  kev              boolean NOT NULL DEFAULT false,
  nvd_url          text NOT NULL,
  rule_version     text NOT NULL DEFAULT 'epss-cross@1',
  evaluated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cve, service_id)
);

CREATE INDEX IF NOT EXISTS epss_exposure_eval_top50_idx
  ON epss_exposure_eval (rank) WHERE rank <= 50;
CREATE INDEX IF NOT EXISTS epss_exposure_eval_confirmes_idx
  ON epss_exposure_eval (confirmed, rank) WHERE rank <= 50;

COMMENT ON TABLE epss_exposure_eval IS
  'Paires CVE/service issues du croisement EPSS >= 0,5 et exposition_service, rangées par score, avec qualification de fraîcheur et de citation.';

CREATE OR REPLACE FUNCTION refresh_epss_exposure_eval() RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE
  total integer;
BEGIN
  DELETE FROM epss_exposure_eval;

  WITH paires AS (
    SELECT e.id                 AS service_id,
           v.value::text        AS cve,
           p.score              AS epss_score,
           p.updated_at         AS epss_updated_at,
           e.port               AS service_port,
           e.category           AS service_category,
           e.technology         AS service_tech,
           e.source             AS service_source,
           e.source_url         AS source_url,
           e.consulted_at       AS observed_at
      FROM exposition_service e
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(e.evidence->'vulns') = 'array'
             THEN e.evidence->'vulns'
             ELSE '[]'::jsonb END
      ) AS v(value)
      JOIN epss p ON p.cve = v.value AND p.score >= 0.5
  ),
  num AS (
    SELECT row_number() OVER (ORDER BY epss_score DESC, cve, service_id)::integer AS rang,
           p.*
      FROM paires p
  ),
  evalue AS (
    SELECT n.*,
           (observed_at >= now() - interval '7 days') AS observed_recent,
           (source_url <> '')                        AS cited,
           (epss_updated_at >= now() - interval '7 days') AS score_recent,
           EXISTS (SELECT 1 FROM event k WHERE k.dedup_key = 'kev:' || n.cve) AS kev
      FROM num n
  )
  INSERT INTO epss_exposure_eval
    (rank, cve, epss_score, epss_updated_at, service_id, service_port,
     service_category, service_tech, service_source, observed_at,
     observed_recent, cited, score_recent, exposed, exploitable, confirmed,
     kev, nvd_url, rule_version, evaluated_at)
  SELECT rang,
         cve,
         epss_score,
         epss_updated_at,
         service_id,
         service_port,
         service_category,
         service_tech,
         service_source,
         observed_at,
         observed_recent,
         cited,
         score_recent,
         (cited AND observed_recent)                       AS exposed,
         (epss_score >= 0.5 AND score_recent)              AS exploitable,
         (cited AND observed_recent AND score_recent)      AS confirmed,
         kev,
         'https://nvd.nist.gov/vuln/detail/' || cve       AS nvd_url,
         'epss-cross@1'                                    AS rule_version,
         now()                                             AS evaluated_at
    FROM evalue;

  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$fn$;

COMMENT ON FUNCTION refresh_epss_exposure_eval() IS
  'Recalcule epss_exposure_eval depuis epss et exposition_service ; renvoie le nombre de paires classées.';

SELECT refresh_epss_exposure_eval();

COMMIT;
