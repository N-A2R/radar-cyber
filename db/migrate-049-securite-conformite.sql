-- 049 — Sécurité et conformité : journal des accès, droit de réponse.
--
-- Deux besoins distincts, deux tables distinctes :
--
--   * `access_log` : qui a appelé quoi, quand, avec quel résultat. Les lignes
--     ne s'écrasent pas (trigger), mais la rétention peut les effacer : c'est
--     le seul mécanisme de suppression, borné et documenté. Les adresses IP
--     n'y sont jamais stockées en clair, seulement sous forme de hash poivré.
--   * `droit_reponse` : la demande d'une organisation nommée, et la suite
--     append-only des décisions. Le statut de la demande n'est qu'une
--     projection : l'historique dans `droit_reponse_evenement` et le journal
--     de vérité font autorité.
--
-- Fichier rejouable (IF NOT EXISTS / OR REPLACE), aucune donnée modifiée.

CREATE TABLE IF NOT EXISTS access_log (
  id              bigserial PRIMARY KEY,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  methode         text NOT NULL,
  route           text NOT NULL,
  statut          integer NOT NULL,
  decision        text NOT NULL CHECK (decision IN ('autorise', 'refuse')),
  motif           text,
  niveau_requis   text NOT NULL,
  role            text,
  -- Pas de clé étrangère : l'effacement d'un compte ne doit pas réécrire
  -- l'audit. L'anonymisation passe par anonymiser_acces_utilisateur().
  user_id         integer,
  acteur          text NOT NULL,
  ip_hash         text NOT NULL,
  user_agent_hash text,
  correlation_id  text NOT NULL,
  duree_ms        integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION access_log_immuable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Seule exception : l'anonymisation RGPD d'un ancien compte. Les faits
  -- (date, route, statut, décision) restent intacts ; l'identité disparaît.
  IF TG_OP = 'UPDATE'
     AND NEW.acteur = 'compte-supprime'
     AND NEW.user_id IS NULL
     AND NEW.role IS NULL
     AND NEW.methode = OLD.methode
     AND NEW.route = OLD.route
     AND NEW.statut = OLD.statut
     AND NEW.decision = OLD.decision
     AND NEW.correlation_id = OLD.correlation_id THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'journal des accès : % interdit (les accès ne se réécrivent pas)', TG_OP
    USING HINT = 'Seule la rétention (purger_access_log) peut supprimer une ligne ancienne.';
END;
$$;

DROP TRIGGER IF EXISTS access_log_no_update ON access_log;
CREATE TRIGGER access_log_no_update
  BEFORE UPDATE ON access_log
  FOR EACH ROW EXECUTE FUNCTION access_log_immuable();

CREATE INDEX IF NOT EXISTS access_log_recorded_idx ON access_log (recorded_at DESC);
CREATE INDEX IF NOT EXISTS access_log_route_idx ON access_log (route, recorded_at DESC);
CREATE INDEX IF NOT EXISTS access_log_acteur_idx ON access_log (acteur, recorded_at DESC);
CREATE INDEX IF NOT EXISTS access_log_decision_idx ON access_log (decision, recorded_at DESC);
CREATE INDEX IF NOT EXISTS access_log_correlation_idx ON access_log (correlation_id);

/** Droit à l'effacement : retire l'identité d'un compte des accès historiques. */
CREATE OR REPLACE FUNCTION anonymiser_acces_utilisateur(p_acteur text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  modifiees integer;
BEGIN
  UPDATE access_log
     SET acteur = 'compte-supprime', user_id = NULL, role = NULL
   WHERE acteur = p_acteur AND acteur <> 'compte-supprime';
  GET DIAGNOSTICS modifiees = ROW_COUNT;
  RETURN modifiees;
END;
$$;

COMMENT ON TABLE access_log IS
  'Journal des accès API. Append-only applicatif ; seule la rétention supprime. IP et user-agent hashés (RGPD : minimisation).';
COMMENT ON COLUMN access_log.ip_hash IS
  'SHA-256 poivré tronqué de l''adresse IP. Jamais l''adresse en clair : un accès n''autorise pas une géolocalisation.';

/** Rétention du journal des accès. Seul chemin de suppression autorisé. */
CREATE OR REPLACE FUNCTION purger_access_log(p_jours integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  supprimees integer;
BEGIN
  DELETE FROM access_log WHERE recorded_at < now() - (p_jours || ' days')::interval;
  GET DIAGNOSTICS supprimees = ROW_COUNT;
  RETURN supprimees;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS droit_reference_seq START 1;

CREATE TABLE IF NOT EXISTS droit_reponse (
  id                serial PRIMARY KEY,
  reference         text NOT NULL UNIQUE,
  org_id            integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  organisation      text NOT NULL,
  contact_nom       text,
  email             text NOT NULL,
  domaine           text,
  motif             text NOT NULL CHECK (motif IN ('inexactitude', 'omission', 'suppression', 'autre')),
  message           text NOT NULL,
  piece_jointe_ref  text,
  moyen_verification text NOT NULL CHECK (moyen_verification IN ('nom', 'alias', 'domaine')),
  statut            text NOT NULL DEFAULT 'recu'
                    CHECK (statut IN ('recu', 'en_instruction', 'publiee', 'refusee')),
  demandeur_user_id integer REFERENCES app_user(id) ON DELETE SET NULL,
  ip_hash           text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  closed_at         timestamptz
);

CREATE TABLE IF NOT EXISTS droit_reponse_evenement (
  id          bigserial PRIMARY KEY,
  demande_id  integer NOT NULL REFERENCES droit_reponse(id) ON DELETE CASCADE,
  statut      text NOT NULL,
  motif       text,
  acteur      text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION droit_reponse_evenement_immuable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'droit de réponse : l''historique des décisions ne se réécrit pas (%)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS droit_reponse_evenement_no_update ON droit_reponse_evenement;
CREATE TRIGGER droit_reponse_evenement_no_update
  -- UPDATE interdit ; DELETE n'arrive que par cascade depuis la demande
  -- (effacement RGPD d'une demande), jamais par suppression isolée.
  BEFORE UPDATE ON droit_reponse_evenement
  FOR EACH ROW EXECUTE FUNCTION droit_reponse_evenement_immuable();

/**
 * La projection `statut` peut évoluer ; les faits de la demande, non.
 * Sans ce garde-fou, une correction pourrait transformer le texte publié
 * après coup et rendre l'historique des décisions incohérent.
 */
CREATE OR REPLACE FUNCTION droit_reponse_faits_immuables()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.organisation IS DISTINCT FROM OLD.organisation
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.motif IS DISTINCT FROM OLD.motif
     OR NEW.moyen_verification IS DISTINCT FROM OLD.moyen_verification
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'droit de réponse : les faits de la demande ne se réécrivent pas';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS droit_reponse_faits_immuables ON droit_reponse;
CREATE TRIGGER droit_reponse_faits_immuables
  BEFORE UPDATE ON droit_reponse
  FOR EACH ROW EXECUTE FUNCTION droit_reponse_faits_immuables();

CREATE INDEX IF NOT EXISTS droit_reponse_org_statut_idx ON droit_reponse (org_id, statut, created_at DESC);
CREATE INDEX IF NOT EXISTS droit_reponse_statut_idx ON droit_reponse (statut, created_at DESC);
CREATE INDEX IF NOT EXISTS droit_reponse_evenement_demande_idx ON droit_reponse_evenement (demande_id, created_at DESC);

COMMENT ON TABLE droit_reponse IS
  'Demandes de rectification d''une organisation nommée. Le statut est une projection ; l''historique et le journal font autorité.';
COMMENT ON COLUMN droit_reponse.moyen_verification IS
  'Ce qui a fait correspondre le nom déclaré à la fiche : nom exact, alias connu ou domaine officiel.';
