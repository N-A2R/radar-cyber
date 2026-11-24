-- 238 — version de la règle de confiance attachée à chaque score.
--
-- Sans version, un score calculé avec l'ancien barème est indistinguable d'un
-- score `confidence@2` : impossible de savoir ce qui doit être recomputé après
-- un changement de règle. Une colonne NOT NULL avec défaut conserve toutes les
-- lignes existantes, qui restent étiquetées `confidence@1`.
BEGIN;

ALTER TABLE event_confidence
  ADD COLUMN IF NOT EXISTS regle_version text NOT NULL DEFAULT 'confidence@1';

ALTER TABLE attachment_confidence
  ADD COLUMN IF NOT EXISTS regle_version text NOT NULL DEFAULT 'confidence@1';

COMMENT ON COLUMN event_confidence.regle_version IS
  'Barème utilisé pour le calcul (confidence@1 historique, confidence@2 courant).';
COMMENT ON COLUMN attachment_confidence.regle_version IS
  'Barème utilisé pour le calcul (confidence@1 historique, confidence@2 courant).';

COMMIT;
