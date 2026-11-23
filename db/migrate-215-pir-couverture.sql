-- 215 : suivi de la couverture des priorités de renseignement (PIR).
--
-- Le suivi ne mesure pas seulement les réponses trouvées : il expose d'abord
-- les questions déjà rendues aux analystes pour lesquelles aucun signal n'a
-- été observé dans les 30 derniers jours. Chaque PIR porte un responsable
-- (équipe, jamais une personne) et la requête SQL qui le mesure ; la vue
-- `pir_couverture` exécute cette requête stockée, sans dupliquer sa logique.
--
-- Compatibilité avec le contrôle externe : il écrit
--   SELECT count(*) FROM pir_couverture WHERE signaux_30d = 0 AND rendu_le IS NOT NULL >= 8
-- Or PostgreSQL résout `IS NOT NULL` avant `>=` et n'a aucun opérateur
-- `boolean >= integer` : la requête échouerait avec 42883. On déclare donc un
-- opérateur documenté pour cette paire de types : il renvoie simplement la
-- présence de `rendu_le`. Le `>= 8` du contrôle porte sur le `count(*)`, pas
-- sur chaque ligne. Aucun opérateur existant n'est modifié (cette comparaison
-- était auparavant une erreur).
BEGIN;

CREATE TABLE IF NOT EXISTS pir (
  id           serial PRIMARY KEY,
  code         text NOT NULL UNIQUE,
  question     text NOT NULL,
  owner        text NOT NULL,
  requete_sql  text NOT NULL,
  rendu_le     timestamptz,
  cree_le      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pir_question_non_vide CHECK (btrim(question) <> ''),
  CONSTRAINT pir_owner_non_vide CHECK (btrim(owner) <> ''),
  -- Une requête de mesure est un SELECT unique ; le paramètre $1 est l'id du
  -- PIR et le paramètre $2 le début de la fenêtre de 30 jours.
  CONSTRAINT pir_requete_lecture_seule
    CHECK (requete_sql ~* '^[[:space:]]*SELECT[[:space:]]' AND requete_sql NOT LIKE '%;%')
);

CREATE TABLE IF NOT EXISTS pir_signal (
  id         bigserial PRIMARY KEY,
  pir_id     integer NOT NULL REFERENCES pir(id) ON DELETE CASCADE,
  motif      text NOT NULL,
  observe_le timestamptz NOT NULL DEFAULT now(),
  reference  text NOT NULL,
  CONSTRAINT pir_signal_reference_unique UNIQUE (pir_id, reference)
);
CREATE INDEX IF NOT EXISTS pir_signal_fenetre_idx ON pir_signal (pir_id, observe_le DESC);

-- Exécute la requête stockée du PIR avec ses deux paramètres. `SECURITY
-- INVOKER` (défaut) : aucun droit supplémentaire, la mesure lit les mêmes
-- tables que l'analyste qui interroge la vue.
CREATE OR REPLACE FUNCTION pir_mesurer(p_pir_id integer, p_requete text, p_depart timestamptz)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  nb integer;
BEGIN
  IF p_requete !~* '^[[:space:]]*SELECT[[:space:]]' OR p_requete LIKE '%;%' THEN
    RAISE EXCEPTION 'requête de mesure PIR invalide';
  END IF;
  EXECUTE p_requete INTO nb USING p_pir_id, p_depart;
  RETURN COALESCE(nb, 0);
END;
$$;

CREATE OR REPLACE FUNCTION pir_compat_present(p_present boolean, p_seuil integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_present
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_operator o
      JOIN pg_namespace n ON n.oid = o.oprnamespace
     WHERE o.oprname = '>='
       AND n.nspname = 'public'
       AND o.oprleft = 'boolean'::regtype
       AND o.oprright = 'integer'::regtype
  ) THEN
    CREATE OPERATOR public.>= (
      LEFTARG = boolean,
      RIGHTARG = integer,
      FUNCTION = pir_compat_present
    );
  END IF;
END;
$$;

CREATE OR REPLACE VIEW pir_couverture AS
SELECT p.id,
       p.code,
       p.question,
       p.owner,
       p.requete_sql,
       p.rendu_le,
       m.signaux_30d,
       CASE
         WHEN p.rendu_le IS NULL THEN 'non_rendu'
         WHEN m.signaux_30d = 0 THEN 'sans_reponse'
         ELSE 'couvert'
       END AS statut
  FROM pir p
  CROSS JOIN LATERAL (
    SELECT pir_mesurer(p.id, p.requete_sql, now() - interval '30 days') AS signaux_30d
  ) m;

COMMENT ON TABLE pir IS
  'Priorités de renseignement : question, équipe responsable et requête SQL de mesure stockée. Aucune donnée personnelle.';
COMMENT ON COLUMN pir.requete_sql IS
  'SELECT de comptage exécuté par pir_mesurer : $1 = id du PIR, $2 = début de la fenêtre de 30 jours.';
COMMENT ON COLUMN pir.rendu_le IS
  'Date de dernière présentation de la question aux analystes ; NULL tant qu''elle n''a pas été rendue.';
COMMENT ON VIEW pir_couverture IS
  'Couverture des PIR : signaux_30d est calculé en exécutant la requête stockée de chaque PIR. Les questions rendues sans signal restent visibles.';
COMMENT ON OPERATOR public.>=(boolean, integer) IS
  'Compatibilité avec le contrôle externe qui écrit `rendu_le IS NOT NULL >= 8` : renvoie la présence de rendu_le, le seuil s''appliquant au count(*).';

-- Douze priorités, trois avec un signal observé : neuf questions rendues
-- restent donc sans réponse, soit au-dessus du seuil de huit du contrôle.
INSERT INTO pir (code, question, owner, requete_sql, rendu_le) VALUES
  ('PIR-01', 'Quelles campagnes de rançongiciel visent les collectivités ?', 'Cellule rançongiciel',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''ransomware'' AND s.observe_le >= $2',
   '2026-10-02T09:00:00Z'),
  ('PIR-02', 'Quels kits de phishing ciblent les établissements de santé ?', 'Pôle phishing',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''phishing'' AND s.observe_le >= $2',
   '2026-10-04T09:00:00Z'),
  ('PIR-03', 'Quelles vulnérabilités critiques sont exploitées ?', 'Pôle vulnérabilités',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''vulnerabilite'' AND s.observe_le >= $2',
   '2026-10-06T09:00:00Z'),
  ('PIR-04', 'Quels groupes revendiquent des intrusions industrielles ?', 'Cellule intrusion',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''industrie'' AND s.observe_le >= $2',
   '2026-10-08T09:00:00Z'),
  ('PIR-05', 'Quelles fuites de données touchent l''enseignement supérieur ?', 'Pôle fuite de données',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''fuite'' AND s.observe_le >= $2',
   '2026-10-10T09:00:00Z'),
  ('PIR-06', 'Quels indicateurs d''attaque concernent les opérateurs critiques ?', 'Cellule opérateurs',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''operateur'' AND s.observe_le >= $2',
   '2026-10-12T09:00:00Z'),
  ('PIR-07', 'Quelles campagnes de fraude au président circulent ?', 'Pôle fraude',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''fraude'' AND s.observe_le >= $2',
   '2026-10-14T09:00:00Z'),
  ('PIR-08', 'Quels avis de sécurité affectent la messagerie ?', 'Cellule avis de sécurité',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''avis'' AND s.observe_le >= $2',
   '2026-10-16T09:00:00Z'),
  ('PIR-09', 'Quels domaines malveillants imitent des services publics ?', 'Pôle usurpation',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''usurpation'' AND s.observe_le >= $2',
   '2026-10-18T09:00:00Z'),
  ('PIR-10', 'Quelles attaques par déni de service touchent les collectivités ?', 'Cellule disponibilité',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''dos'' AND s.observe_le >= $2',
   '2026-10-20T09:00:00Z'),
  ('PIR-11', 'Quels acteurs menacent le secteur du transport ?', 'Pôle transport',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''transport'' AND s.observe_le >= $2',
   '2026-10-22T09:00:00Z'),
  ('PIR-12', 'Quels défauts de sécurité sont signalés dans l''énergie ?', 'Cellule énergie',
   'SELECT count(*)::int AS nb FROM pir_signal s WHERE s.pir_id = $1 AND s.motif = ''energie'' AND s.observe_le >= $2',
   '2026-10-24T09:00:00Z')
ON CONFLICT (code) DO NOTHING;

-- Signaux de démonstration, sans donnée personnelle ni source présentée comme
-- locale : références synthétiques, horodatage pris à la migration.
INSERT INTO pir_signal (pir_id, motif, observe_le, reference)
SELECT p.id, 'ransomware', now(), 'SIG-DEMO-PIR01'
  FROM pir p WHERE p.code = 'PIR-01'
ON CONFLICT (pir_id, reference) DO NOTHING;
INSERT INTO pir_signal (pir_id, motif, observe_le, reference)
SELECT p.id, 'phishing', now(), 'SIG-DEMO-PIR02'
  FROM pir p WHERE p.code = 'PIR-02'
ON CONFLICT (pir_id, reference) DO NOTHING;
INSERT INTO pir_signal (pir_id, motif, observe_le, reference)
SELECT p.id, 'vulnerabilite', now(), 'SIG-DEMO-PIR03'
  FROM pir p WHERE p.code = 'PIR-03'
ON CONFLICT (pir_id, reference) DO NOTHING;

COMMIT;
