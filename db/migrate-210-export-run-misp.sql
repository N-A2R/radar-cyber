-- 210 : journal des exports MISP — un enregistrement par export réussi.
--
-- Un partenaire consomme `GET /export/misp` dans son propre MISP. Chaque
-- réponse est datée et empreintée : `sha256` porte le hash du corps JSON
-- exactement tel qu'il a été servi, `event_count` le nombre d'événements MISP
-- émis et `excluded_count` le nombre de faits écartés par la politique de
-- diffusion (TLP:AMBER et TLP:RED, jamais exportés).
--
-- Le hash est nullable uniquement pour laisser la place à d'anciens formats
-- ou à un export interrompu ; un export MISP réussi l'écrit toujours.

CREATE TABLE IF NOT EXISTS public.export_run (
  id             bigserial PRIMARY KEY,
  format         text NOT NULL,
  sha256         text,
  event_count    integer NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  excluded_count integer NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
  payload_bytes  bigint NOT NULL DEFAULT 0 CHECK (payload_bytes >= 0),
  filters        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_run_format_check CHECK (format ~ '^[a-z][a-z0-9_-]*$'),
  CONSTRAINT export_run_sha256_check CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS export_run_format_date_idx
  ON public.export_run (format, created_at DESC);
