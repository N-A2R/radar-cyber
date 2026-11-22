-- 064 : résultat de la vérification HTTP exhaustive des sources.
--
-- Une ligne = un GET réel effectué par scripts/verifier-sources-http.mts, avec
-- le code HTTP reçu, le type de contenu, le nombre d'items décodés par le
-- parser du format déclaré, la date du dernier item lu dans la réponse et le
-- temps de réponse mesuré. L'historique est conservé : la route
-- /api/sources/verification lit la dernière ligne par source.
CREATE TABLE IF NOT EXISTS source_verification (
  id                bigserial PRIMARY KEY,
  source_id         text        NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  url               text        NOT NULL,
  code_http         integer,
  content_type      text,
  items             integer     NOT NULL DEFAULT 0 CHECK (items >= 0),
  derniere_item_at  timestamptz,
  ms                integer     NOT NULL CHECK (ms >= 0),
  verifie_at        timestamptz NOT NULL DEFAULT now(),
  user_agent        text        NOT NULL,
  etat              text        NOT NULL CHECK (etat IN ('ok200', 'muette', 'morte', 'lente')),
  motif             text
);

CREATE INDEX IF NOT EXISTS idx_source_verification_source_date
  ON source_verification (source_id, verifie_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at
  ON source_verification (verifie_at DESC);
