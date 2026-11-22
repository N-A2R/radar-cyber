-- 064 : alerte victime immédiate en Nouvelle-Aquitaine.
--
-- L'alerte est créée dans la même transaction que l'événement : aucun cycle
-- de détection, aucun réseau, aucun service payant. Les sources grises sont
-- acceptées ; seules les organisations de Nouvelle-Aquitaine sont éligibles.
-- La charge utile ne contient ni titre, résumé, identité de victime, adresse
-- e-mail, ni corps brut : uniquement des identifiants et des horodatages.

CREATE OR REPLACE FUNCTION emit_victim_alert(p_event_id bigint, p_mode text DEFAULT 'realtime')
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_event event%ROWTYPE;
  v_dept text;
  v_kind text;
  v_inserted integer;
BEGIN
  SELECT * INTO v_event FROM event WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_event.assertion_type IS DISTINCT FROM 'third_party_claim' THEN RETURN false; END IF;
  IF v_event.family NOT IN ('ransomware', 'leaks') THEN RETURN false; END IF;
  IF v_event.org_id IS NULL THEN RETURN false; END IF;

  SELECT o.dept, o.kind INTO v_dept, v_kind FROM org o WHERE o.id = v_event.org_id;
  IF v_dept IS NULL OR NOT (v_dept = ANY (ARRAY['16','17','19','23','24','33','40','47','64','79','86','87'])) THEN RETURN false; END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('entreprise','association','sante','enseignement','collectivite','autre') THEN RETURN false; END IF;

  INSERT INTO alert (rule_id, title, severity, event_id, org_id, evidence, scope)
  VALUES (
    'victim-na',
    'Victim claim in Nouvelle-Aquitaine',
    5,
    v_event.id,
    v_event.org_id,
    jsonb_build_object(
      'mode', p_mode,
      'event_id', v_event.id,
      'org_id', v_event.org_id,
      'dept', v_dept,
      'source_id', v_event.source_id,
      'published_at', COALESCE(v_event.observed_at, v_event.collected_at),
      'ingested_at', v_event.collected_at
    ),
    'organization_incident'
  )
  ON CONFLICT (rule_id, event_id) WHERE event_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$$;

CREATE OR REPLACE FUNCTION victim_alert_event_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM emit_victim_alert(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS victim_alert_on_event ON event;
CREATE TRIGGER victim_alert_on_event
  AFTER INSERT ON event
  FOR EACH ROW EXECUTE FUNCTION victim_alert_event_trigger();

CREATE INDEX IF NOT EXISTS idx_event_victim_claim
  ON event (org_id, collected_at DESC)
  WHERE assertion_type = 'third_party_claim' AND family IN ('ransomware', 'leaks');
