-- 027 : journal de vérité — append-only, bi-temporel.
--
-- Contexte : neuf chemins d'écriture, aucun ne conserve l'état antérieur. Le
-- chargement du référentiel réécrit `org`, l'ingestion réécrit le rattachement
-- d'un événement déjà classé, la rétention supprime, la revue écrase. Corriger
-- le présent efface le passé, et rien ne permet plus de répondre à « qu'est-ce
-- qu'on croyait le 3 novembre ? ».
--
-- Doctrine, désormais vérifiée par la base et pas seulement écrite ici :
--
--   Aucune écriture destructive. On n'insère que des faits datés ; le reste est
--   une vue calculée.
--
-- Deux temps par fait, comme un graphe bi-temporel :
--   * `valid_at` — quand le fait était vrai dans le monde (date de l'incident,
--     date de la fusion, date de publication de l'alerte) ;
--   * `recorded_at` — quand le radar l'a appris. C'est la seule horloge qui ne
--     peut jamais être réécrite : un retard d'ingestion, une source publiée
--     après coup, un référentiel rechargé plus tard, tout cela reste lisible.
--
-- Aucune fonctionnalité ne dépend de cette table pour lire : les projections
-- gardent ce rôle (décision : event sourcing pragmatique, pas orthodoxe). Le
-- journal fait autorité pour l'audit, le rejeu et la mesure.

BEGIN;

CREATE TABLE IF NOT EXISTS journal (
  id           bigserial PRIMARY KEY,
  -- Nature du fait : 'event.admitted', 'org.rattaché', 'referentiel.chargé',
  -- 'revue.décidée', 'alerte.créée', 'règle.appliquée'…
  kind         text NOT NULL,
  -- Sujet : identifiant stable de ce dont on parle (dedup_key, org_id, slug,
  -- source_id). Jamais un id auto-incrémenté de projection, qui peut être recréé.
  subject      text NOT NULL,
  -- Ce qui a été décidé, en une ligne lisible par un humain.
  summary      text NOT NULL,
  -- Les preuves : moteur et sa version, référentiel et sa version, seuils,
  -- règle appliquée, alias retenu, extrait de texte. Le « pourquoi », pas
  -- seulement le « quoi ».
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Qui a décidé : 'moteur:gazetteer@2', 'humain:analyste@radar.local',
  -- 'collecteur:cert_fr'.
  actor        text NOT NULL,
  -- Deux temps : validité dans le monde, et connaissance par le système.
  valid_at     timestamptz,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

-- Le journal ne se réécrit pas. Les triggers ci-dessous rendent l'append-only
-- effectif : une mise à jour ou une suppression échoue, quelle que soit la
-- couche qui l'essaie (application, psql, script de maintenance).
CREATE OR REPLACE FUNCTION journal_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'journal append-only : % interdit (le journal ne se réécrit pas)', TG_OP
    USING HINT = 'Insérer un fait correctif plutôt que modifier le fait antérieur.';
END;
$$;

DROP TRIGGER IF EXISTS journal_no_update ON journal;
CREATE TRIGGER journal_no_update
  BEFORE UPDATE OR DELETE ON journal
  FOR EACH ROW EXECUTE FUNCTION journal_append_only();

-- Pas de TRUNCATE non plus : c'est une suppression en masse déguisée.
DROP TRIGGER IF EXISTS journal_no_truncate ON journal;
CREATE TRIGGER journal_no_truncate
  BEFORE TRUNCATE ON journal
  FOR EACH STATEMENT EXECUTE FUNCTION journal_append_only();

-- Lectures courantes : par sujet (l'histoire d'une organisation), par nature
-- (tous les rattachements d'une période), et dans l'ordre du temps système.
CREATE INDEX IF NOT EXISTS journal_subject_idx ON journal (subject, recorded_at DESC);
CREATE INDEX IF NOT EXISTS journal_kind_idx    ON journal (kind, recorded_at DESC);
CREATE INDEX IF NOT EXISTS journal_valid_idx   ON journal (valid_at DESC NULLS LAST);

COMMENT ON TABLE journal IS
  'Journal de vérité append-only et bi-temporel. Fait autorité pour l''audit, le rejeu et la mesure ; les projections font autorité pour la lecture.';
COMMENT ON COLUMN journal.valid_at IS
  'Quand le fait était vrai dans le monde. Peut être rétroactif (source publiée après coup).';
COMMENT ON COLUMN journal.recorded_at IS
  'Quand le radar l''a appris. Jamais réécrit : c''est l''horloge de l''audit.';

-- Décisions humaines : elles étaient écrasées par la revue. Elles trouvent ici
-- leur place définitive, avec l'auteur et la preuve.
COMMENT ON COLUMN journal.actor IS
  'Auteur de la décision : moteur et sa version, humain et son compte, ou collecteur.';

COMMIT;
