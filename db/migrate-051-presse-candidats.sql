-- 051 : file de revue des candidats incidents cyber issus de la presse.
--
-- Les 925 articles datés du corpus contiennent 56 candidats cyber non
-- confirmés. La décision humaine est la source de vérité : elle est append-only
-- et datée, tandis que `presse_candidat.etat` n'est qu'une projection que l'on
-- peut reconstruire (voir `/api/presse/candidats/replay`).
BEGIN;

CREATE TABLE IF NOT EXISTS presse_candidat (
  cle              text PRIMARY KEY,
  titre            text NOT NULL,
  extrait          text NOT NULL DEFAULT '',
  url              text NOT NULL UNIQUE,
  date_publication date,
  source           text,
  commune          text,
  departement      text,
  org_proposee     text,
  score_confiance  real NOT NULL DEFAULT 0 CHECK (score_confiance >= 0 AND score_confiance <= 1),
  signaux          jsonb NOT NULL DEFAULT '[]'::jsonb,
  etat             text NOT NULL DEFAULT 'en_attente'
                   CHECK (etat IN ('en_attente', 'confirme', 'refuse', 'reclasse')),
  org_retenue      text,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  traite_le        timestamptz
);

CREATE TABLE IF NOT EXISTS presse_candidat_decision (
  id           bigserial PRIMARY KEY,
  cle          text NOT NULL REFERENCES presse_candidat(cle) ON DELETE CASCADE,
  passe        text NOT NULL,
  decision     text NOT NULL CHECK (decision IN ('confirmer', 'refuser', 'reclasser')),
  auteur       text NOT NULL,
  horodatage   timestamptz NOT NULL DEFAULT now(),
  raison       text NOT NULL,
  org_retenue  text,
  -- État et organisation proposés au moment de la décision : le rejeu ne
  -- dépend pas d'une évolution future du corpus ou du score.
  avant        jsonb NOT NULL DEFAULT '{}'::jsonb,
  apres        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS presse_candidat_file_idx
  ON presse_candidat (etat, score_confiance DESC, date_publication DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS presse_decision_cle_idx
  ON presse_candidat_decision (cle, id);
CREATE INDEX IF NOT EXISTS presse_decision_passe_idx
  ON presse_candidat_decision (passe, horodatage DESC);

COMMENT ON TABLE presse_candidat IS
  'Projection de la file de revue des candidats cyber détectés dans la presse.';
COMMENT ON TABLE presse_candidat_decision IS
  'Décisions humaines append-only : auteur, horodatage et contexte de rejeu.';
COMMENT ON COLUMN presse_candidat.cle IS
  'Identifiant stable dérivé de l''URL, réutilisable après réimport du corpus.';

COMMIT;
