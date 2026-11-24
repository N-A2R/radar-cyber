-- 230 : la colonne historique `source_ids` ne doit plus bloquer l'écriture.
--
-- Sur les bases antérieures à la migration 201, `source_ids text[]` était
-- NOT NULL. Le registre scelle désormais l'ensemble exact des sources dans
-- `source_digest` (SHA-256 des identifiants triés) et compte `sources_checked` :
-- le générateur n'écrit pas `source_ids`. La contrainte NOT NULL faisait donc
-- échouer chaque insertion avec « null value in column "source_ids" ».
--
-- On rend la colonne nullable sans toucher aux lignes existantes : elle reste
-- lisible pour l'historique, elle n'est plus présentée comme une source de
-- vérité pour les nouvelles attestations.

DO $$
BEGIN
  IF to_regclass('public.negative_attestation') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'negative_attestation'
       AND column_name = 'source_ids'
  ) THEN
    ALTER TABLE public.negative_attestation
      ALTER COLUMN source_ids DROP NOT NULL;

    COMMENT ON COLUMN public.negative_attestation.source_ids IS
      'Colonne historique : les attestations générées scellent l''ensemble des sources dans source_digest et comptent sources_checked.';
  END IF;
END $$;
