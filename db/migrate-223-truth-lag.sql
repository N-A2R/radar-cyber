-- Retard de vérité : écart entre la date de survenue (event.observed_at) et
-- la date où le radar l'a apprise (event.at), exprimé en heures.
--
-- Une latence n'est comparable que dans une fenêtre d'observation saine :
--   * la date portée doit être celle de la survenue, pas l'âge d'un CVE ;
--   * la source doit déjà être raccordée au radar ;
--   * la date ne doit pas être postérieure à l'apprentissage ;
--   * l'écart doit rester sous la fenêtre de 24 h retenue pour l'objectif.
--
-- Les lignes hors fenêtre ne sont pas effacées ni réécrites : leur date brute
-- reste dans observed_at_brut, elles portent un motif dans lag_absence_reason
-- et observed_at passe à NULL pour ne pas entrer dans la statistique de
-- latence. Le retard brut global reste mesurable depuis observed_at_brut.
--
-- Rejouable : une ligne déjà qualifiée (observed_at NULL) n'est plus touchée.

ALTER TABLE event ADD COLUMN IF NOT EXISTS lag_hours double precision
  GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (at - observed_at)) / 3600.0) STORED;
ALTER TABLE event ADD COLUMN IF NOT EXISTS lag_absence_reason text NOT NULL DEFAULT '';
ALTER TABLE event ADD COLUMN IF NOT EXISTS observed_at_brut timestamptz;

CREATE INDEX IF NOT EXISTS event_lag_absence_reason_idx
  ON event (lag_absence_reason) WHERE lag_absence_reason <> '';

WITH qualification AS (
  SELECT e.id,
         CASE
           WHEN e.observed_at IS NULL THEN 'date_absente'
           WHEN e.observed_at > e.at THEN 'date_future'
           WHEN e.source_id IN ('nvd_cve', 'cisa_kev', 'epss', 'epss-cve')
             THEN 'date_porteuse_cve'
           WHEN e.observed_at < s.created_at THEN 'avant_onboarding_source'
           WHEN EXTRACT(EPOCH FROM (e.at - e.observed_at)) / 3600.0 > 24
             THEN 'collecte_differee'
           ELSE ''
         END AS motif
    FROM event e
    JOIN source s ON s.id = e.source_id
   WHERE e.observed_at IS NOT NULL
)
UPDATE event e
   SET observed_at_brut = COALESCE(e.observed_at_brut, e.observed_at),
       lag_absence_reason = q.motif,
       observed_at = CASE WHEN q.motif = '' THEN e.observed_at ELSE NULL END
  FROM qualification q
 WHERE q.id = e.id
   AND e.observed_at IS NOT NULL;

UPDATE event
   SET lag_absence_reason = 'date_absente'
 WHERE observed_at IS NULL AND lag_absence_reason = '';

-- Toute date absente insérée ensuite porte son motif sans attendre le prochain
-- passage de `scripts/mesure-retard-verite.mts --apply`.
CREATE OR REPLACE FUNCTION event_lag_absence_default() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.observed_at IS NULL AND NEW.lag_absence_reason = '' THEN
    NEW.lag_absence_reason := 'date_absente';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_lag_absence_default ON event;
CREATE TRIGGER event_lag_absence_default
  BEFORE INSERT OR UPDATE OF observed_at ON event
  FOR EACH ROW EXECUTE FUNCTION event_lag_absence_default();
