-- 241 — DB-M9 : index de clé étrangère en position de tête, au cas par cas.
--
-- Le relevé catalogique de l'audit (`pg_constraint` + `pg_index.indkey[0]`)
-- confirme 18 tables dont une FK n'est la première colonne d'aucun index :
--   app_session(user_id), attachment_confidence(org_id),
--   collector_run(source_id), dns_change(current_snapshot_id),
--   droit_reponse(demandeur_user_id), event(asset_id, source_id),
--   exposition_service_detection(org_id), leak_link_eval(claim_id, event_id),
--   onion_lead(confirmed_event_id, mention_event_id, source_id),
--   prestataire_qualifie(extrait_id), retrieval_hit(event_id),
--   retrieval_query(expected_event_id, query_event_id),
--   second_victim_pair(second_event_key), second_victim_prediction(first_event_key),
--   source_live_item(event_id), stix_object(pap), watchlist_item(org_id),
--   watchlist_match(item_id).
--
-- Une seule est indexée ici : collector_run(source_id). C'est la seule table
-- du relevé à la fois volumineuse (~10,3 M tuples lus en 1 195 seq scans,
-- contre 871 idx scans dans pg_stat_user_tables) et parcourue par une requête
-- métier fréquente (historique des runs d'une source, supervision).
-- `(source_id, started_at DESC)` sert à la fois le leading FK et le tri
-- « derniers runs » ; aucune index partiel ou en position 2 n'existe sur cette
-- colonne (catalogue + db/init.sql), donc pas de doublon.
--
-- Les 17 autres candidats sont rejetés et documentés dans
-- docs/database-residual.md : tables de benchmark/évaluation, faible
-- cardinalité, cascades rares, ou coût démesuré sur `event` (11,8 M lignes).
-- Le garde-fou catalogique évite de recréer un index équivalent ajouté entre
-- l'audit et l'application de cette migration.
--
-- Rejouable : le DO block vérifie l'absence d'index ordinaires dont la
-- première colonne est déjà `source_id`.

BEGIN;

DO $$
DECLARE
  v_attnum smallint;
BEGIN
  SELECT a.attnum INTO v_attnum
    FROM pg_attribute a
   WHERE a.attrelid = 'public.collector_run'::regclass
     AND a.attname = 'source_id'
     AND NOT a.attisdropped;

  IF v_attnum IS NULL THEN
    RAISE EXCEPTION 'collector_run.source_id absent : migration 241 impossible';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
     WHERE i.indrelid = 'public.collector_run'::regclass
       AND i.indkey[0] = v_attnum
       AND i.indpred IS NULL
  ) THEN
    EXECUTE $ddl$
      CREATE INDEX collector_run_source_started_idx
        ON public.collector_run (source_id, started_at DESC)
    $ddl$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.collector_run_source_started_idx') IS NOT NULL THEN
    EXECUTE 'COMMENT ON INDEX public.collector_run_source_started_idx IS '
            || '''DB-M9 : leading FK collector_run.source_id + runs récents par source (seq scans mesurés).''';
  END IF;
END
$$;
COMMIT;
