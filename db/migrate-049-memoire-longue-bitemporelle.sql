-- 049 — continuité bi-temporelle de la mémoire longue.
--
-- La migration 046 a doté `event` de ses deux horloges :
--   * valid_at — quand le fait était vrai dans le monde ;
--   * at       — quand le radar l'a appris.
-- Mais la rétention archive sans elles : au bout de 90 jours, le fait retrouvé
-- par /api/history et par le rejeu perd la date qui lui donne son sens. Une
-- mémoire longue qui ne sait plus dater ses faits n'est qu'un tas de comptes.
--
-- On ajoute donc les deux colonnes aux deux archives (résumé de mesure et
-- copie intégrale d'audit), avec le même repli que 046 pour les lignes déjà
-- archivées : observed_at pour la vérité, collected_at pour la connaissance.
-- Aucune date n'est inventée, aucune ligne n'est réécrite au-delà de ce repli.
--
-- La vue unifiée est recréée pour exposer les deux horloges des deux côtés :
-- c'est elle que lisent la requête 12 mois et les outils de rejeu.

BEGIN;

ALTER TABLE event_archive
  ADD COLUMN IF NOT EXISTS valid_at timestamptz,
  ADD COLUMN IF NOT EXISTS at timestamptz;

UPDATE event_archive
   SET valid_at = COALESCE(valid_at, observed_at, collected_at),
       at       = COALESCE(at, collected_at, now())
 WHERE valid_at IS NULL OR at IS NULL;

ALTER TABLE event_archive ALTER COLUMN valid_at SET DEFAULT now();
ALTER TABLE event_archive ALTER COLUMN at SET DEFAULT now();
ALTER TABLE event_archive ALTER COLUMN valid_at SET NOT NULL;
ALTER TABLE event_archive ALTER COLUMN at SET NOT NULL;

CREATE INDEX IF NOT EXISTS event_archive_valid_at_idx ON event_archive (valid_at DESC);
CREATE INDEX IF NOT EXISTS event_archive_at_idx       ON event_archive (at DESC);

ALTER TABLE archive_event
  ADD COLUMN IF NOT EXISTS valid_at timestamptz,
  ADD COLUMN IF NOT EXISTS at timestamptz;

UPDATE archive_event
   SET valid_at = COALESCE(valid_at, observed_at, collected_at),
       at       = COALESCE(at, collected_at, now())
 WHERE valid_at IS NULL OR at IS NULL;

ALTER TABLE archive_event ALTER COLUMN valid_at SET DEFAULT now();
ALTER TABLE archive_event ALTER COLUMN at SET DEFAULT now();
ALTER TABLE archive_event ALTER COLUMN valid_at SET NOT NULL;
ALTER TABLE archive_event ALTER COLUMN at SET NOT NULL;

CREATE INDEX IF NOT EXISTS archive_event_valid_at_idx ON archive_event (valid_at DESC);
CREATE INDEX IF NOT EXISTS archive_event_at_idx       ON archive_event (at DESC);

COMMENT ON COLUMN event_archive.valid_at IS 'Quand le fait était vrai dans le monde (hérité de event avant purge).';
COMMENT ON COLUMN event_archive.at IS 'Quand le radar a appris le fait (hérité de event avant purge).';
COMMENT ON COLUMN archive_event.valid_at IS 'Quand le fait était vrai dans le monde (hérité de event avant purge).';
COMMENT ON COLUMN archive_event.at IS 'Quand le radar a appris le fait (hérité de event avant purge).';

-- Aucun objet de la base ne dépend de la vue : les requêtes sont dans le code.
-- DROP/CREATE permet de réordonner les colonnes sans survivre à un REPLACE
-- bancal. Le contenu reste le même fil brut + archive, sans double comptage.
DROP VIEW IF EXISTS v_event_all;

CREATE VIEW v_event_all AS
  SELECT id, dedup_key, family, assertion_type, org_id, source_id,
         observed_at, collected_at, valid_at, at,
         severity, confidence, admission_rule,
         'brut'::text AS origine
    FROM event
  UNION ALL
  SELECT id, dedup_key, family, assertion_type, org_id, source_id,
         observed_at, collected_at, valid_at, at,
         severity, confidence, admission_rule,
         'archive'::text AS origine
    FROM event_archive;

COMMENT ON VIEW v_event_all IS
  'Fil unifié brut + archive avec les deux horloges. La mesure de couverture lit ici, jamais `event` seule.';

COMMIT;
