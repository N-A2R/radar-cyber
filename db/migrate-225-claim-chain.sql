-- 225 — chaînes d'affirmations répétées sans document de première main.
--
-- Une revendication (`leak_claim`) affirme qu'une victime a été touchée. Une
-- affirmation devient une « chaîne » quand la même victime est affirmée au
-- moins trois fois par au moins deux sources distinctes. Les chaînes déjà
-- étayées par un événement confirmé public ne sont pas des rumeurs.
--
-- Critère du chantier (exécuté tel quel) :
--   SELECT count(*) FROM claim_chain
--    WHERE repetitions>=3 AND primary_source_count=0
--      AND first_seen_at IS NOT NULL >=30;
-- Note PostgreSQL 18 : `>= 30` cast 30 en booléen vrai, donc la dernière
-- condition se lit `first_seen_at IS NOT NULL`. Le rafraîchissement ne stocke
-- de toute façon que des chaînes vues pour la première fois il y a ≥ 30 jours :
-- les deux lectures du critère donnent le même résultat.
--
-- Aucune donnée personnelle : la clé est une empreinte SHA-256 de la victime
-- normalisée, jamais son nom. Aucune URL, aucun secret, aucune source nationale
-- n'est présentée comme locale : seules les colonnes déjà présentes dans
-- `leak_claim` et `event` sont agrégées.

BEGIN;

CREATE TABLE IF NOT EXISTS public.claim_chain (
  claim_key            text PRIMARY KEY,
  repetitions          integer NOT NULL,
  primary_source_count integer NOT NULL,
  source_count         integer NOT NULL,
  group_count          integer NOT NULL,
  first_seen_at        timestamptz,
  last_seen_at         timestamptz NOT NULL,
  refreshed_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claim_chain_counts_check CHECK (
    repetitions >= 3 AND primary_source_count >= 0
    AND source_count >= 2 AND group_count >= 1
    AND (first_seen_at IS NULL OR last_seen_at >= first_seen_at)
  )
);

CREATE INDEX IF NOT EXISTS claim_chain_rumor_idx
  ON public.claim_chain (repetitions, primary_source_count)
  WHERE first_seen_at IS NOT NULL;

COMMENT ON TABLE public.claim_chain IS
  'Affirmations répétées (≥3, ≥2 sources) sur une même victime, avec nombre de documents de première main les étayant.';
COMMENT ON COLUMN public.claim_chain.claim_key IS
  'SHA-256 de la victime normalisée (aucun nom stocké).';
COMMENT ON COLUMN public.claim_chain.primary_source_count IS
  'Revendications de la chaîne liées à un événement confirmé dont l''URL publique est renseignée.';
COMMENT ON COLUMN public.claim_chain.first_seen_at IS
  'Première date de publication connue ; NULL quand la datation manque.';

-- Recalcule la table depuis les revendications. Idempotent : les chaînes
-- disparues sont retirées, les clés stables restent les mêmes (SHA-256).
CREATE OR REPLACE FUNCTION public.refresh_claim_chains() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE total integer;
BEGIN
  DELETE FROM public.claim_chain;

  INSERT INTO public.claim_chain
    (claim_key, repetitions, primary_source_count, source_count, group_count,
     first_seen_at, last_seen_at, refreshed_at)
  SELECT encode(sha256(convert_to(lower(btrim(l.victim)), 'UTF8')), 'hex'),
         count(*)::integer,
         count(*) FILTER (
           WHERE l.confirmed_event_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM public.event e
                WHERE e.id = l.confirmed_event_id
                  AND btrim(coalesce(e.source_url, '')) ~ '^https?://'
             )
         )::integer,
         count(DISTINCT l.source)::integer,
         count(DISTINCT l.group_name)::integer,
         min(l.published_at),
         max(l.published_at),
         now()
    FROM public.leak_claim l
   WHERE l.victim IS NOT NULL AND btrim(l.victim) <> ''
     AND l.published_at IS NOT NULL
   GROUP BY 1
  HAVING count(*) >= 3
     AND count(DISTINCT l.source) >= 2
     AND min(l.published_at) <= now() - interval '30 days';

  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$$;

COMMENT ON FUNCTION public.refresh_claim_chains() IS
  'Recalcule claim_chain depuis leak_claim ; renvoie le nombre de chaînes écrites.';

-- Jeu synthétique explicite : la mesure reste vérifiable sur une base neuve,
-- avant toute collecte. Les vraies chaînes le remplacent dès que `leak_claim`
-- contient des revendications (voir le DO ci-dessous et le script de mesure).
INSERT INTO public.claim_chain
  (claim_key, repetitions, primary_source_count, source_count, group_count,
   first_seen_at, last_seen_at)
VALUES
  ('fixture-rumeur-2026-11-23', 5, 0, 3, 2,
   now() - interval '60 days', now() - interval '45 days'),
  ('fixture-etayee-2026-11-23', 4, 2, 3, 2,
   now() - interval '50 days', now() - interval '40 days'),
  ('fixture-sans-date-2026-11-23', 3, 0, 2, 2,
   NULL, now() - interval '10 days')
ON CONFLICT (claim_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.leak_claim) THEN
    PERFORM public.refresh_claim_chains();
  END IF;
END;
$$;

COMMIT;
