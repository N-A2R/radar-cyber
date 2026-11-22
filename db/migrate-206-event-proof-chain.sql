-- 206 : chaîne de preuve obligatoire sur `event`.
--
-- Chaque événement doit citer :
--   1. l'URL de la provenance qui l'établit (`event.source_url`), et
--   2. le run de collecte qui l'a produit (`event.evidence->>'run_id'`), run
--      qui doit exister dans `collector_run`.
--
-- Un CHECK PostgreSQL ne peut pas interroger une autre table. La présence des
-- deux éléments est donc portée par deux CHECK (visibles dans `pg_constraint`),
-- et la *résolution* du run par un trigger `BEFORE INSERT OR UPDATE OF evidence`.
-- Un second trigger refuse de supprimer un run encore cité : la preuve ne peut
-- pas disparaître sous l'événement qui s'en réclame.

BEGIN;

-- 1) Nature du run. `live` par défaut pour ne pas réécrire les historiques ;
--    les chemins qui n'ont pas de collecte (promotion analyste, ingest HTTP,
--    rejeu, backfill de cette migration) l'explicitent.
ALTER TABLE collector_run ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'live';
COMMENT ON COLUMN collector_run.kind IS
  'live | scan | ingest | analyst | import | replay | backfill — nature du run cité par les événements';

-- 2) Provenance des lignes antérieures. On préfère une URL portée par la preuve
--    (item), sinon l'URL du flux (`source.url`), qui existe toujours. Aucune
--    URL inventée, aucun champ secret recopié : `source.url` est déjà public
--    dans le catalogue.
UPDATE event e
   SET source_url = COALESCE(
         NULLIF(btrim(e.evidence->>'url'), ''),
         NULLIF(btrim(e.evidence->>'link'), ''),
         NULLIF(btrim(e.evidence->>'sourceUrl'), ''),
         NULLIF(btrim(e.evidence->>'url_bodacc'), ''),
         NULLIF(btrim(e.source_url), ''),
         (SELECT NULLIF(btrim(s.url), '') FROM source s WHERE s.id = e.source_id))
 WHERE e.source_url IS NULL OR btrim(e.source_url) = '';

-- 3) run_id des lignes antérieures : un run `backfill` par source qui en a
--    besoin. Il ne prétend pas avoir collecté ces événements — son `kind` dit
--    qu'il date la reconstruction de la preuve, pas la collecte.
INSERT INTO collector_run (source_id, started_at, finished_at, status, items_in, items_new, kind)
SELECT e.source_id,
       min(COALESCE(e.at, e.collected_at)),
       max(COALESCE(e.at, e.collected_at)),
       'ok', count(*), 0, 'backfill'
  FROM event e
 WHERE (e.evidence->>'run_id') IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM collector_run cr
      WHERE cr.source_id = e.source_id AND cr.kind = 'backfill')
 GROUP BY e.source_id;

UPDATE event e
   SET evidence = e.evidence || jsonb_build_object('run_id', cr.id::text)
  FROM collector_run cr
 WHERE cr.source_id = e.source_id
   AND cr.kind = 'backfill'
   AND (e.evidence->>'run_id') IS NULL;

-- 4) Présence : deux CHECK déclaratifs, visibles et validés.
ALTER TABLE event DROP CONSTRAINT IF EXISTS event_source_url_required;
ALTER TABLE event ADD CONSTRAINT event_source_url_required
  CHECK (source_url IS NOT NULL AND btrim(source_url) <> '') NOT VALID;

ALTER TABLE event DROP CONSTRAINT IF EXISTS event_run_id_required;
ALTER TABLE event ADD CONSTRAINT event_run_id_required
  CHECK (jsonb_typeof(evidence) = 'object'
         AND COALESCE(evidence->>'run_id', '') ~ '^[0-9]{1,18}$') NOT VALID;

COMMENT ON CONSTRAINT event_source_url_required ON event IS
  'Chaîne de preuve (206) : tout événement cite l''URL qui l''établit.';
COMMENT ON CONSTRAINT event_run_id_required ON event IS
  'Chaîne de preuve (206) : evidence.run_id présent. La résolution du run dans collector_run est garantie par le trigger event_proof_chain — un CHECK ne peut pas interroger une autre table.';

-- Index de l'expression citée : sert au garde de suppression des runs, et aux
-- audits « qui cite ce run ».
CREATE INDEX IF NOT EXISTS event_evidence_run_idx ON event ((evidence->>'run_id'));

-- 5) Résolution du run : ce que CHECK ne sait pas faire.
CREATE OR REPLACE FUNCTION event_require_proof() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rid_text text := NEW.evidence->>'run_id';
  rid bigint;
BEGIN
  IF rid_text IS NULL OR rid_text !~ '^[0-9]{1,18}$' THEN
    RAISE EXCEPTION 'event % : evidence.run_id absent ou invalide (%), la preuve doit citer un collector_run',
      NEW.dedup_key, COALESCE(rid_text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;
  rid := rid_text::bigint;
  IF NOT EXISTS (SELECT 1 FROM collector_run cr WHERE cr.id = rid) THEN
    RAISE EXCEPTION 'event % : run_id % absent de collector_run, chaîne de preuve rompue',
      NEW.dedup_key, rid
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION event_require_proof() IS
  'Résolution de evidence->>''run_id'' dans collector_run, que les CHECK ne peuvent pas exprimer.';

DROP TRIGGER IF EXISTS event_proof_chain ON event;
CREATE TRIGGER event_proof_chain
  BEFORE INSERT OR UPDATE OF evidence ON event
  FOR EACH ROW EXECUTE FUNCTION event_require_proof();

-- 6) Un run cité ne s'efface pas : la rétention purge les runs non cités
--    (voir maintenance/retention.ts), et cette garde arrête toute suppression
--    directe qui romprait la chaîne.
CREATE OR REPLACE FUNCTION collector_run_guard_cited() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM event e WHERE e.evidence->>'run_id' = OLD.id::text) THEN
    RAISE EXCEPTION 'collector_run % encore cité par un événement : la preuve reste attachée', OLD.id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS collector_run_cited_guard ON collector_run;
CREATE TRIGGER collector_run_cited_guard
  BEFORE DELETE ON collector_run
  FOR EACH ROW EXECUTE FUNCTION collector_run_guard_cited();

-- 7) Les lignes existantes sont désormais complètes : on valide, pas seulement
--    « NOT VALID ». Une base où ceci échoue n'a pas de chaîne de preuve
--    complète et la migration doit le dire.
ALTER TABLE event VALIDATE CONSTRAINT event_source_url_required;
ALTER TABLE event VALIDATE CONSTRAINT event_run_id_required;

COMMIT;
