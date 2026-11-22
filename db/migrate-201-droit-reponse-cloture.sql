-- 201 — Droit de réponse : instruction et clôture dans un délai mesuré.
--
-- Constat : une demande pouvait rester `recu` indéfiniment. L'organisation
-- nommée n'obtenait qu'un accusé de réception, sans instruction ni issue
-- tracée, alors que l'article 12.3 du RGPD impose un délai d'un mois.
--
-- Deux garde-fous, dont le premier ne dépend d'aucun ordonnanceur :
--
--   1. À l'insertion (trigger de contrainte différé au COMMIT), toute demande
--      reçoit au moins un événement dans `droit_reponse_evenement` ; si elle
--      est déjà plus vieille que le délai (import, reprise, fixture), elle est
--      clôturée dans la même transaction avec un fait de journal.
--   2. `instruire_droit_reponse()` ouvre à l'instruction les demandes restées
--      en réception, puis clôt celles qui dépassent le délai. L'API l'appelle
--      au démarrage et toutes les six heures.
--
-- Le délai est de 29 jours, pas 30 : le seuil opposable est de 30 jours, et
-- la marge d'un jour garantit qu'un tick manqué ne laisse jamais une demande
-- franchir le seuil sans être close. La fonction refuse d'ailleurs toute
-- valeur supérieure à 29.
--
-- Fichier rejouable (IF NOT EXISTS / OR REPLACE), aucune donnée personnelle
-- ajoutée, aucune réécriture des faits existants.

/** Délai de clôture, source unique côté base. */
CREATE OR REPLACE FUNCTION droit_reponse_delai()
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$ SELECT interval '29 days' $$;

COMMENT ON FUNCTION droit_reponse_delai() IS
  'Délai de clôture du droit de réponse : 29 jours, un jour sous le seuil RGPD de 30 jours.';

-- Le balayage ne lit que les demandes ouvertes : un index partiel garde le
-- tick quotidien à coût logarithmique, sans indexer l'historique clos.
CREATE INDEX IF NOT EXISTS droit_reponse_ouvertes_idx
  ON droit_reponse (created_at) WHERE closed_at IS NULL;

/**
 * Invariant d'insertion : une demande ne peut pas exister sans histoire.
 * Déclenché au COMMIT pour laisser l'application insérer son événement de
 * réception dans la même transaction sans doublon.
 */
CREATE OR REPLACE FUNCTION droit_reponse_evenement_garanti()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  d              droit_reponse;
  a_un_evenement boolean;
  delai          interval := droit_reponse_delai();
  motif_retard   constant text :=
    'Délai d''instruction d''un mois dépassé : demande close sans publication (silence gardé).';
BEGIN
  SELECT * INTO d FROM droit_reponse WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL; -- demande supprimée dans la même transaction
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM droit_reponse_evenement WHERE demande_id = d.id
  ) INTO a_un_evenement;

  -- Déjà en retard à l'insertion : clôture immédiate et tracée. C'est le
  -- chemin des imports et des reprises de données, pas du dépôt nominal.
  IF d.closed_at IS NULL AND d.created_at < now() - delai THEN
    IF NOT a_un_evenement THEN
      INSERT INTO droit_reponse_evenement (demande_id, statut, motif, acteur, payload, created_at)
      VALUES (d.id, 'recu',
              'Réception reconstituée : aucun événement n''accompagnait cette demande.',
              'moteur:delai-droit-reponse',
              jsonb_build_object('reconstitution', true, 'reference', d.reference),
              d.created_at);
    END IF;

    INSERT INTO droit_reponse_evenement (demande_id, statut, motif, acteur, payload)
    VALUES (d.id, 'refusee', motif_retard, 'moteur:delai-droit-reponse',
            jsonb_build_object('motifCloture', 'delai_depasse',
                               'delaiJours', 29,
                               'echeance', d.created_at + delai));

    INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
    VALUES ('droit_reponse.decision',
            'droit-reponse:' || d.reference,
            left('Demande ' || d.reference || ' : ' || d.statut ||
                 ' → refusee (délai d''instruction dépassé, silence gardé)', 500),
            jsonb_build_object('reference', d.reference, 'orgId', d.org_id,
                               'statutAvant', d.statut, 'decision', 'refusee',
                               'motifCloture', 'delai_depasse', 'delaiJours', 29,
                               'createdAt', d.created_at),
            'moteur:delai-droit-reponse', now());

    UPDATE droit_reponse
       SET statut = 'refusee', closed_at = now()
     WHERE id = d.id;

  ELSIF NOT a_un_evenement THEN
    INSERT INTO droit_reponse_evenement (demande_id, statut, motif, acteur, payload, created_at)
    VALUES (d.id,
            CASE WHEN d.closed_at IS NOT NULL THEN d.statut ELSE 'recu' END,
            'Événement reconstitué à l''insertion : la demande était sans historique.',
            'moteur:delai-droit-reponse',
            jsonb_build_object('reconstitution', true, 'reference', d.reference),
            d.created_at);

    INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
    VALUES ('droit_reponse.demande',
            'droit-reponse:' || d.reference,
            left('Demande ' || d.reference || ' : histoire reconstituée à l''insertion', 500),
            jsonb_build_object('reference', d.reference, 'orgId', d.org_id,
                               'reconstitution', true),
            'moteur:delai-droit-reponse', now());
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS droit_reponse_evenement_garanti ON droit_reponse;
CREATE CONSTRAINT TRIGGER droit_reponse_evenement_garanti
  AFTER INSERT ON droit_reponse
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION droit_reponse_evenement_garanti();

/**
 * Instruction et clôture des demandes en retard.
 *
 * p_delai_jours : âge de clôture, borné à [1, 29].
 * p_instruction_jours : âge auquel une demande encore `recu` passe à
 * `en_instruction` (dossier ouvert, sans décision substantive), borné à
 * [0, p_delai_jours].
 *
 * Renvoie les trois compteurs du passage, pour le journal applicatif et la
 * mesure. Rejouable : un second appel ne trouve plus rien à faire.
 */
CREATE OR REPLACE FUNCTION instruire_droit_reponse(
  p_delai_jours       integer DEFAULT 29,
  p_instruction_jours integer DEFAULT 1
)
RETURNS TABLE (reconstituees integer, instruites integer, closes integer)
LANGUAGE plpgsql
AS $$
DECLARE
  delai           interval;
  instruction     interval;
  r               droit_reponse;
  n_reconstituees integer := 0;
  n_instruites    integer := 0;
  n_closes        integer := 0;
  motif_retard    constant text :=
    'Délai d''instruction d''un mois dépassé : demande close sans publication (silence gardé).';
BEGIN
  -- Un seul balayage à la fois, même avec plusieurs instances d'API. Sans ce
  -- verrou, deux backfills concurrents pourraient doubler un événement.
  PERFORM pg_advisory_xact_lock(hashtext('droit_reponse.instruction')::bigint);

  p_delai_jours := LEAST(GREATEST(COALESCE(p_delai_jours, 29), 1), 29);
  p_instruction_jours := LEAST(GREATEST(COALESCE(p_instruction_jours, 1), 0), p_delai_jours);
  delai := (p_delai_jours || ' days')::interval;
  instruction := (p_instruction_jours || ' days')::interval;

  -- 1. Histoires manquantes : données antérieures au trigger ci-dessus.
  INSERT INTO droit_reponse_evenement (demande_id, statut, motif, acteur, payload, created_at)
  SELECT d.id,
         CASE WHEN d.closed_at IS NOT NULL THEN d.statut ELSE 'recu' END,
         'Événement reconstitué : la demande n''avait aucun historique.',
         'moteur:delai-droit-reponse',
         jsonb_build_object('reconstitution', true, 'reference', d.reference),
         d.created_at
    FROM droit_reponse d
   WHERE NOT EXISTS (SELECT 1 FROM droit_reponse_evenement e WHERE e.demande_id = d.id);
  GET DIAGNOSTICS n_reconstituees = ROW_COUNT;

  -- 2. Sortir de la simple réception : le dossier est ouvert à l'instruction.
  FOR r IN
    SELECT * FROM droit_reponse
     WHERE statut = 'recu'
       AND closed_at IS NULL
       AND created_at < now() - instruction
     ORDER BY created_at, id
       FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO droit_reponse_evenement (demande_id, statut, motif, acteur, payload)
    VALUES (r.id, 'en_instruction',
            'Instruction ouverte : la demande sort de la réception et doit être tranchée dans le délai d''un mois.',
            'moteur:delai-droit-reponse',
            jsonb_build_object('reference', r.reference, 'orgId', r.org_id,
                               'delaiJours', p_delai_jours));

    INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
    VALUES ('droit_reponse.decision',
            'droit-reponse:' || r.reference,
            left('Demande ' || r.reference || ' : recu → en_instruction (instruction ouverte)', 500),
            jsonb_build_object('reference', r.reference, 'orgId', r.org_id,
                               'statutAvant', r.statut, 'decision', 'en_instruction',
                               'delaiJours', p_delai_jours),
            'moteur:delai-droit-reponse', now());

    UPDATE droit_reponse
       SET statut = 'en_instruction'
     WHERE id = r.id;
    n_instruites := n_instruites + 1;
  END LOOP;

  -- 3. Clore ce qui a dépassé le délai, même en instruction.
  FOR r IN
    SELECT * FROM droit_reponse
     WHERE closed_at IS NULL
       AND created_at < now() - delai
     ORDER BY created_at, id
       FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO droit_reponse_evenement (demande_id, statut, motif, acteur, payload)
    VALUES (r.id, 'refusee', motif_retard, 'moteur:delai-droit-reponse',
            jsonb_build_object('motifCloture', 'delai_depasse',
                               'delaiJours', p_delai_jours,
                               'echeance', r.created_at + delai));

    INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
    VALUES ('droit_reponse.decision',
            'droit-reponse:' || r.reference,
            left('Demande ' || r.reference || ' : ' || r.statut ||
                 ' → refusee (délai d''instruction dépassé, silence gardé)', 500),
            jsonb_build_object('reference', r.reference, 'orgId', r.org_id,
                               'statutAvant', r.statut, 'decision', 'refusee',
                               'motifCloture', 'delai_depasse', 'delaiJours', p_delai_jours,
                               'createdAt', r.created_at),
            'moteur:delai-droit-reponse', now());

    UPDATE droit_reponse
       SET statut = 'refusee', closed_at = now()
     WHERE id = r.id;
    n_closes := n_closes + 1;
  END LOOP;

  RETURN QUERY SELECT n_reconstituees, n_instruites, n_closes;
END;
$$;

COMMENT ON FUNCTION instruire_droit_reponse(integer, integer) IS
  'Ouvre à l''instruction puis clôt les demandes de rectification en retard. Idempotente ; appelée par l''API toutes les 6 h.';

/** Mesure du délai : ce que l'objectif chiffré surveille, sans passer par l'API. */
CREATE OR REPLACE FUNCTION mesure_droit_reponse(p_delai_jours integer DEFAULT 29)
RETURNS TABLE (
  total              bigint,
  ouvertes           bigint,
  en_retard          bigint,
  closes             bigint,
  closes_sous_delai  bigint,
  delai_moyen_jours  numeric,
  delai_max_jours    numeric,
  sans_evenement     bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH param AS (
    SELECT (LEAST(GREATEST(COALESCE(p_delai_jours, 29), 1), 29) || ' days')::interval AS delai
  ), d AS (
    SELECT r.*,
           EXISTS (SELECT 1 FROM droit_reponse_evenement e WHERE e.demande_id = r.id) AS a_un_evenement
      FROM droit_reponse r
  )
  SELECT count(*),
         count(*) FILTER (WHERE d.closed_at IS NULL),
         count(*) FILTER (WHERE d.closed_at IS NULL AND d.created_at < now() - param.delai),
         count(*) FILTER (WHERE d.closed_at IS NOT NULL),
         count(*) FILTER (WHERE d.closed_at IS NOT NULL
                            AND d.closed_at <= d.created_at + interval '30 days'),
         round(avg(EXTRACT(EPOCH FROM (d.closed_at - d.created_at)) / 86400.0)
                 FILTER (WHERE d.closed_at IS NOT NULL), 2),
         round(max(EXTRACT(EPOCH FROM (d.closed_at - d.created_at)) / 86400.0)
                 FILTER (WHERE d.closed_at IS NOT NULL), 2),
         count(*) FILTER (WHERE NOT d.a_un_evenement)
    FROM d, param;
$$;

COMMENT ON FUNCTION mesure_droit_reponse(integer) IS
  'Compteurs et délais du droit de réponse : total, ouvertes, en retard (délai opérationnel), closes sous le seuil légal de 30 jours, moyenne et maximum en jours.';

-- Reprise immédiate : les demandes déjà en base ne doivent pas attendre le
-- premier tick de l'API. Sur une base neuve, le SELECT ne fait rien.
SELECT * FROM instruire_droit_reponse();
