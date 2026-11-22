-- 201 : ancrage quotidien de la racine du journal de vérité.
--
-- Le journal est append-only, mais une projection peut être corrigée : sans
-- ancrage daté, rien ne prouve qu'une décision existait déjà à la date qu'elle
-- déclare. On publie donc chaque jour un fichier `journal_root_AAAA-MM-JJ.json`
-- qui contient :
--   * la racine Merkle des faits du jour (recomputable depuis `journal`) ;
--   * un jeton RFC 3161 portant l'empreinte de cette racine ;
--   * les bornes d'identifiants du jour, pour recomputer exactement la racine.
--
-- Le « jour » est un jour UTC de `recorded_at` (l'horloge de connaissance, qui
-- ne réécrit jamais). `valid_at` reste dans la feuille de hachage : une décision
-- dont la validité est rétroactive est bien ancrée le jour où le radar l'a sue.
-- Corriger une projection n'efface ni la feuille ni son ancrage.
--
-- Une ligne est immuable : un second ancrage du même jour doit retomber sur la
-- même racine, sinon il échoue. On ne remplace jamais un ancrage existant.

BEGIN;

CREATE TABLE IF NOT EXISTS journal_anchor (
  jour             date PRIMARY KEY,
  racine_sha256    text NOT NULL CHECK (racine_sha256 ~ '^[0-9a-f]{64}$'),
  token_rfc3161    text NOT NULL CHECK (length(token_rfc3161) > 0),
  certificat_tsa   text NOT NULL CHECK (length(certificat_tsa) > 0),
  tsa_url          text NOT NULL CHECK (length(tsa_url) > 0),
  tsa_gen_time     text NOT NULL CHECK (length(tsa_gen_time) > 0),
  tsa_serial       text NOT NULL CHECK (length(tsa_serial) > 0),
  journal_debut_id bigint NOT NULL,
  journal_fin_id   bigint NOT NULL,
  journal_lignes   bigint NOT NULL DEFAULT 0,
  fichier          text NOT NULL CHECK (length(fichier) > 0),
  ancre_le         timestamptz NOT NULL DEFAULT now(),
  -- Les bornes sont prises au moment de l'ancrage : une ligne rétroactive
  -- inscrite ensuite ne change pas la racine publiée ce jour-là.
  CONSTRAINT journal_anchor_bornes_ordonnees CHECK (
    (journal_debut_id = 0 AND journal_fin_id = 0) OR journal_debut_id <= journal_fin_id
  )
);

COMMENT ON TABLE journal_anchor IS
  'Ancrage quotidien UTC du journal de vérité : racine Merkle recomputable et jeton RFC 3161. Immuable.';
COMMENT ON COLUMN journal_anchor.jour IS
  'Jour UTC de connaissance (recorded_at), pas jour de validité : une correction de projection ne change pas cet ancrage.';
COMMENT ON COLUMN journal_anchor.racine_sha256 IS
  'Racine Merkle des faits journal du jour, calculée sur id croissant dans apps/api/src/journal/merkle.ts.';
COMMENT ON COLUMN journal_anchor.token_rfc3161 IS
  'Jeton temporel RFC 3161 (base64) couvrant l''empreinte de racine_sha256 ; certificat de la TSA dans certificat_tsa.';
COMMENT ON COLUMN journal_anchor.journal_debut_id IS
  'Premier id de journal inclus dans la racine (0 si le jour est vide).';
COMMENT ON COLUMN journal_anchor.journal_fin_id IS
  'Dernier id de journal inclus dans la racine (0 si le jour est vide).';

CREATE OR REPLACE FUNCTION journal_anchor_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Un trigger de niveau instruction (TRUNCATE) n'a pas de OLD : on ne
  -- référence les champs de la ligne que pour UPDATE/DELETE.
  IF TG_LEVEL = 'ROW' THEN
    RAISE EXCEPTION
      'ancrage journal immuable : % interdit (jour %, racine %)',
      TG_OP, OLD.jour::text, OLD.racine_sha256
      USING HINT = 'Un ancrage ne se corrige pas : publiez un nouvel ancrage pour un autre jour.';
  END IF;
  RAISE EXCEPTION
    'ancrage journal immuable : % interdit',
    TG_OP
    USING HINT = 'Un ancrage ne se corrige pas : publiez un nouvel ancrage pour un autre jour.';
END;
$$;

DROP TRIGGER IF EXISTS journal_anchor_no_update ON journal_anchor;
CREATE TRIGGER journal_anchor_no_update
  BEFORE UPDATE OR DELETE ON journal_anchor
  FOR EACH ROW EXECUTE FUNCTION journal_anchor_append_only();

DROP TRIGGER IF EXISTS journal_anchor_no_truncate ON journal_anchor;
CREATE TRIGGER journal_anchor_no_truncate
  BEFORE TRUNCATE ON journal_anchor
  FOR EACH STATEMENT EXECUTE FUNCTION journal_anchor_append_only();

COMMIT;
