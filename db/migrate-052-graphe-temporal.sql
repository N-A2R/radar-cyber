-- 052 : graphe de connaissance temporel.
--
-- Entités et relations typées, chacune avec sa période de validité :
--   valid_from — début de la période (date de vérité mesurée en base) ;
--   valid_to   — fin de la période, NULL = encore valide.
--
-- Le chargement ne crée aucune assertion : chaque lien vient d'un champ
-- réellement renseigné (event.valid_at, event.org_id, event.source_id,
-- evidence.group, org.domain, dns_snapshot). Les événements sans rattachement
-- restent reliés à leur source et à leur famille. `refresh_graphe_temporal()`
-- reconstruit la projection de façon idempotente ; la migration l'appelle une
-- fois, les refreshs suivants se font à la demande.

BEGIN;

CREATE TABLE IF NOT EXISTS graph_entity (
  id         text PRIMARY KEY,
  kind       text NOT NULL,
  label      text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to   timestamptz,
  props      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS graph_entity_kind_idx ON graph_entity (kind, valid_from DESC);

CREATE TABLE IF NOT EXISTS graph_relation (
  id         bigserial PRIMARY KEY,
  source_id  text NOT NULL REFERENCES graph_entity(id) ON DELETE CASCADE,
  target_id  text NOT NULL REFERENCES graph_entity(id) ON DELETE CASCADE,
  type       text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to   timestamptz,
  evidence   jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT graph_relation_unique UNIQUE (source_id, target_id, type, valid_from)
);

CREATE INDEX IF NOT EXISTS graph_relation_valid_idx ON graph_relation (valid_from DESC, id DESC);
CREATE INDEX IF NOT EXISTS graph_relation_source_idx ON graph_relation (source_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS graph_relation_target_idx ON graph_relation (target_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS graph_relation_end_idx ON graph_relation (valid_to DESC) WHERE valid_to IS NOT NULL;

CREATE OR REPLACE FUNCTION refresh_graphe_temporal()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_referents integer[];
BEGIN
  -- Projection dérivée : on repart des faits, jamais d'un état précédent.
  DELETE FROM graph_relation;
  DELETE FROM graph_entity;

  SELECT COALESCE(array_agg(DISTINCT org_id), '{}'::integer[]) INTO v_referents
  FROM event WHERE org_id IS NOT NULL;

  INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
  SELECT ('event:' || e.id)::text, 'event'::text, left(e.title, 160)::text,
         e.valid_at::timestamptz, NULL::timestamptz,
         jsonb_build_object('family', e.family, 'severity', e.severity, 'observedAt', e.valid_at)
  FROM event e
  UNION ALL
  SELECT ('source:' || s.id)::text, 'source'::text, s.name, COALESCE(s.created_at, now()),
         NULL::timestamptz, jsonb_build_object('family', s.family)
  FROM source s
  WHERE EXISTS (SELECT 1 FROM event e WHERE e.source_id = s.id)
  UNION ALL
  SELECT ('org:' || o.id)::text, 'org'::text, o.name, o.valid_from, o.valid_to,
         jsonb_build_object('dept', o.dept, 'domain', o.domain)
  FROM org o
  WHERE o.id = ANY (v_referents)
  UNION ALL
  SELECT ('family:' || e.family)::text, 'family'::text, e.family, min(e.valid_at),
         NULL::timestamptz, '{}'::jsonb
  FROM event e GROUP BY e.family
  UNION ALL
  SELECT ('group:' || lower(btrim(e.evidence ->> 'group')))::text,
         'group'::text, min(btrim(e.evidence ->> 'group')), min(e.valid_at),
         NULL::timestamptz, '{}'::jsonb
  FROM event e
  WHERE e.evidence ->> 'group' IS NOT NULL AND btrim(e.evidence ->> 'group') <> ''
  GROUP BY lower(btrim(e.evidence ->> 'group'))
  UNION ALL
  SELECT ('dept:' || o.dept)::text, 'dept'::text, o.dept, min(o.valid_from),
         NULL::timestamptz, '{}'::jsonb
  FROM org o WHERE o.id = ANY (v_referents) AND o.dept IS NOT NULL AND btrim(o.dept) <> ''
  GROUP BY o.dept
  UNION ALL
  SELECT ('domain:' || lower(btrim(o.domain)))::text, 'domain'::text,
         lower(btrim(o.domain)), min(o.valid_from), NULL::timestamptz, '{}'::jsonb
  FROM org o WHERE o.domain IS NOT NULL AND btrim(o.domain) <> ''
  GROUP BY lower(btrim(o.domain));

  INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
  SELECT ('event:' || e.id)::text, ('source:' || e.source_id)::text, 'reported_by'::text,
         e.valid_at::timestamptz, NULL::timestamptz, '{}'::jsonb
  FROM event e
  UNION ALL
  SELECT ('family:' || e.family)::text, ('event:' || e.id)::text, 'contains'::text,
         e.valid_at::timestamptz, NULL::timestamptz, '{}'::jsonb
  FROM event e
  UNION ALL
  SELECT ('org:' || e.org_id)::text, ('event:' || e.id)::text, 'targeted_by'::text,
         e.valid_at::timestamptz, NULL::timestamptz, '{}'::jsonb
  FROM event e WHERE e.org_id IS NOT NULL
  UNION ALL
  SELECT ('group:' || lower(btrim(e.evidence ->> 'group')))::text, ('event:' || e.id)::text,
         'claims'::text, e.valid_at::timestamptz, NULL::timestamptz, '{}'::jsonb
  FROM event e
  WHERE e.evidence ->> 'group' IS NOT NULL AND btrim(e.evidence ->> 'group') <> ''
  UNION ALL
  SELECT 'org:' || o.id, 'dept:' || o.dept, 'located_in', o.valid_from, o.valid_to, '{}'::jsonb
  FROM org o WHERE o.id = ANY (v_referents) AND o.dept IS NOT NULL AND btrim(o.dept) <> ''
  UNION ALL
  SELECT 'org:' || o.id, 'domain:' || lower(btrim(o.domain)), 'owns_domain',
         o.valid_from, o.valid_to, '{}'::jsonb
  FROM org o WHERE o.id = ANY (v_referents)
    AND o.domain IS NOT NULL AND btrim(o.domain) <> ''
  UNION ALL
  -- Période d'attribution agrégée : du premier fait à la fin du jour du
  -- dernier fait observé (granularité jour, aucune durée supposée).
  SELECT 'org:' || e.org_id::text,
         'group:' || lower(btrim(e.evidence ->> 'group')),
         'attributed_to', min(e.valid_at),
         date_trunc('day', max(e.valid_at)) + interval '1 day',
         jsonb_build_object('events', count(*))
  FROM event e
  WHERE e.org_id IS NOT NULL AND e.evidence ->> 'group' IS NOT NULL
    AND btrim(e.evidence ->> 'group') <> ''
  GROUP BY e.org_id, lower(btrim(e.evidence ->> 'group'));

  -- Le suivi DNS n'existe que sur les bases qui ont migré le chantier 051.
  -- Sans table, on ne fabrique ni domaine ni IP.
  IF to_regclass('public.dns_domaine') IS NOT NULL
     AND to_regclass('public.dns_snapshot') IS NOT NULL THEN
    INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
    SELECT 'domain:' || lower(btrim(d.domain)), 'domain', lower(btrim(d.domain)),
           d.first_seen, NULL, '{}'::jsonb
    FROM dns_domaine d
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
    SELECT 'ip:' || ip.addr, 'ip', ip.addr, min(s.observed_at), NULL, '{}'::jsonb
    FROM dns_snapshot s
    CROSS JOIN LATERAL unnest(COALESCE(s.a, '{}'::text[]) || COALESCE(s.aaaa, '{}'::text[])) AS ip(addr)
    WHERE ip.addr IS NOT NULL AND btrim(ip.addr) <> '' AND ip.addr ~ '^[0-9A-Fa-f:.]+$'
    GROUP BY ip.addr
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
    SELECT DISTINCT 'org:' || org_id::text, 'org', o.name, o.valid_from, o.valid_to, '{}'::jsonb
    FROM dns_domaine d CROSS JOIN LATERAL unnest(d.org_ids) AS x(org_id)
    JOIN org o ON o.id = x.org_id
    ON CONFLICT (id) DO NOTHING;

    WITH resolutions AS (
      SELECT lower(btrim(s.domain)) AS domain, s.addr AS addr,
             s.observed_at,
             lead(s.observed_at) OVER (PARTITION BY s.domain, s.addr ORDER BY s.observed_at) AS next_at
      FROM (
        SELECT domain, observed_at,
               unnest(COALESCE(a, '{}'::text[]) || COALESCE(aaaa, '{}'::text[])) AS addr
        FROM dns_snapshot
      ) s
      WHERE s.addr IS NOT NULL AND btrim(s.addr) <> '' AND s.addr ~ '^[0-9A-Fa-f:.]+$'
    )
    INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
    SELECT 'domain:' || r.domain, 'ip:' || r.addr, 'resolves_to', r.observed_at, r.next_at, '{}'::jsonb
    FROM resolutions r
    ON CONFLICT DO NOTHING;

    INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
    SELECT DISTINCT ('org:' || x.org_id::text)::text, ('domain:' || lower(btrim(d.domain)))::text,
           'dns_link'::text, d.first_seen::timestamptz, NULL::timestamptz, '{}'::jsonb
    FROM dns_domaine d CROSS JOIN LATERAL unnest(d.org_ids) AS x(org_id)
    WHERE EXISTS (SELECT 1 FROM graph_entity e WHERE e.id = 'org:' || x.org_id::text)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

COMMENT ON TABLE graph_entity IS 'Entités du graphe temporel : période de validité des faits mesurés.';
COMMENT ON TABLE graph_relation IS 'Relations typées du graphe temporel : qui étaient liés à qui, et quand.';

SELECT refresh_graphe_temporal();

COMMIT;
