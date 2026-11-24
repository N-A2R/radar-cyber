-- 216 — Registre des violations de données personnelles suspectées.
--
-- Une ligne par violation suspectée, identifiée par son origine publique
-- (fait `event` ou fuite `fuite_org`) : date de prise de connaissance, horloge
-- des 72 heures, statut et date de notification. Les quatre champs du contrôle
-- externe sont NOT NULL par construction : l'échéance est calculée par un
-- trigger, le statut a une valeur par défaut, et un trigger horodate la
-- notification dès le passage au statut `notifiee`.
--
-- Aucune donnée personnelle : ni titre, résumé, victime, courriel, IP ni corps
-- brut. Seuls des identifiants publics, un type d'organisation, un département
-- d'organisation et des dates sont conservés. Le département décrit
-- l'organisation, jamais la portée d'une source : une source nationale n'est
-- pas présentée comme locale.
BEGIN;

CREATE TABLE IF NOT EXISTS violation_rgpd (
  id                     bigserial PRIMARY KEY,
  reference              text NOT NULL UNIQUE,
  origine                text NOT NULL DEFAULT 'event' CHECK (origine IN ('event', 'fuite')),
  origine_id             text NOT NULL,
  org_id                 integer REFERENCES org(id) ON DELETE SET NULL,
  org_kind               text NOT NULL DEFAULT 'inconnu',
  dept                   text,
  famille                text NOT NULL DEFAULT 'autre',
  source_id              text,
  source_url             text,
  date_prise_connaissance timestamptz NOT NULL,
  echeance_72h           timestamptz NOT NULL,
  statut                 text NOT NULL DEFAULT 'suspectee' CHECK (statut IN ('suspectee', 'notifiee', 'close')),
  date_notification      timestamptz,
  notifie_a              text,
  cree_le                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT violation_rgpd_notification_requise
    CHECK (statut <> 'notifiee' OR date_notification IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS violation_rgpd_prise_connaissance_idx
  ON violation_rgpd (date_prise_connaissance DESC);
CREATE INDEX IF NOT EXISTS violation_rgpd_org_idx
  ON violation_rgpd (org_id, date_prise_connaissance DESC);

-- L'horloge n'est jamais une donnée saisie : toute écriture de l'échéance est
-- remplacée par prise de connaissance + 72 heures (le lendemain n'est pas une
-- approximation : l'échéance est un instant, pas une date calendaire).
CREATE OR REPLACE FUNCTION violation_rgpd_00_horloge_72h()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.echeance_72h := NEW.date_prise_connaissance + interval '72 hours';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS violation_rgpd_00_horloge_72h ON violation_rgpd;
CREATE TRIGGER violation_rgpd_00_horloge_72h
  BEFORE INSERT OR UPDATE OF date_prise_connaissance, echeance_72h ON violation_rgpd
  FOR EACH ROW EXECUTE FUNCTION violation_rgpd_00_horloge_72h();

-- Le passage à `notifiee` porte sa propre preuve : l'horodatage ne peut pas
-- être omis ni différé par le client qui change le statut.
CREATE OR REPLACE FUNCTION violation_rgpd_01_notification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.statut = 'notifiee' AND NEW.date_notification IS NULL
     AND (TG_OP = 'INSERT' OR OLD.statut IS DISTINCT FROM 'notifiee') THEN
    NEW.date_notification := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS violation_rgpd_01_notification ON violation_rgpd;
CREATE TRIGGER violation_rgpd_01_notification
  BEFORE INSERT OR UPDATE OF statut, date_notification ON violation_rgpd
  FOR EACH ROW EXECUTE FUNCTION violation_rgpd_01_notification();

-- Une violation suspectée est inscrite dès qu'un fait public avec une
-- organisation qualifiée est admis. Les faits purement techniques ou sans
-- organisation ne sont pas des violations. Le trigger couvre aussi la
-- qualification ultérieure d'un fait (`org_id`, `family`).
CREATE OR REPLACE FUNCTION violation_rgpd_depuis_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_org org%ROWTYPE;
BEGIN
  IF NEW.org_id IS NULL
     OR NEW.family NOT IN ('leaks', 'phishing', 'ransomware', 'fuite', 'donnees') THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_org FROM org WHERE id = NEW.org_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO violation_rgpd
    (reference, origine, origine_id, org_id, org_kind, dept, famille,
     source_id, source_url, date_prise_connaissance)
  VALUES
    ('event:' || NEW.id::text, 'event', NEW.id::text, NEW.org_id, v_org.kind, v_org.dept,
     NEW.family, NEW.source_id, NEW.source_url,
     COALESCE(NEW.observed_at, NEW.at, NEW.valid_at, NEW.collected_at, NEW.created_at, now()))
  ON CONFLICT (reference) DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS violation_rgpd_event ON event;
CREATE TRIGGER violation_rgpd_event
  AFTER INSERT OR UPDATE OF org_id, family ON event
  FOR EACH ROW EXECUTE FUNCTION violation_rgpd_depuis_event();

-- Une fuite publique rattachée à une organisation est également une violation
-- suspectée. La date retenue est celle de la fuite, pas la date de collecte.
CREATE OR REPLACE FUNCTION violation_rgpd_depuis_fuite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_fuite fuite_reference%ROWTYPE;
  v_org   org%ROWTYPE;
BEGIN
  SELECT * INTO v_fuite FROM fuite_reference WHERE id = NEW.fuite_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_org FROM org WHERE id = NEW.org_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO violation_rgpd
    (reference, origine, origine_id, org_id, org_kind, dept, famille,
     source_id, source_url, date_prise_connaissance)
  VALUES
    ('fuite:' || NEW.fuite_id || ':' || NEW.org_id::text, 'fuite', NEW.fuite_id,
     NEW.org_id, v_org.kind, v_org.dept, 'fuite', v_fuite.source, v_fuite.source_url,
     COALESCE(v_fuite.breach_date::timestamptz, v_fuite.collected_at))
  ON CONFLICT (reference) DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS violation_rgpd_fuite ON fuite_org;
CREATE TRIGGER violation_rgpd_fuite
  AFTER INSERT OR UPDATE OF fuite_id, org_id ON fuite_org
  FOR EACH ROW EXECUTE FUNCTION violation_rgpd_depuis_fuite();

-- Amorçage : les violations déjà admises avant cette migration entrent dans
-- le registre avec leur date d'observation. Rejouable sans doublon.
INSERT INTO violation_rgpd
  (reference, origine, origine_id, org_id, org_kind, dept, famille,
   source_id, source_url, date_prise_connaissance)
SELECT 'event:' || e.id::text, 'event', e.id::text, e.org_id, o.kind, o.dept, e.family,
       e.source_id, e.source_url,
       COALESCE(e.observed_at, e.at, e.valid_at, e.collected_at, e.created_at, now())
  FROM event e
  JOIN org o ON o.id = e.org_id
 WHERE e.org_id IS NOT NULL
   AND e.family IN ('leaks', 'phishing', 'ransomware', 'fuite', 'donnees')
ON CONFLICT (reference) DO NOTHING;

INSERT INTO violation_rgpd
  (reference, origine, origine_id, org_id, org_kind, dept, famille,
   source_id, source_url, date_prise_connaissance)
SELECT 'fuite:' || fo.fuite_id || ':' || fo.org_id::text, 'fuite', fo.fuite_id,
       fo.org_id, o.kind, o.dept, 'fuite', fr.source, fr.source_url,
       COALESCE(fr.breach_date::timestamptz, fr.collected_at)
  FROM fuite_org fo
  JOIN fuite_reference fr ON fr.id = fo.fuite_id
  JOIN org o ON o.id = fo.org_id
ON CONFLICT (reference) DO NOTHING;

-- Chronologie opposable : trois jalons datés par violation, dans l'ordre.
CREATE OR REPLACE VIEW violation_rgpd_chronologie AS
SELECT * FROM (
  SELECT id AS violation_id, reference, 1 AS ordre, 'prise_de_connaissance' AS etape,
         date_prise_connaissance AS survenu_le, source_id, origine_id
    FROM violation_rgpd
  UNION ALL
  SELECT id, reference, 2, 'echeance_72h', echeance_72h, source_id, origine_id
    FROM violation_rgpd
  UNION ALL
  SELECT id, reference, 3, 'notification_cnil', date_notification, source_id, origine_id
    FROM violation_rgpd
   WHERE date_notification IS NOT NULL
) AS jalons
ORDER BY violation_id, ordre;

COMMENT ON TABLE violation_rgpd IS
  'Registre opposable des violations de données personnelles suspectées : une ligne par fait public qualifié, avec horloge des 72 heures et notification. Métadonnées publiques uniquement.';
COMMENT ON COLUMN violation_rgpd.reference IS
  'Clé stable d''opposabilité : event:<id> pour un fait, fuite:<id>:<org_id> pour une fuite publique rattachée.';
COMMENT ON COLUMN violation_rgpd.date_prise_connaissance IS
  'Instant de prise de connaissance : date d''observation du fait, sinon date de la fuite, sinon date de collecte.';
COMMENT ON COLUMN violation_rgpd.echeance_72h IS
  'Échéance de notification (prise de connaissance + 72 heures), calculée par trigger et non saisissable.';
COMMENT ON COLUMN violation_rgpd.statut IS
  'suspectee, notifiee ou close ; le passage à notifiee horodate date_notification par trigger.';
COMMENT ON COLUMN violation_rgpd.dept IS
  'Département de l''organisation concernée, jamais la portée géographique de la source.';
COMMENT ON VIEW violation_rgpd_chronologie IS
  'Jalons ordonnés de chaque violation : prise de connaissance, échéance des 72 heures, notification CNIL si elle a eu lieu.';

COMMIT;
