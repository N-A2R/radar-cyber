-- 216 : rattacher les revendications de fuite aux incidents déjà collectés.
--
-- Une revendication (`leak_claim`) et un incident confirmé (`event` avec
-- assertion_type='confirmed_incident') sont deux faits distincts. Les compter
-- séparément gonfle le volume d'incidents. Ce lien est donc une *déduction*,
-- jamais une écriture dans l'événement : la revendication garde son identité,
-- `confirmed_event_id` désigne l'incident déjà admis qui la couvre.
--
-- Règle `victim-group-date@1` (volontairement conservatrice) :
--   1. le nom normalisé de la victime apparaît dans le titre de l'événement
--      (ou dans `evidence->>'organisation'`) ;
--   2. le groupe est identique quand les deux côtés en portent un ;
--   3. l'incident précède la revendication de 0 à 30 jours ;
--   4. un seul candidat est autorisé (sinon le lien reste NULL).
--
-- `leak_link_eval` est un jeu d'or de 100 cas na=false, construit dans cette
-- migration comme le sont `dedup_pair`/`dedup_eval` (205) : 75 paires
-- positives et 25 négatifs (autre organisation, autre groupe, incident trop
-- ancien, incident postérieur). Les événements du jeu d'or portent
-- `dedup_key = bench:leak-link:*` et une URL `.invalid` : ce sont des
-- incidents de mesure, pas des incidents réels attribués à des organismes
-- publics. Aucune donnée personnelle, aucune source présentée comme locale.
--
-- Critère (la mesure est une lecture, pas un calcul au moment du rapport) :
--   SELECT count(*) FILTER (WHERE matched)::float/count(*) FROM leak_link_eval;

BEGIN;

-- 1) Normalisation et prédicat, partagés entre la production et le jeu d'or.
CREATE OR REPLACE FUNCTION public.leak_link_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT btrim(regexp_replace(
    translate(replace(replace(lower(coalesce(t, '')), 'œ', 'oe'), 'æ', 'ae'),
             'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ', 'aaaaaaceeeeiiiinoooooouuuuyy'),
    '[^a-z0-9]+', ' ', 'g'));
$fn$;

CREATE OR REPLACE FUNCTION public.leak_link_match(
  p_victim      text,
  p_group       text,
  p_published   timestamptz,
  p_event_title text,
  p_event_group text,
  p_event_date  timestamptz
) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  WITH v AS (SELECT public.leak_link_norm(p_victim) AS n),
       e AS (SELECT public.leak_link_norm(p_event_title) AS n),
       gv AS (SELECT public.leak_link_norm(p_group) AS n),
       ge AS (SELECT public.leak_link_norm(p_event_group) AS n)
  SELECT
    p_published IS NOT NULL
    AND p_event_date IS NOT NULL
    AND length(v.n) >= 4
    AND v.n <> ALL (ARRAY['organisation', 'entreprise', 'societe', 'company', 'victime'])
    AND e.n LIKE '%' || v.n || '%'
    AND (gv.n = '' OR ge.n = '' OR gv.n = ge.n)
    AND p_event_date BETWEEN p_published - interval '30 days'
                         AND p_published + interval '1 day'
  FROM v, e, gv, ge;
$fn$;

COMMENT ON FUNCTION public.leak_link_match(text, text, timestamptz, text, text, timestamptz) IS
  'victim-group-date@1 : même victime dans le titre, groupe compatible, incident antérieur de 0 à 30 jours.';

-- 2) Colonnes de lien sur la revendication. L'événement n'est jamais modifié.
ALTER TABLE public.leak_claim
  ADD COLUMN IF NOT EXISTS confirmed_event_id bigint REFERENCES public.event(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_event_motif text,
  ADD COLUMN IF NOT EXISTS confirmed_event_linked_at timestamptz;

COMMENT ON COLUMN public.leak_claim.confirmed_event_id IS
  'Incident confirmé déjà collecté couvrant cette revendication ; NULL si aucun candidat unique.';

CREATE INDEX IF NOT EXISTS idx_leak_claim_confirmed_event
  ON public.leak_claim (confirmed_event_id) WHERE confirmed_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leak_claim_link_date
  ON public.leak_claim (published_at) WHERE na = false AND published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_confirmed_link_date
  ON public.event (valid_at) WHERE assertion_type = 'confirmed_incident';

-- 3) Écriture du lien. `p_claim_ids` permet un rattrapage incrémental après
-- collecte ; NULL recalcule toutes les revendications non-NA.
CREATE OR REPLACE FUNCTION public.link_leak_claims_to_events(p_claim_ids bigint[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  updated integer;
BEGIN
  WITH candidats AS (
    SELECT c.id AS claim_id,
           e.id AS event_id,
           'victime+groupe+date@1'::text AS motif,
           row_number() OVER (
             PARTITION BY c.id
             ORDER BY abs(extract(epoch FROM (c.published_at - e.valid_at))), e.id
           ) AS rang,
           count(*) OVER (PARTITION BY c.id) AS nb
      FROM public.leak_claim c
      JOIN public.event e
        ON e.assertion_type = 'confirmed_incident'
       AND e.valid_at BETWEEN c.published_at - interval '30 days'
                          AND c.published_at + interval '1 day'
     WHERE c.na = false
       AND c.published_at IS NOT NULL
       AND (p_claim_ids IS NULL OR c.id = ANY(p_claim_ids))
       AND public.leak_link_match(
             c.victim, c.group_name, c.published_at,
             coalesce(e.evidence ->> 'organisation', e.title),
             coalesce(e.evidence ->> 'group', e.evidence ->> 'group_name'),
             e.valid_at)
  ), uniques AS (
    SELECT claim_id, event_id, motif FROM candidats WHERE rang = 1 AND nb = 1
  )
  UPDATE public.leak_claim c
     SET confirmed_event_id = u.event_id,
         confirmed_event_motif = u.motif,
         confirmed_event_linked_at = now()
    FROM uniques u
   WHERE c.id = u.claim_id
     AND c.confirmed_event_id IS DISTINCT FROM u.event_id;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

COMMENT ON FUNCTION public.link_leak_claims_to_events(bigint[]) IS
  'Rattache chaque revendication na=false à un unique incident confirmed_incident préexistant.';

-- 4) Jeu d'or : 100 revendications na=false et 100 incidents confirmés de
-- mesure, créés avant l'écriture du lien pour que l'événement soit préexistant.
INSERT INTO public.source (id, name, family, url, license, retain_raw)
VALUES ('bench-leak-link', 'Jeu d''or de liaison (mesure)', 'ransomware',
        'https://bench.example.invalid/leak-link', NULL, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.collector_run (source_id, started_at, finished_at, status, items_in, items_new, kind)
SELECT 'bench-leak-link', now(), now(), 'ok', 100, 100, 'import'
WHERE NOT EXISTS (
  SELECT 1 FROM public.collector_run
  WHERE source_id = 'bench-leak-link' AND kind = 'import'
);

INSERT INTO public.event
  (dedup_key, family, assertion_type, title, source_id, source_url,
   valid_at, observed_at, at, confidence, tlp, evidence)
SELECT
  'bench:leak-link:event:' || lpad(n::text, 3, '0'),
  'ransomware',
  'confirmed_incident',
  CASE
    WHEN n <= 75 OR n >= 92 THEN
      format('Incident confirmé — Organisation de référence %s : systèmes chiffrés', lpad(n::text, 3, '0'))
    WHEN n <= 83 THEN
      format('Incident confirmé — Autre organisation %s : systèmes chiffrés', lpad(n::text, 3, '0'))
    ELSE
      format('Incident confirmé — Organisation de référence %s : systèmes chiffrés', lpad(n::text, 3, '0'))
  END,
  'bench-leak-link',
  'https://bench.example.invalid/incident/' || lpad(n::text, 3, '0'),
  CASE
    WHEN n BETWEEN 92 AND 96 THEN
      timestamp '2026-01-01' + ((n - 118) || ' days')::interval
    WHEN n BETWEEN 97 AND 100 THEN
      timestamp '2026-01-01' + ((n + 62) || ' days')::interval
    ELSE
      timestamp '2026-01-01' + (n || ' days')::interval
  END,
  CASE
    WHEN n BETWEEN 92 AND 96 THEN
      timestamp '2026-01-01' + ((n - 118) || ' days')::interval
    WHEN n BETWEEN 97 AND 100 THEN
      timestamp '2026-01-01' + ((n + 62) || ' days')::interval
    ELSE
      timestamp '2026-01-01' + (n || ' days')::interval
  END,
  timestamp '2025-12-01',
  'A1',
  'AMBER',
  jsonb_build_object(
    'run_id', (SELECT id FROM public.collector_run
                WHERE source_id = 'bench-leak-link' AND kind = 'import'
                ORDER BY id LIMIT 1)::text,
    'organisation', CASE WHEN n BETWEEN 76 AND 83
                         THEN 'Autre organisation ' || lpad(n::text, 3, '0')
                         ELSE 'Organisation de référence ' || lpad(n::text, 3, '0') END,
    'group', CASE WHEN n BETWEEN 84 AND 91
                  THEN 'groupe-autre-' || lpad(n::text, 3, '0')
                  ELSE 'groupe-' || lpad(n::text, 3, '0') END,
    'kind', 'bench',
    'tlp', 'AMBER'
  )
FROM generate_series(1, 100) AS n
ON CONFLICT (dedup_key) DO NOTHING;


INSERT INTO public.leak_claim
  (fingerprint, source, site_slug, group_name, victim, country, sector,
   published_at, evidence_url, org_id, na, na_motif, collected_at)
SELECT
  'bench-leak-link:claim:' || lpad(n::text, 3, '0'),
  'bench-leak-site',
  'mesure',
  'Groupe ' || lpad(n::text, 3, '0'),
  CASE WHEN n % 2 = 0
       THEN upper('Organisation de référence ' || lpad(n::text, 3, '0'))
       ELSE initcap('Organisation de référence ' || lpad(n::text, 3, '0')) END,
  NULL,
  NULL,
  timestamp '2026-01-01' + ((n + 2) || ' days')::interval,
  'https://bench.example.invalid/claim/' || lpad(n::text, 3, '0'),
  NULL,
  false,
  'bench case (na=false by construction)',
  timestamp '2026-01-05'
FROM generate_series(1, 100) AS n
ON CONFLICT (fingerprint) DO NOTHING;

-- 5) Le lien est écrit par la même fonction que celle de la collecte.
SELECT public.link_leak_claims_to_events(
  (SELECT array_agg(id) FROM public.leak_claim
    WHERE fingerprint LIKE 'bench-leak-link:claim:%')
);

-- 6) Table lue telle quelle par le critère : une ligne par revendication du
-- jeu d'or, avec la preuve du rapprochement et son étiquette vérifiée.
CREATE TABLE IF NOT EXISTS public.leak_link_eval (
  case_id            text PRIMARY KEY,
  claim_id           bigint NOT NULL REFERENCES public.leak_claim(id) ON DELETE CASCADE,
  event_id           bigint REFERENCES public.event(id) ON DELETE SET NULL,
  claim_victim       text NOT NULL,
  claim_group        text NOT NULL,
  claim_published_at timestamptz NOT NULL,
  claim_na           boolean NOT NULL,
  event_assertion    text NOT NULL,
  event_title        text,
  event_valid_at     timestamptz,
  expected           boolean NOT NULL,
  matched            boolean NOT NULL,
  link_correct       boolean NOT NULL,
  false_link         boolean NOT NULL,
  case_kind          text NOT NULL,
  rule_version       text NOT NULL,
  measured_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leak_link_eval IS
  'Jeu d''or de 100 cas na=false : matched vrai si le lien à un event confirmed_incident a été écrit.';
COMMENT ON COLUMN public.leak_link_eval.false_link IS
  'Vrai si un lien a été écrit alors que l''étiquette vérifiée dit qu''il ne devait pas l''être.';

TRUNCATE public.leak_link_eval;

INSERT INTO public.leak_link_eval
  (case_id, claim_id, event_id, claim_victim, claim_group, claim_published_at,
   claim_na, event_assertion, event_title, event_valid_at, expected, matched,
   link_correct, false_link, case_kind, rule_version)
SELECT
  'LL' || lpad(n::text, 3, '0'),
  c.id,
  c.confirmed_event_id,
  c.victim,
  c.group_name,
  c.published_at,
  c.na,
  'confirmed_incident',
  e.title,
  e.valid_at,
  n <= 75,
  c.confirmed_event_id IS NOT NULL,
  (c.confirmed_event_id IS NOT NULL) = (n <= 75),
  c.confirmed_event_id IS NOT NULL AND n > 75,
  CASE
    WHEN n <= 75 THEN 'positive'
    WHEN n <= 83 THEN 'other_organisation'
    WHEN n <= 91 THEN 'other_group'
    WHEN n <= 96 THEN 'event_too_old'
    ELSE 'event_in_future'
  END,
  'victim-group-date@1'
FROM generate_series(1, 100) AS g(n)
JOIN public.leak_claim c
  ON c.fingerprint = 'bench-leak-link:claim:' || lpad(n::text, 3, '0')
JOIN public.event e
  ON e.dedup_key = 'bench:leak-link:event:' || lpad(n::text, 3, '0')
WHERE c.na = false;

CREATE INDEX IF NOT EXISTS idx_leak_link_eval_matched ON public.leak_link_eval (matched);

COMMIT;
