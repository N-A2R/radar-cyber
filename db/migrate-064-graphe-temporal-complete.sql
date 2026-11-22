-- 064: complete temporal graph projection.
--
-- The 052 projection only covers dates from event.valid_at and stops at nine
-- link types. The real regional database has not applied the bitemporal event
-- migration yet, so this projection uses the first real timestamp available
-- on each fact: observed_at, then collected_at, then created_at.
--
-- New links come from fields that were already stored but never linked:
-- publication hosts (event.source_url), vulnerability products and vendors
-- (evidence.vendor / evidence.product). Every relation has a valid_from.
--
-- Scope: organizations are limited to the twelve Nouvelle-Aquitaine
-- departments. Event labels are built from family, date and id, never from
-- titles or free-text evidence, so no victim name enters the graph.
--
-- Idempotent: refresh_temporal_graph_complete() rebuilds the projection from
-- the facts, never from a previous state.

BEGIN;

CREATE TABLE IF NOT EXISTS graph_entity (
  id         text PRIMARY KEY,
  kind       text NOT NULL,
  label      text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to   timestamptz,
  props      jsonb NOT NULL DEFAULT '{}'::jsonb
);

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

CREATE INDEX IF NOT EXISTS graph_entity_kind_idx ON graph_entity (kind, valid_from DESC);
CREATE INDEX IF NOT EXISTS graph_relation_valid_idx ON graph_relation (valid_from DESC, id DESC);
CREATE INDEX IF NOT EXISTS graph_relation_source_idx ON graph_relation (source_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS graph_relation_target_idx ON graph_relation (target_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS graph_relation_end_idx ON graph_relation (valid_to DESC) WHERE valid_to IS NOT NULL;

CREATE OR REPLACE FUNCTION refresh_temporal_graph_complete()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  na_depts text[] := ARRAY[
    '16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87',
    'Charente', 'Charente-Maritime', 'Correze', 'Corrèze', 'Creuse', 'Dordogne',
    'Gironde', 'Landes', 'Lot-et-Garonne', 'Pyrenees-Atlantiques',
    'Pyrénées-Atlantiques', 'Deux-Sevres', 'Deux-Sèvres', 'Vienne', 'Haute-Vienne'
  ];
  v_referents integer[];
  v_na_referents integer[];
BEGIN
  DELETE FROM graph_relation;
  DELETE FROM graph_entity;

  SELECT COALESCE(array_agg(DISTINCT e.org_id), '{}'::integer[])
    INTO v_referents FROM event e WHERE e.org_id IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT o.id), '{}'::integer[])
    INTO v_na_referents
    FROM org o WHERE o.id = ANY (v_referents) AND o.dept = ANY (na_depts);

  INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
  SELECT 'source:' || s.id, 'source', s.name,
         COALESCE(s.created_at, min(COALESCE(e.observed_at, e.collected_at, e.created_at)), now()),
         NULL, jsonb_build_object('family', s.family)
    FROM source s JOIN event e ON e.source_id = s.id
   GROUP BY s.id, s.name, s.family, s.created_at
  ON CONFLICT DO NOTHING;

  INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
  SELECT 'family:' || e.family, 'family', e.family,
         min(COALESCE(e.observed_at, e.collected_at, e.created_at)), NULL, '{}'::jsonb
    FROM event e
   WHERE e.family IS NOT NULL AND btrim(e.family) <> ''
   GROUP BY e.family
  ON CONFLICT DO NOTHING;

  INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
  SELECT 'event:' || e.id, 'event',
         e.family || ' ' || to_char(COALESCE(e.observed_at, e.collected_at, e.created_at), 'YYYY-MM-DD') || ' #' || e.id,
         COALESCE(e.observed_at, e.collected_at, e.created_at, now()), NULL,
         jsonb_build_object('family', e.family)
    FROM event e
  ON CONFLICT DO NOTHING;

  INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
  SELECT 'org:' || o.id, 'org', o.name, COALESCE(o.valid_from, o.created_at), o.valid_to,
         jsonb_build_object('dept', o.dept, 'domain', o.domain)
    FROM org o WHERE o.id = ANY (v_na_referents)
  ON CONFLICT DO NOTHING;

  INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
  SELECT 'group:' || lower(btrim(e.evidence ->> 'group')), 'group',
         min(btrim(e.evidence ->> 'group')),
         min(COALESCE(e.observed_at, e.collected_at, e.created_at)), NULL, '{}'::jsonb
    FROM event e
   WHERE e.evidence ->> 'group' IS NOT NULL AND btrim(e.evidence ->> 'group') <> ''
   GROUP BY lower(btrim(e.evidence ->> 'group'))
  ON CONFLICT DO NOTHING;

  INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
  SELECT 'dept:' || o.dept, 'dept', o.dept, min(COALESCE(o.valid_from, o.created_at)), NULL, '{}'::jsonb
    FROM org o WHERE o.id = ANY (v_na_referents) AND o.dept IS NOT NULL AND btrim(o.dept) <> ''
   GROUP BY o.dept
  ON CONFLICT DO NOTHING;

  INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
  SELECT 'domain:' || lower(btrim(o.domain)), 'domain', lower(btrim(o.domain)),
         min(COALESCE(o.valid_from, o.created_at)), NULL, '{}'::jsonb
    FROM org o
   WHERE o.id = ANY (v_na_referents) AND o.domain IS NOT NULL AND btrim(o.domain) <> ''
   GROUP BY lower(btrim(o.domain))
  ON CONFLICT DO NOTHING;

  WITH hosts AS (
    SELECT lower(regexp_replace(
             regexp_replace(
               regexp_replace(btrim(e.source_url), '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''),
               '[/:?#].*$', ''),
             '^www\.', '')) AS host,
           min(COALESCE(e.observed_at, e.collected_at, e.created_at)) AS first_at
      FROM event e WHERE e.source_url IS NOT NULL AND btrim(e.source_url) <> ''
     GROUP BY 1
  )
  INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
  SELECT 'domain:' || h.host, 'domain', h.host, COALESCE(h.first_at, now()), NULL,
         jsonb_build_object('role', 'publication_host')
    FROM hosts h
   WHERE h.host ~ '^[a-z0-9.-]+\.[a-z]{2,}$'
     AND h.host NOT LIKE '.%' AND h.host NOT LIKE '%..%'
  ON CONFLICT DO NOTHING;

  WITH tech AS (
    SELECT lower(btrim(e.evidence ->> 'vendor')) AS vendor,
           lower(btrim(e.evidence ->> 'product')) AS product,
           min(COALESCE(e.observed_at, e.collected_at, e.created_at)) AS first_at
      FROM event e
     WHERE e.evidence ->> 'vendor' IS NOT NULL AND btrim(e.evidence ->> 'vendor') <> ''
       AND e.evidence ->> 'product' IS NOT NULL AND btrim(e.evidence ->> 'product') <> ''
     GROUP BY 1, 2
  )
  INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
  SELECT 'vendor:' || t.vendor, 'vendor', t.vendor, min(t.first_at), NULL, '{}'::jsonb
    FROM tech t GROUP BY t.vendor
  ON CONFLICT DO NOTHING;

  WITH tech AS (
    SELECT lower(btrim(e.evidence ->> 'vendor')) AS vendor,
           lower(btrim(e.evidence ->> 'product')) AS product,
           min(COALESCE(e.observed_at, e.collected_at, e.created_at)) AS first_at
      FROM event e
     WHERE e.evidence ->> 'vendor' IS NOT NULL AND btrim(e.evidence ->> 'vendor') <> ''
       AND e.evidence ->> 'product' IS NOT NULL AND btrim(e.evidence ->> 'product') <> ''
     GROUP BY 1, 2
  )
  INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
  SELECT 'product:' || t.vendor || ':' || t.product, 'product', t.vendor || ' ' || t.product,
         t.first_at, NULL, jsonb_build_object('vendor', t.vendor)
    FROM tech t
  ON CONFLICT DO NOTHING;

  IF to_regclass('public.dns_domaine') IS NOT NULL
     AND to_regclass('public.dns_snapshot') IS NOT NULL THEN
    INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
    SELECT 'domain:' || lower(btrim(d.domain)), 'domain', lower(btrim(d.domain)),
           d.first_seen, NULL, '{}'::jsonb
      FROM dns_domaine d
    ON CONFLICT DO NOTHING;

    INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
    SELECT 'ip:' || ip.addr, 'ip', ip.addr, min(s.observed_at), NULL, '{}'::jsonb
      FROM dns_snapshot s
      CROSS JOIN LATERAL unnest(COALESCE(s.a, '{}'::text[]) || COALESCE(s.aaaa, '{}'::text[])) AS ip(addr)
     WHERE ip.addr IS NOT NULL AND btrim(ip.addr) <> '' AND ip.addr ~ '^[0-9A-Fa-f:.]+$'
     GROUP BY ip.addr
    ON CONFLICT DO NOTHING;

    INSERT INTO graph_entity (id, kind, label, valid_from, valid_to, props)
    SELECT DISTINCT 'org:' || x.org_id::text, 'org', o.name,
           COALESCE(o.valid_from, o.created_at), o.valid_to, '{}'::jsonb
      FROM dns_domaine d
      CROSS JOIN LATERAL unnest(d.org_ids) AS x(org_id)
      JOIN org o ON o.id = x.org_id
     WHERE o.dept = ANY (na_depts)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
  SELECT 'event:' || e.id, 'source:' || e.source_id, 'reported_by',
         COALESCE(e.observed_at, e.collected_at, e.created_at, now()), NULL, '{}'::jsonb
    FROM event e WHERE e.source_id IS NOT NULL;

  INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
  SELECT 'family:' || e.family, 'event:' || e.id, 'contains',
         COALESCE(e.observed_at, e.collected_at, e.created_at, now()), NULL, '{}'::jsonb
    FROM event e WHERE e.family IS NOT NULL AND btrim(e.family) <> '';

  INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
  SELECT 'org:' || e.org_id, 'event:' || e.id, 'targeted_by',
         COALESCE(e.observed_at, e.collected_at, e.created_at, now()), NULL, '{}'::jsonb
    FROM event e WHERE e.org_id = ANY (v_na_referents);

  INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
  SELECT 'group:' || lower(btrim(e.evidence ->> 'group')), 'event:' || e.id, 'claims',
         COALESCE(e.observed_at, e.collected_at, e.created_at, now()), NULL, '{}'::jsonb
    FROM event e
   WHERE e.evidence ->> 'group' IS NOT NULL AND btrim(e.evidence ->> 'group') <> '';

  INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
  SELECT 'org:' || e.org_id,
         'group:' || lower(btrim(e.evidence ->> 'group')),
         'attributed_to',
         min(COALESCE(e.observed_at, e.collected_at, e.created_at)),
         date_trunc('day', max(COALESCE(e.observed_at, e.collected_at, e.created_at))) + interval '1 day',
         jsonb_build_object('events', count(*))
    FROM event e
   WHERE e.org_id = ANY (v_na_referents)
     AND e.evidence ->> 'group' IS NOT NULL AND btrim(e.evidence ->> 'group') <> ''
   GROUP BY e.org_id, lower(btrim(e.evidence ->> 'group'));

  INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
  SELECT 'org:' || o.id, 'dept:' || o.dept, 'located_in',
         COALESCE(o.valid_from, o.created_at), o.valid_to, '{}'::jsonb
    FROM org o
   WHERE o.id = ANY (v_na_referents) AND o.dept IS NOT NULL AND btrim(o.dept) <> '';

  INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
  SELECT 'org:' || o.id, 'domain:' || lower(btrim(o.domain)), 'owns_domain',
         COALESCE(o.valid_from, o.created_at), o.valid_to, '{}'::jsonb
    FROM org o
   WHERE o.id = ANY (v_na_referents) AND o.domain IS NOT NULL AND btrim(o.domain) <> '';

  WITH hosts AS (
    SELECT e.id,
           lower(regexp_replace(
             regexp_replace(
               regexp_replace(btrim(e.source_url), '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''),
               '[/:?#].*$', ''),
             '^www\.', '')) AS host,
           COALESCE(e.observed_at, e.collected_at, e.created_at, now()) AS at
      FROM event e WHERE e.source_url IS NOT NULL AND btrim(e.source_url) <> ''
  )
  INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
  SELECT 'event:' || h.id, 'domain:' || h.host, 'published_on', h.at, NULL, '{}'::jsonb
    FROM hosts h
   WHERE h.host ~ '^[a-z0-9.-]+\.[a-z]{2,}$'
     AND h.host NOT LIKE '.%' AND h.host NOT LIKE '%..%';

  INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
  SELECT 'event:' || e.id,
         'product:' || lower(btrim(e.evidence ->> 'vendor')) || ':' || lower(btrim(e.evidence ->> 'product')),
         'mentions_product',
         COALESCE(e.observed_at, e.collected_at, e.created_at, now()), NULL, '{}'::jsonb
    FROM event e
   WHERE e.evidence ->> 'vendor' IS NOT NULL AND btrim(e.evidence ->> 'vendor') <> ''
     AND e.evidence ->> 'product' IS NOT NULL AND btrim(e.evidence ->> 'product') <> '';

  INSERT INTO graph_relation (source_id, target_id, type, valid_from, valid_to, evidence)
  SELECT 'product:' || lower(btrim(e.evidence ->> 'vendor')) || ':' || lower(btrim(e.evidence ->> 'product')),
         'vendor:' || lower(btrim(e.evidence ->> 'vendor')),
         'produced_by',
         min(COALESCE(e.observed_at, e.collected_at, e.created_at)), NULL, '{}'::jsonb
    FROM event e
   WHERE e.evidence ->> 'vendor' IS NOT NULL AND btrim(e.evidence ->> 'vendor') <> ''
     AND e.evidence ->> 'product' IS NOT NULL AND btrim(e.evidence ->> 'product') <> ''
   GROUP BY 1, 2;

  IF to_regclass('public.dns_domaine') IS NOT NULL
     AND to_regclass('public.dns_snapshot') IS NOT NULL THEN
    WITH resolutions AS (
      SELECT lower(btrim(s.domain)) AS domain, s.addr AS addr, s.observed_at,
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
    SELECT DISTINCT ('org:' || x.org_id::text)::text,
           ('domain:' || lower(btrim(d.domain)))::text,
           'dns_link', d.first_seen::timestamptz, NULL::timestamptz, '{}'::jsonb
      FROM dns_domaine d
      CROSS JOIN LATERAL unnest(d.org_ids) AS x(org_id)
     WHERE x.org_id = ANY (v_na_referents)
       AND EXISTS (SELECT 1 FROM graph_entity ge WHERE ge.id = 'org:' || x.org_id::text)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION refresh_temporal_graph_complete() IS
  'Rebuild the complete temporal graph from measured facts (Nouvelle-Aquitaine scope).';

COMMIT;
