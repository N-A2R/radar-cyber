-- 204 : corroboration des revendications avant publication.
--
-- Une annonce d'attaquant n'est pas un incident confirmé. `leak_claim` porte
-- désormais `corroboration_score` (0 à 3), calculé à partir de trois signaux
-- indépendants :
--   1. `event`           le radar a déjà un événement rattaché à la même
--                        organisation (`event.org_id`), avec une assertion
--                        d'incident ou de revendication tierce ;
--   2. `fuite_reference` une référence de fuite documentée couvre le domaine
--                        ou l'organisation (`fuite_org` ou même domaine) ;
--   3. `seconde source`  une source distincte de celle qui a publié la
--                        revendication rapporte la même victime : autre
--                        `leak_claim` de même victime + groupe, ou événement
--                        de la même organisation publié par un autre
--                        `source_id`.
--
-- 0 = annonce isolée ; 1 = un signal ; >= 2 = corroborée. Le score mesure
-- l'indépendance des sources, pas la véracité de l'attaque : il sert à trier
-- la diffusion, jamais à confirmer un incident. Le regroupement par éditeur
-- (deux flux d'un même éditeur = une source) reste le rôle de
-- `apps/api/src/analyse/incident-corroboration.ts`, qui traite des incidents.
--
-- Seules les revendications corroborées (>= 2) entrent dans
-- `leak_claim_public` : la diffusion publique ne reprend jamais une annonce
-- isolée.
--
-- Le calcul est stocké (colonne) pour que la mesure soit une lecture, mais il
-- reste recalculable : après chaque collecte (`enregistrer`) et par le script
-- de rattrapage `scripts/backfill-corroboration-revendications.mts`.

ALTER TABLE public.leak_claim
  ADD COLUMN IF NOT EXISTS corroboration_score smallint NOT NULL DEFAULT 0;

ALTER TABLE public.leak_claim
  ADD COLUMN IF NOT EXISTS corroboration_motif text;

COMMENT ON COLUMN public.leak_claim.corroboration_score IS
  '0 = annonce isolée ; 1 = un signal ; >= 2 = corroborée (event, fuite_reference, seconde source).';
COMMENT ON COLUMN public.leak_claim.corroboration_motif IS
  'Signaux satisfaits, séparés par + : event, fuite_reference, seconde_source.';

CREATE INDEX IF NOT EXISTS idx_leak_claim_corroboration
  ON public.leak_claim (na, corroboration_score DESC)
  WHERE na;

-- Recalcule les scores. Sans argument : toute la table ; avec un org_id : les
-- seules revendications rattachées à cette organisation (collecte incrémentale).
CREATE OR REPLACE FUNCTION public.recompute_leak_claim_corroboration(p_org_id integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  updated integer;
BEGIN
  WITH event_org AS (
    SELECT e.org_id,
           bool_or(e.assertion_type IN ('confirmed_incident', 'third_party_claim')) AS has_event,
           array_agg(DISTINCT e.source_id)
             FILTER (WHERE e.assertion_type IN ('confirmed_incident', 'third_party_claim')) AS sources
      FROM public.event e
     WHERE e.org_id IS NOT NULL
     GROUP BY e.org_id
  ),
  fuite_org AS (
    SELECT DISTINCT f.org_id
      FROM public.fuite_org f
    UNION
    SELECT DISTINCT o.id
      FROM public.org o
      JOIN public.fuite_reference r
        ON lower(btrim(r.domain)) = lower(btrim(o.domain))
     WHERE o.domain IS NOT NULL AND btrim(o.domain) <> ''
  ),
  reprise AS (
    SELECT lower(btrim(c.victim)) AS victime,
           lower(btrim(c.group_name)) AS groupe,
           count(DISTINCT c.source) AS sources
      FROM public.leak_claim c
     GROUP BY 1, 2
  ),
  signaux AS (
    SELECT c.id,
           (CASE WHEN eo.has_event THEN 1 ELSE 0 END) AS sig_event,
           (CASE WHEN fo.org_id IS NOT NULL THEN 1 ELSE 0 END) AS sig_fuite,
           (CASE
              WHEN rp.sources > 1 THEN 1
              WHEN EXISTS (
                SELECT 1
                  FROM unnest(coalesce(eo.sources, ARRAY[]::text[])) AS source
                 WHERE source <> c.source
              ) THEN 1
              ELSE 0
            END) AS sig_seconde
      FROM public.leak_claim c
      LEFT JOIN event_org eo ON eo.org_id = c.org_id
      LEFT JOIN fuite_org fo ON fo.org_id = c.org_id
      LEFT JOIN reprise rp
        ON rp.victime = lower(btrim(c.victim))
       AND rp.groupe = lower(btrim(c.group_name))
     WHERE p_org_id IS NULL OR c.org_id = p_org_id
  )
  UPDATE public.leak_claim c
     SET corroboration_score = (s.sig_event + s.sig_fuite + s.sig_seconde)::smallint,
         corroboration_motif = nullif(concat_ws('+',
           CASE WHEN s.sig_event = 1 THEN 'event' END,
           CASE WHEN s.sig_fuite = 1 THEN 'fuite_reference' END,
           CASE WHEN s.sig_seconde = 1 THEN 'seconde_source' END), '')
    FROM signaux s
   WHERE c.id = s.id;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

COMMENT ON FUNCTION public.recompute_leak_claim_corroboration(integer) IS
  'Recalcule leak_claim.corroboration_score depuis event, fuite_reference et la seconde source. Retourne le nombre de lignes mises à jour.';

-- Surface de diffusion publique : jamais une annonce isolée.
DROP VIEW IF EXISTS public.leak_claim_public;
CREATE VIEW public.leak_claim_public AS
  SELECT id, source, site_slug, group_name, victim, country, sector,
         published_at, evidence_url, org_id, na, na_motif,
         corroboration_score, corroboration_motif, collected_at
    FROM public.leak_claim
   WHERE corroboration_score >= 2;

COMMENT ON VIEW public.leak_claim_public IS
  'Revendications corroborées (score >= 2) : seule surface de diffusion publique des annonces. Une annonce isolée en reste absente.';

-- Rattrapage des lignes déjà collectées. Sans ligne, c'est un no-op.
SELECT public.recompute_leak_claim_corroboration();
