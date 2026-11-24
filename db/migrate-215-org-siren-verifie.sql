-- Migration 215 : identité légale vérifiée des organisations citées.
--
-- Une organisation citée par un événement ne doit être publiée que si son
-- SIREN a été confronté à la source officielle : API mise à disposition par la
-- DINUM à partir de la base SIRENE de l'INSEE. `siren_verifie_le` horodate cette
-- confrontation ; `siren_nom_officiel` conserve la raison sociale renvoyée par
-- cette source, pour qu'un contrôle ultérieur puisse comparer les deux noms.
--
-- La contrainte interdit qu'un horodatage de vérification subsiste si le SIREN
-- n'a plus neuf chiffres : la date atteste d'une identité légale précise.
ALTER TABLE org ADD COLUMN IF NOT EXISTS siren_verifie_le timestamptz;
ALTER TABLE org ADD COLUMN IF NOT EXISTS siren_nom_officiel text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'org_siren_verifie_format_check' AND conrelid = 'org'::regclass
  ) THEN
    ALTER TABLE org ADD CONSTRAINT org_siren_verifie_format_check
      CHECK (siren_verifie_le IS NULL OR siren ~ '^[0-9]{9}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS org_siren_verifie_idx
  ON org (siren_verifie_le) WHERE siren_verifie_le IS NOT NULL;

-- Trace des attributions retirées : un événement dont le libellé ne correspond
-- à aucune personne morale vérifiable n'est plus rattaché à une organisation,
-- mais la raison du retrait reste consultable. Table dédiée plutôt qu'un
-- `evidence` modifié : ce dernier déclenche la synchronisation de la liste
-- blanche d'export public sur l'événement.
CREATE TABLE IF NOT EXISTS identite_legale_decrochage (
  event_id     bigint PRIMARY KEY REFERENCES event(id) ON DELETE CASCADE,
  motif        text NOT NULL CHECK (length(btrim(motif)) > 0),
  decroche_le  timestamptz NOT NULL DEFAULT now()
);
