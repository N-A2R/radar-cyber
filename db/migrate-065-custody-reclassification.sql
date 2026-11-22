-- 065 : admission de custody à la frontière de reclassification.
--
-- La migration 064 journalise l'admission des événements inscrits directement
-- en Nouvelle-Aquitaine. Une ligne peut aussi être admise hors région puis
-- reclassée plus tard (backfill-regional, corrections de motage). Ce
-- changement de périmètre est une écriture distincte, que le trigger AFTER
-- INSERT ne voit pas : sans ce trigger, la chaîne restait incomplète jusqu'à
-- un backfill. La fonction de 064 est réutilisée telle quelle : elle pose le
-- même fait, avec la même preuve et le même garde-fou contre les doublons.
-- Le journal reste append-only et aucune donnée de victime n'est journalisée.

BEGIN;

DROP TRIGGER IF EXISTS event_custody_admission_on_reclassification ON event;
CREATE TRIGGER event_custody_admission_on_reclassification
  AFTER UPDATE OF regional ON event
  FOR EACH ROW
  WHEN (OLD.regional IS DISTINCT FROM TRUE AND NEW.regional IS TRUE)
  EXECUTE FUNCTION custody_admission_at_insert();

COMMIT;
