-- 028 : archive longue — arrêter de jeter le passé.
--
-- Contexte : la rétention supprime les événements de plus de 90 jours, **au
-- démarrage du serveur**, en boucle par paquets de 10 000. Impossible de
-- répondre à une question portant sur douze mois, alors que c'est la question
-- du projet. Et le backup quotidien a une rotation de 14 jours : il photographie
-- la base après la purge.
--
-- Principe : on ne change pas la politique de rétention sur le brut — 90 jours
-- de texte intégral reste raisonnable. On arrête de jeter l'essentiel.
--
-- L'archive garde **le minimum qui permet de mesurer** :
--   * ce qui s'est passé et chez qui (dedup_key, organisation, famille, type) ;
--   * quand c'était vrai et quand on l'a su (deux horloges du journal) ;
--   * d'où ça venait (source) ;
--   * à quel point on y croyait (confiance, taux de rattachement).
--
-- Elle ne garde pas le texte : c'est le compromis qui rend l'archive légère
-- (quelques dizaines de Mo pour des années contre 58 Mo pour une base vide) et
-- qui respecte la règle « TLP:RED ne sort pas » — pas de corps de fuite archivé.

BEGIN;

-- `admission_rule` est ajoutée à la volée par `ensureCoverageSchema()` au premier
-- passage du collecteur. Une base neuve — base de test, déploiement — ne l'a donc
-- pas, et la vue ci-dessous échouerait. On la crée ici : idempotent, et ça
-- supprime une dépendance à l'ordre d'exécution du code.
ALTER TABLE event ADD COLUMN IF NOT EXISTS admission_rule text;

CREATE TABLE IF NOT EXISTS event_archive (
  id            bigserial PRIMARY KEY,
  -- Identité stable : c'est la clé de déduplication de l'événement d'origine.
  dedup_key     text NOT NULL,
  family        text NOT NULL,
  assertion_type text NOT NULL,
  -- Organisation au moment de la purge. Conserve l'état de rattachement tel
  -- qu'il était : il a pu changer depuis, le journal dit comment.
  org_id        integer,
  org_name      text,
  org_kind      text,
  dept          text,
  source_id     text NOT NULL,
  source_url    text,
  severity      smallint,
  confidence    text,
  admission_rule text,
  -- Deux horloges : validité dans le monde, connaissance par le système.
  observed_at   timestamptz,
  collected_at  timestamptz NOT NULL,
  archived_at   timestamptz NOT NULL DEFAULT now()
);

-- Une même ligne ne s'archive pas deux fois, même si la purge est rejouée.
CREATE UNIQUE INDEX IF NOT EXISTS event_archive_dedup_idx ON event_archive (dedup_key);

-- Les trois questions qu'on posera : par organisation, par département, par date.
CREATE INDEX IF NOT EXISTS event_archive_org_idx  ON event_archive (org_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS event_archive_time_idx ON event_archive (observed_at DESC);
CREATE INDEX IF NOT EXISTS event_archive_dept_idx ON event_archive (dept, observed_at DESC);
CREATE INDEX IF NOT EXISTS event_archive_family_idx ON event_archive (family, observed_at DESC);

COMMENT ON TABLE event_archive IS
  'Mémoire longue : événements purgés du brut, réduits à ce qui permet de mesurer et d''auditer. Jamais purgée.';

-- L'archive est alimentée avant suppression. Le trigger n'est pas utilisé ici :
-- la purge est explicite, et un trigger sur DELETE aurait rendu la suppression
-- plus lente qu'elle ne le sera jamais en deux requêtes.

-- Vue de lecture : le fil unifié, brut + archive, sans que l'appelant ait à
-- connaître la distinction. C'est ce que consommera la mesure de couverture.
CREATE OR REPLACE VIEW v_event_all AS
  SELECT id, dedup_key, family, assertion_type, org_id, source_id,
         observed_at, collected_at, severity, confidence, admission_rule,
         'brut'::text AS origine
    FROM event
  UNION ALL
  SELECT id, dedup_key, family, assertion_type, org_id, source_id,
         observed_at, collected_at, severity, confidence, admission_rule,
         'archive'::text AS origine
    FROM event_archive;

COMMENT ON VIEW v_event_all IS
  'Fil unifié brut + archive. La mesure de couverture lit ici, jamais `event` seule.';

COMMIT;
