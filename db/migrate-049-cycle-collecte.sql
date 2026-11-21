-- 049 — Cycle de collecte robuste : santé par source, backoff persistant, reprise.
--
-- Additif uniquement : aucune ligne n'est supprimée, aucun historique réécrit.
-- `sante` est l'état opérationnel calculé (ok / rouge / morte) ; `statut`
-- reste l'état déclaré (active / morte) pour ne pas casser les routes et les
-- scripts existants. `prochaine_tentative_at` porte le backoff : il survit à un
-- redémarrage, contrairement à la carte en mémoire du client HTTP.
--
-- `collecte_cycle` est un point de reprise : un cycle interrompu (processus
-- tué, base injoignable) reprend par les sources encore en attente au cycle
-- suivant au lieu de repartir de zéro et de ne jamais finir le tour.

ALTER TABLE source
  ADD COLUMN IF NOT EXISTS sante text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS prochaine_tentative_at timestamptz,
  ADD COLUMN IF NOT EXISTS backoff_niveau integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_sante_valide') THEN
    ALTER TABLE source ADD CONSTRAINT source_sante_valide
      CHECK (sante IN ('ok', 'rouge', 'morte'));
  END IF;
END $$;

COMMENT ON COLUMN source.sante IS
  'État de santé calculé : ok (dernier run réussi), rouge (échecs en cours, backoff), morte (seuil franchi).';
COMMENT ON COLUMN source.prochaine_tentative_at IS
  'Première date où la source peut être retentée (backoff exponentiel par source).';

CREATE TABLE IF NOT EXISTS collecte_cycle (
  id                    text PRIMARY KEY CHECK (id = 'unique'),
  debut                 timestamptz NOT NULL,
  fin                   timestamptz,
  en_attente            text[] NOT NULL DEFAULT '{}',
  traitees              text[] NOT NULL DEFAULT '{}',
  jamais_collectees     integer NOT NULL DEFAULT 0,
  sources_collectees    integer NOT NULL DEFAULT 0,
  sources_en_echec      integer NOT NULL DEFAULT 0,
  rss_avant_octets      bigint,
  rss_apres_octets      bigint
);

COMMENT ON TABLE collecte_cycle IS
  'Point de reprise du cycle de collecte. Une seule ligne : le cycle courant ou le dernier cycle terminé.';
