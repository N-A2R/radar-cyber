-- 229 : répare la clé d'unicité du registre des absences sur les bases historiques.
--
-- La migration 201 créait `negative_attestation_unique (org_slug, window_start,
-- window_end, method)`, mais son garde-fou ne vérifiait que le NOM de la
-- contrainte. Sur une base qui avait déjà une contrainte du même nom portant
-- sur `(org_id, window_start, window_end)`, la nouvelle clé n'était jamais
-- créée et le générateur échouait sur
-- `ON CONFLICT (org_slug, window_start, window_end, method)` :
-- « there is no unique or exclusion constraint matching the ON CONFLICT
-- specification ». Le registre restait à zéro attestation réellement générée.
--
-- On compare donc les COLONNES, pas seulement le nom, avant de remplacer la
-- contrainte. Aucune donnée n'est supprimée ni réécrite.

DO $$
DECLARE
  colonnes text[];
BEGIN
  IF to_regclass('public.negative_attestation') IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(a.attname::text ORDER BY k.ord)
    INTO colonnes
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
   WHERE c.conrelid = 'public.negative_attestation'::regclass
     AND c.conname = 'negative_attestation_unique'
     AND c.contype = 'u';

  IF colonnes IS DISTINCT FROM ARRAY['org_slug', 'window_start', 'window_end', 'method'] THEN
    ALTER TABLE public.negative_attestation
      DROP CONSTRAINT IF EXISTS negative_attestation_unique;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.negative_attestation'::regclass
       AND conname = 'negative_attestation_unique'
       AND contype = 'u'
  ) THEN
    ALTER TABLE public.negative_attestation
      ADD CONSTRAINT negative_attestation_unique
      UNIQUE (org_slug, window_start, window_end, method);
  END IF;
END $$;
