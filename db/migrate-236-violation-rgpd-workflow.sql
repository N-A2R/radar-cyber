-- 236 — workflow de qualification / notification / clôture des violations RGPD.
--
-- SEC-06 : 86 violations suspectées, dont 40 hors délai de notification. Le
-- registre ne portait aucun état intermédiaire ni aucune preuve de notification
-- exploitable. On conserve `suspectee` (état initial automatique), on ajoute
-- `qualifiee` (analysée, responsable désigné) et on rend `notifiee` / `close`
-- traçables par des horodatages et une référence. Aucune donnée personnelle
-- supplémentaire : qualifiee_par est un identifiant de compte, pas un e-mail.
BEGIN;

ALTER TABLE violation_rgpd
  ADD COLUMN IF NOT EXISTS date_qualification timestamptz,
  ADD COLUMN IF NOT EXISTS qualifiee_par text,
  ADD COLUMN IF NOT EXISTS reference_notification text,
  ADD COLUMN IF NOT EXISTS date_cloture timestamptz;

ALTER TABLE violation_rgpd DROP CONSTRAINT IF EXISTS violation_rgpd_statut_check;
ALTER TABLE violation_rgpd ADD CONSTRAINT violation_rgpd_statut_check
  CHECK (statut IN ('suspectee', 'qualifiee', 'notifiee', 'close'));

-- Une qualification est datée ET attribuée ; une notification porte sa date
-- (déjà imposée par 216) et une destination ou une référence d'accusé réception ;
-- une clôture est datée. Les lignes historiques restent `suspectee` : elles ne
-- sont pas rendues invalides rétroactivement.
DO $patch$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'violation_rgpd_qualification_requise') THEN
    ALTER TABLE violation_rgpd ADD CONSTRAINT violation_rgpd_qualification_requise
      CHECK (statut <> 'qualifiee' OR (date_qualification IS NOT NULL AND qualifiee_par IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'violation_rgpd_notification_preuve_requise') THEN
    ALTER TABLE violation_rgpd ADD CONSTRAINT violation_rgpd_notification_preuve_requise
      CHECK (statut <> 'notifiee'
             OR (date_notification IS NOT NULL
                 AND (notifie_a IS NOT NULL OR reference_notification IS NOT NULL)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'violation_rgpd_cloture_requise') THEN
    ALTER TABLE violation_rgpd ADD CONSTRAINT violation_rgpd_cloture_requise
      CHECK (statut <> 'close' OR date_cloture IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'violation_rgpd_chronologie_check') THEN
    ALTER TABLE violation_rgpd ADD CONSTRAINT violation_rgpd_chronologie_check
      CHECK (date_qualification IS NULL OR date_qualification >= date_prise_connaissance)
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'violation_rgpd_champs_non_vides_check') THEN
    ALTER TABLE violation_rgpd ADD CONSTRAINT violation_rgpd_champs_non_vides_check
      CHECK ((qualifiee_par IS NULL OR length(btrim(qualifiee_par)) > 0)
             AND (reference_notification IS NULL OR length(btrim(reference_notification)) > 0));
  END IF;
END;
$patch$;

-- Le service fournit le responsable de qualification et la référence ; les
-- horodatages, eux, ne sont pas de simples données saisies.
CREATE OR REPLACE FUNCTION violation_rgpd_02_qualification_cloture()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.statut IN ('qualifiee', 'notifiee', 'close') AND NEW.date_qualification IS NULL THEN
    NEW.date_qualification := now();
  END IF;
  IF NEW.statut = 'close' AND NEW.date_cloture IS NULL THEN
    NEW.date_cloture := now();
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS violation_rgpd_02_qualification_cloture ON violation_rgpd;
CREATE TRIGGER violation_rgpd_02_qualification_cloture
  BEFORE INSERT OR UPDATE OF statut, date_qualification, date_cloture ON violation_rgpd
  FOR EACH ROW EXECUTE FUNCTION violation_rgpd_02_qualification_cloture();

-- File d'échéance : les notifications déjà faites sortent de la file, les
-- violations closes restent historisées mais ne sont plus à traiter.
CREATE INDEX IF NOT EXISTS violation_rgpd_echeance_72h_idx
  ON violation_rgpd (echeance_72h)
 WHERE statut <> 'notifiee';

CREATE OR REPLACE VIEW v_violation_rgpd_a_notifier AS
  SELECT id, reference, org_id, org_kind, dept, famille, source_id,
         date_prise_connaissance, echeance_72h, statut,
         now() - echeance_72h AS retard
    FROM violation_rgpd
   WHERE statut IN ('suspectee', 'qualifiee')
     AND echeance_72h < now();

COMMENT ON VIEW v_violation_rgpd_a_notifier IS
  'Violations suspectées ou qualifiées dont le délai de notification de 72 h est dépassé.';

COMMIT;
