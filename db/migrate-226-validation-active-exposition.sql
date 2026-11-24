-- 226 — validation active du décile d'exposition le plus risqué.
--
-- Le décile est le dixième supérieur de `exposition_service` classé par
-- `exposition_criticite(categorie, epss_max, kev)`. La boucle CTEM sonde ces
-- candidats par ordre de criticité (connexion TCP ciblée, aucun octet envoyé)
-- et ne retient que les 20 premières expositions effectivement joignables.
--
-- `discovered_at` date l'entrée du candidat dans la file de validation, pas la
-- mesure de la source primaire : c'est le délai de la boucle découverte →
-- validation que le CTEM mesure. `validated_at` n'est posé que sur une
-- connexion TCP ouverte (exposition confirmée).
--
-- Un refus explicite (`refuse`) réfute la source : c'est un faux positif. Un
-- `timeout` est indéterminé (filtrage réseau), il n'est compté ni comme
-- confirmation ni comme faux positif. Toutes les tentatives sont conservées
-- dans `exposition_validation_tentative` pour auditer ce taux.
--
-- Aucune adresse IP, aucun nom d'organisation, aucune donnée personnelle :
-- seuls l'identifiant d'inventaire, le port, la catégorie, la criticité, le
-- rang et le résultat du sondeur sont conservés.

BEGIN;

CREATE TABLE IF NOT EXISTS exposure_validation_eval (
  id             bigserial PRIMARY KEY,
  exposition_id  bigint NOT NULL CHECK (exposition_id > 0),
  rang           integer NOT NULL CHECK (rang > 0),
  categorie      text NOT NULL,
  port           integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  criticite      double precision NOT NULL CHECK (criticite BETWEEN 0 AND 100),
  discovered_at  timestamptz NOT NULL,
  tentative_at   timestamptz NOT NULL,
  validated_at   timestamptz,
  resultat       text NOT NULL CHECK (resultat IN ('ouvert', 'refuse', 'timeout', 'erreur')),
  methode        text NOT NULL DEFAULT 'tcp-connect@1',
  latence_ms     integer NOT NULL CHECK (latence_ms >= 0),
  faux_positif   boolean NOT NULL DEFAULT false,
  preuve         text NOT NULL CHECK (preuve <> ''),
  regle_version  text NOT NULL,
  evalue_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exposition_id, regle_version),
  UNIQUE (rang, regle_version),
  CHECK (tentative_at >= discovered_at),
  CHECK (validated_at IS NULL OR validated_at >= tentative_at),
  CHECK ((resultat = 'ouvert') = (validated_at IS NOT NULL)),
  CHECK (faux_positif = (resultat = 'refuse'))
);

CREATE INDEX IF NOT EXISTS exposure_validation_eval_delai_idx
  ON exposure_validation_eval (validated_at, discovered_at);
CREATE INDEX IF NOT EXISTS exposure_validation_eval_regle_idx
  ON exposure_validation_eval (regle_version, rang);

CREATE TABLE IF NOT EXISTS exposition_validation_tentative (
  id             bigserial PRIMARY KEY,
  exposition_id  bigint NOT NULL CHECK (exposition_id > 0),
  rang_candidat  integer NOT NULL CHECK (rang_candidat > 0),
  categorie      text NOT NULL,
  port           integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  criticite      double precision NOT NULL CHECK (criticite BETWEEN 0 AND 100),
  tentatives     integer NOT NULL CHECK (tentatives BETWEEN 1 AND 3),
  resultat       text NOT NULL CHECK (resultat IN ('ouvert', 'refuse', 'timeout', 'erreur')),
  faux_positif   boolean NOT NULL,
  discovered_at  timestamptz NOT NULL,
  tentative_at   timestamptz NOT NULL,
  validated_at   timestamptz,
  methode        text NOT NULL DEFAULT 'tcp-connect@1',
  preuve         text NOT NULL CHECK (preuve <> ''),
  regle_version  text NOT NULL,
  evalue_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exposition_id, regle_version),
  CHECK (tentative_at >= discovered_at),
  CHECK (validated_at IS NULL OR validated_at >= tentative_at),
  CHECK ((resultat = 'ouvert') = (validated_at IS NOT NULL)),
  CHECK (faux_positif = (resultat = 'refuse'))
);

CREATE INDEX IF NOT EXISTS exposition_validation_tentative_regle_idx
  ON exposition_validation_tentative (regle_version, rang_candidat);
CREATE INDEX IF NOT EXISTS exposition_validation_tentative_faux_idx
  ON exposition_validation_tentative (faux_positif);

COMMENT ON TABLE exposure_validation_eval IS
  'Instantané CTEM : 20 expositions du décile le plus risqué confirmées par connexion TCP active, avec date d entrée en file et date de validation.';
COMMENT ON COLUMN exposure_validation_eval.discovered_at IS
  'Entrée du candidat dans la file de validation active, distincte de la date de mesure de la source primaire.';
COMMENT ON COLUMN exposure_validation_eval.validated_at IS
  'Date de la connexion TCP ouverte : exposition confirmée, jamais une simple lecture de source.';
COMMENT ON COLUMN exposure_validation_eval.preuve IS
  'Preuve textuelle du sondeur, sans adresse IP ni nom d organisation.';

COMMENT ON TABLE exposition_validation_tentative IS
  'Journal borné des sondes actives du décile : chaque candidat tenté, y compris refus et timeouts, avec sa qualification de faux positif.';
COMMENT ON COLUMN exposition_validation_tentative.faux_positif IS
  'Vrai seulement si la sonde a répondu par un refus explicite : le timeout est indéterminé, pas une réfutation.';

COMMIT;
