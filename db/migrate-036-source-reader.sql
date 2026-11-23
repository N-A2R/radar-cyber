-- 036 : un mode de lecture par source.
--
-- Le collecteur ne sait lire qu'un flux RSS/JSON. Or plus de la moitié du parc
-- déclaré n'en est pas un : 110 pages HTML, 43 listes d'indicateurs, 9
-- warninglists, 14 pages de fuite. Ces sources sont déclarées, activées, et
-- ne produisent rien — la détection automatique les refuse et elles
-- n'apparaissent nulle part.
--
-- `reader` dit **comment lire** la source. NULL = comportement historique
-- (`auto`) : la détection automatique essaie, et refuse si elle ne sait pas.
--
-- Valeurs :
--   auto             — détection automatique (historique, défaut)
--   feed             — flux RSS/Atom/JSON avec chemin déclaré
--   html-page        — page web à lire (sites de fuite, presse, blogs)
--   html-links       — page dont on veut les liens
--   indicator-list   — txt/json d'indicateurs (IP, domaines, hachages)
--   quarantine-first — .onion illisible : corps en quarantaine, relisible
--
-- Aucune donnée n'est migrée : NULL préserve le comportement actuel.

ALTER TABLE source ADD COLUMN IF NOT EXISTS reader text;
ALTER TABLE source ADD COLUMN IF NOT EXISTS reader_config jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_reader_check') THEN
    ALTER TABLE source ADD CONSTRAINT source_reader_check CHECK (
      reader IS NULL OR reader IN ('auto','feed','html-page','html-links','indicator-list','quarantine-first')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS source_reader_idx ON source (reader) WHERE reader IS NOT NULL;
