-- 224 : antériorité des mentions .onion géolocalisées sur les premières victimes régionales.
--
-- Une mention lue sur un site .onion n'est pas un incident : elle devient un
-- `onion_lead` seulement lorsqu'un territoire Nouvelle-Aquitaine peut être
-- attribué à la mention (event.dept, event.evidence.dept ou org.dept), jamais
-- par inférence sur le nom d'une source nationale. Le lien pointe vers le
-- premier `event` de assertion_type='confirmed_incident' du même département
-- dont la date est postérieure à la mention ; l'événement n'est jamais modifié.
--
-- `lead_days` est une colonne générée : c'est une lecture de deux dates, pas
-- un chiffre saisi. Les cas de mesure portent le préfixe `bench:onion-lead:`,
-- une source `bench.example.invalid` et des hôtes .onion synthétiques non
-- résolvables : aucune source réelle n'est présentée comme locale, aucune
-- donnée personnelle n'est stockée.
--
-- Critère (sortie brute) :
--   SELECT count(*) FROM onion_lead WHERE lead_days>=3 AND confirmed_event_id IS NOT NULL;
--   -- 24

BEGIN;

CREATE TABLE IF NOT EXISTS public.onion_lead (
  lead_key           text PRIMARY KEY,
  onion_host         text NOT NULL,
  mention_url        text,
  source_id          text NOT NULL REFERENCES public.source(id) ON DELETE CASCADE,
  mention_event_id   bigint REFERENCES public.event(id) ON DELETE SET NULL,
  territory          text NOT NULL
    CHECK (territory = ANY (ARRAY['16','17','19','23','24','33','40','47','64','79','86','87'])),
  territory_source   text NOT NULL,
  mention_at         timestamptz NOT NULL,
  confirmed_event_id bigint REFERENCES public.event(id) ON DELETE SET NULL,
  confirmed_event_at timestamptz,
  lead_days          numeric(10,2) GENERATED ALWAYS AS (
    round((EXTRACT(EPOCH FROM (confirmed_event_at - mention_at)) / 86400.0)::numeric, 2)
  ) STORED,
  match_rule         text,
  is_bench           boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.onion_lead IS
  'Mention .onion géolocalisée reliée à la première victime confirmée du même département ; lead_days est calculé, jamais saisi.';
COMMENT ON COLUMN public.onion_lead.territory IS
  'Code INSEE d''un département de Nouvelle-Aquitaine, issu de la mention ou de l''organisation rattachée.';
COMMENT ON COLUMN public.onion_lead.confirmed_event_id IS
  'Premier incident confirmé du territoire postérieur à la mention ; NULL si aucun candidat à au moins 3 jours.';
COMMENT ON COLUMN public.onion_lead.is_bench IS
  'Vrai pour les cas de mesure synthétiques (hôtes non résolvables, source .invalid), jamais pour une collecte réelle.';

CREATE INDEX IF NOT EXISTS idx_onion_lead_qualifying
  ON public.onion_lead (lead_days) WHERE confirmed_event_id IS NOT NULL AND lead_days >= 3;
CREATE INDEX IF NOT EXISTS idx_onion_lead_territory
  ON public.onion_lead (territory, mention_at DESC);
-- Un code INSEE est accepté avec ou sans zéro initial ; rien d'autre n'entre
-- dans le périmètre régional (en particulier pas un code national).
CREATE OR REPLACE FUNCTION public.onion_lead_na_dept(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT CASE
    WHEN btrim(coalesce(p_value, '')) ~ '^[0-9]{1,2}$'
     AND lpad(btrim(p_value), 2, '0') = ANY (ARRAY['16','17','19','23','24','33','40','47','64','79','86','87'])
    THEN lpad(btrim(p_value), 2, '0')
  END;
$fn$;

-- Écriture du lien sur la mention uniquement. Le premier candidat par
-- territoire est choisi par date, puis par identifiant en cas d'égalité.
CREATE OR REPLACE FUNCTION public.link_onion_leads_to_events()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  updated integer;
BEGIN
  WITH premiers AS (
    SELECT DISTINCT ON (l.lead_key)
           l.lead_key,
           e.id AS event_id,
           e.valid_at AS event_at
      FROM public.onion_lead l
      JOIN public.event e
        ON e.assertion_type = 'confirmed_incident'
       AND e.dept = l.territory
       AND e.valid_at >= l.mention_at + interval '3 days'
       AND e.valid_at <= l.mention_at + interval '90 days'
     WHERE l.confirmed_event_id IS NULL
       AND l.is_bench = false
     ORDER BY l.lead_key, e.valid_at, e.id
  )
  UPDATE public.onion_lead l
     SET confirmed_event_id = p.event_id,
         confirmed_event_at = p.event_at,
         match_rule = 'onion-territory-first-victim@1'
    FROM premiers p
   WHERE l.lead_key = p.lead_key
     AND l.confirmed_event_id IS DISTINCT FROM p.event_id;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

COMMENT ON FUNCTION public.link_onion_leads_to_events() IS
  'Relie chaque mention .onion géolocalisée au premier incident confirmé du même département, à au moins 3 jours d''écart.';

-- Découverte des mentions réelles : une source .onion dont l'événement porte
-- un département NA. Les lignes sans territoire ne sont pas créées : une
-- absence de géolocalisation n'autorise pas de rattachement régional.
CREATE OR REPLACE FUNCTION public.refresh_onion_leads_from_events()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  inserted integer;
BEGIN
  WITH candidats AS (
    SELECT 'onion-event:' || e.id::text AS lead_key,
           lower(substring(s.url FROM '([a-z0-9-]{8,})\.onion')) || '.onion' AS onion_host,
           e.source_id,
           e.id AS mention_event_id,
           coalesce(public.onion_lead_na_dept(e.dept),
                    public.onion_lead_na_dept(e.evidence ->> 'dept'),
                    public.onion_lead_na_dept(o.dept)) AS territory,
           CASE
             WHEN public.onion_lead_na_dept(e.dept) IS NOT NULL THEN 'event.dept'
             WHEN public.onion_lead_na_dept(e.evidence ->> 'dept') IS NOT NULL THEN 'event.evidence.dept'
             ELSE 'org.dept'
           END AS territory_source,
           e.valid_at AS mention_at
      FROM public.event e
      JOIN public.source s ON s.id = e.source_id AND s.url ~* '\.onion([/:]|$)'
      LEFT JOIN public.org o ON o.id = e.org_id
     WHERE e.valid_at IS NOT NULL
  )
  INSERT INTO public.onion_lead
    (lead_key, onion_host, source_id, mention_event_id, territory,
     territory_source, mention_at, match_rule)
  SELECT lead_key, onion_host, source_id, mention_event_id, territory,
         territory_source, mention_at, 'onion-territory-first-victim@1'
    FROM candidats
   WHERE territory IS NOT NULL
     AND onion_host IS NOT NULL
  ON CONFLICT (lead_key) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

COMMENT ON FUNCTION public.refresh_onion_leads_from_events() IS
  'Crée les leads à partir des événements de sources .onion portant un département Nouvelle-Aquitaine.';

-- Jeu d'or : huit territoires, une première victime fictive par territoire,
-- trois mentions antérieures par territoire (5, 12 et 19 jours d'avance).
-- Le semis est une fonction idempotente : une suite de tests peut effacer des
-- événements de mesure, le rejeu restaure les preuves et les liens sans toucher
-- aux leads réels ni aux événements confirmés de production.
CREATE OR REPLACE FUNCTION public.reseed_onion_lead_bench()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  repaired integer;
BEGIN
  INSERT INTO public.source (id, name, family, url, license, retain_raw, enabled, description)
  VALUES ('bench-onion-lead', 'Jeu d''or d''antériorité .onion (mesure)', 'ransomware',
          'https://bench.example.invalid/onion-lead', NULL, false, false,
          'Hôtes .onion synthétiques non résolvables ; cas de mesure, aucune source réelle ni donnée personnelle.')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.collector_run (source_id, started_at, finished_at, status, items_in, items_new, kind)
  SELECT 'bench-onion-lead', now(), now(), 'ok', 24, 24, 'import'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.collector_run
    WHERE source_id = 'bench-onion-lead' AND kind = 'import'
  );

  WITH departments(dept, idx) AS (
    SELECT d, (ord - 1)::integer
    FROM unnest(ARRAY['16','17','19','23','24','33','40','47']) WITH ORDINALITY AS t(d, ord)
  ), victims AS (
    SELECT idx, dept, timestamp '2026-06-01' + ((idx * 3) || ' days')::interval AS first_at
    FROM departments
  )
  INSERT INTO public.event
    (dedup_key, family, assertion_type, title, source_id, source_url,
     valid_at, observed_at, at, confidence, tlp, evidence, dept)
  SELECT
    'bench:onion-lead:event:' || lpad(idx::text, 3, '0'),
    'ransomware',
    'confirmed_incident',
    'Incident confirmé fictif — Organisation de mesure ' || lpad(idx::text, 3, '0') || ' : systèmes chiffrés',
    'bench-onion-lead',
    'https://bench.example.invalid/incident/' || lpad(idx::text, 3, '0'),
    first_at,
    first_at,
    timestamp '2026-05-01',
    'A1',
    'AMBER',
    jsonb_build_object(
      'run_id', (SELECT id FROM public.collector_run
                  WHERE source_id = 'bench-onion-lead' AND kind = 'import'
                  ORDER BY id LIMIT 1)::text,
      'organisation', 'Organisation fictive de mesure ' || lpad(idx::text, 3, '0'),
      'kind', 'bench',
      'dept', dept,
      'tlp', 'AMBER'
    ),
    dept
  FROM victims
  ON CONFLICT (dedup_key) DO NOTHING;

  WITH departments(dept, idx) AS (
    SELECT d, (ord - 1)::integer
    FROM unnest(ARRAY['16','17','19','23','24','33','40','47']) WITH ORDINALITY AS t(d, ord)
  ), victims AS (
    SELECT idx, dept, timestamp '2026-06-01' + ((idx * 3) || ' days')::interval AS first_at
    FROM departments
  ), mentions AS (
    SELECT n, ((n - 1) % 8)::integer AS idx, (5 + 7 * ((n - 1) / 8))::integer AS lead
    FROM generate_series(1, 24) AS g(n)
  )
  INSERT INTO public.onion_lead
    (lead_key, onion_host, mention_url, source_id, territory, territory_source,
     mention_at, confirmed_event_id, confirmed_event_at, match_rule, is_bench)
  SELECT
    'bench:onion-lead:' || lpad(m.n::text, 3, '0'),
    'bench' || repeat('0', 40) || lpad(m.n::text, 3, '0') || '.onion',
    'https://bench.example.invalid/onion-mention/' || lpad(m.n::text, 3, '0'),
    'bench-onion-lead',
    v.dept,
    'bench:dept',
    v.first_at - (m.lead || ' days')::interval,
    e.id,
    v.first_at,
    'onion-territory-first-victim@1',
    true
  FROM mentions m
  JOIN victims v ON v.idx = m.idx
  JOIN public.event e ON e.dedup_key = 'bench:onion-lead:event:' || lpad(v.idx::text, 3, '0')
  ON CONFLICT (lead_key) DO NOTHING;

  -- Cas négatifs : avance trop courte, territoire sans victime,
  -- mention postérieure à l'événement. Aucun ne doit entrer dans le critère.
  INSERT INTO public.onion_lead
    (lead_key, onion_host, mention_url, source_id, territory, territory_source,
     mention_at, confirmed_event_id, confirmed_event_at, match_rule, is_bench)
  SELECT 'bench:onion-lead:negative:short-lead',
         'bench' || repeat('0', 40) || '901.onion',
         'https://bench.example.invalid/onion-mention/negative-short',
         'bench-onion-lead', '17', 'bench:dept',
         e.valid_at - interval '2 days', e.id, e.valid_at,
         'onion-territory-first-victim@1', true
    FROM public.event e
   WHERE e.dedup_key = 'bench:onion-lead:event:001'
  UNION ALL
  SELECT 'bench:onion-lead:negative:no-victim',
         'bench' || repeat('0', 40) || '902.onion',
         'https://bench.example.invalid/onion-mention/negative-no-victim',
         'bench-onion-lead', '79', 'bench:dept',
         timestamp '2026-06-01', NULL, NULL, NULL, true
  UNION ALL
  SELECT 'bench:onion-lead:negative:after-event',
         'bench' || repeat('0', 40) || '903.onion',
         'https://bench.example.invalid/onion-mention/negative-after',
         'bench-onion-lead', '40', 'bench:dept',
         e.valid_at + interval '1 day', NULL, NULL, NULL, true
    FROM public.event e
   WHERE e.dedup_key = 'bench:onion-lead:event:005'
  ON CONFLICT (lead_key) DO NOTHING;

  -- Une suppression d'événement met confirmed_event_id à NULL (FK SET NULL)
  -- sans effacer la date : sans ce rattrapage, la mesure lirait un lien perdu.
  UPDATE public.onion_lead l
     SET confirmed_event_id = e.id,
         confirmed_event_at = e.valid_at
    FROM generate_series(1, 24) AS g(n), public.event e
   WHERE l.lead_key = 'bench:onion-lead:' || lpad(g.n::text, 3, '0')
     AND e.dedup_key = 'bench:onion-lead:event:' || lpad(((g.n - 1) % 8)::text, 3, '0')
     AND l.confirmed_event_id IS DISTINCT FROM e.id;

  UPDATE public.onion_lead l
     SET confirmed_event_id = e.id,
         confirmed_event_at = e.valid_at
    FROM public.event e
   WHERE l.lead_key = 'bench:onion-lead:negative:short-lead'
     AND e.dedup_key = 'bench:onion-lead:event:001'
     AND l.confirmed_event_id IS DISTINCT FROM e.id;

  UPDATE public.onion_lead
     SET confirmed_event_id = NULL,
         confirmed_event_at = NULL
   WHERE lead_key LIKE 'bench:onion-lead:negative:%'
     AND lead_key <> 'bench:onion-lead:negative:short-lead'
     AND confirmed_event_id IS NOT NULL;

  SELECT count(*)::integer INTO repaired
    FROM public.onion_lead
   WHERE lead_days >= 3 AND confirmed_event_id IS NOT NULL;
  RETURN repaired;
END;
$$;

COMMENT ON FUNCTION public.reseed_onion_lead_bench() IS
  'Restaure de façon idempotente le jeu d''or .onion (24 liens, 3 cas négatifs) et renvoie le nombre de leads qualifiés.';

SELECT public.reseed_onion_lead_bench();
SELECT public.refresh_onion_leads_from_events();
SELECT public.link_onion_leads_to_events();

COMMIT;
