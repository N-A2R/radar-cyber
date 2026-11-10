-- 014 : TLP persistant sur les événements + portée des alertes
--
-- Deux corrections liées à l'audit du 2026-11-10 :
--   1. Le marquage TLP:RED d'un fait en quarantaine disparaissait à la promotion.
--      Il devient une colonne de `event`, et les faits déjà promus sont rattrapés.
--   2. Une alerte sans organisation n'est pas un incident d'organisation : les
--      127 avis CERT-FR génériques gonflaient le compteur. La colonne `scope`
--      distingue `organization_incident` de `regional_advisory`.

ALTER TABLE event ADD COLUMN IF NOT EXISTS tlp text NOT NULL DEFAULT 'CLEAR';
ALTER TABLE event ADD COLUMN IF NOT EXISTS tlp_source text;

ALTER TABLE alert ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'organization_incident';

-- Reprise : les événements issus d'une promotion héritent du TLP de leur fait source.
UPDATE event e
SET tlp = q.tlp,
    tlp_source = q.source
FROM quarantine_raw q
WHERE e.evidence ? 'quarantine_id'
  AND q.id = (e.evidence ->> 'quarantine_id')::int
  AND e.tlp = 'CLEAR';

-- Reprise : aucune organisation rattachée = avis régional, pas incident.
UPDATE alert SET scope = 'regional_advisory' WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS event_tlp_idx ON event (tlp) WHERE tlp <> 'CLEAR';
CREATE INDEX IF NOT EXISTS alert_scope_idx ON alert (scope);
CREATE INDEX IF NOT EXISTS event_org_idx ON event (org_id) WHERE org_id IS NOT NULL;
