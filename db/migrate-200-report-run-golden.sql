-- Registre des exécutions des rapports golden.
--
-- Quatre lignes `golden` (vidéo, organisation, hebdomadaire, vide) sont la
-- référence versionnée : la suite de tests les met à jour avec l'empreinte
-- du snapshot normalisé à chaque vérification. Les exécutions ordinaires
-- sont enregistrées avec le statut `pass` ou `fail`.
CREATE TABLE IF NOT EXISTS report_run (
  id                bigserial PRIMARY KEY,
  code              text        NOT NULL,
  titre             text        NOT NULL,
  statut            text        NOT NULL CHECK (statut IN ('golden', 'pass', 'fail')),
  snapshot_sha256   text,
  octets_normalises integer     CHECK (octets_normalises IS NULL OR octets_normalises >= 0),
  verifie_le        timestamptz,
  cree_le           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS report_run_golden_code_uq
  ON report_run (code) WHERE statut = 'golden';

INSERT INTO report_run (code, titre, statut) VALUES
  ('video', 'Rapport de veille audiovisuelle', 'golden'),
  ('org', 'Rapport organisation', 'golden'),
  ('hebdo', 'Rapport hebdomadaire', 'golden'),
  ('vide', 'Rapport sans données', 'golden')
ON CONFLICT (code) WHERE statut = 'golden' DO NOTHING;
