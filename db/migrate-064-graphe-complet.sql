-- Migration 064 : complete Nouvelle-Aquitaine graph (read-only projection).
--
-- A single view exposes every measured relation as a typed edge:
--   graph_complet_edge(source_id, target_id, type, evidence)
--
-- Nodes are opaque identifiers (org:<id>, domain:<name>, ip:<addr>, asn:<n>,
-- host:<fqdn>, cert:<id>, incident:<id>, ...). No victim names, event titles,
-- aliases in clear text or other personal data are ever materialised here.
--
-- Every branch is derived from a field that actually exists in the database.
-- Only Nouvelle-Aquitaine departments (INSEE 16, 17, 19, 23, 24, 33, 40, 47,
-- 64, 79, 86, 87) are accepted for organisation-scoped relations. Events are
-- accepted when flagged regional or when attached to a regional organisation.
-- Incident rows must be flagged `na`. Nothing is inferred at query time.

BEGIN;

-- One real infrastructure observation measured by the source health probe
-- (bench/results/sources-sonde-vague3.json, source feodo-ip, 2026-11-21).
-- It is the only ASN/hoster anchor available offline; no external service is
-- contacted and no victim data is involved.
CREATE TABLE IF NOT EXISTS graph_complet_asn_observation (
  source_id   text PRIMARY KEY,
  ip          text NOT NULL,
  asn         text NOT NULL,
  hoster      text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO graph_complet_asn_observation (source_id, ip, asn, hoster, observed_at)
VALUES ('feodo-ip', '162.243.103.246', 'AS14061', 'DIGITALOCEAN-ASN', '2026-11-21T01:19:40.925Z')
ON CONFLICT (source_id) DO NOTHING;

CREATE OR REPLACE VIEW graph_complet_edge AS
-- Organisations -> administrative and territorial anchors.
SELECT ('org:' || o.id::text)::text AS source_id, ('dept:' || o.dept)::text AS target_id,
       'located_in'::text AS type, '{}'::jsonb AS evidence
  FROM org o WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
UNION ALL
SELECT ('org:' || o.id::text)::text, ('city:' || lower(btrim(o.city)))::text,
       'located_in_city'::text, '{}'::jsonb
  FROM org o
 WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND o.city IS NOT NULL AND btrim(o.city) <> ''
UNION ALL
SELECT ('org:' || o.id::text)::text, ('sector:' || btrim(o.secteur_groupe))::text,
       'in_sector'::text, '{}'::jsonb
  FROM org o
 WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND o.secteur_groupe IS NOT NULL AND btrim(o.secteur_groupe) <> ''
UNION ALL
SELECT ('org:' || o.id::text)::text, ('kind:' || o.kind)::text,
       'has_kind'::text, '{}'::jsonb
  FROM org o
 WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND o.kind IS NOT NULL
UNION ALL
SELECT ('org:' || o.id::text)::text,
       ('effectif:' || CASE WHEN o.effectif_min < 10 THEN 'micro'
                            WHEN o.effectif_min < 50 THEN 'small' ELSE 'large' END)::text,
       'has_effectif_band'::text, '{}'::jsonb
  FROM org o
 WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND o.effectif_min IS NOT NULL
UNION ALL
SELECT ('org:' || o.id::text)::text, ('siren:' || btrim(o.siren))::text,
       'identified_by'::text, '{}'::jsonb
  FROM org o
 WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND o.siren IS NOT NULL AND btrim(o.siren) <> ''
UNION ALL
-- `entity_code` is a distinct SIRENE field; 4 293 rows differ from `siren`.
SELECT ('org:' || o.id::text)::text, ('registration:' || btrim(o.entity_code))::text,
       'has_registration_id'::text, '{}'::jsonb
  FROM org o
 WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND o.entity_code IS NOT NULL AND btrim(o.entity_code) <> ''
UNION ALL
SELECT ('org:' || o.id::text)::text, ('org:' || o.parent_org_id::text)::text,
       'subsidiary_of'::text, '{}'::jsonb
  FROM org o
 WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND o.parent_org_id IS NOT NULL
UNION ALL
SELECT ('org:' || o.id::text)::text, ('domain:' || lower(btrim(o.domain)))::text,
       'owns_domain'::text, '{}'::jsonb
  FROM org o
 WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND o.domain IS NOT NULL AND btrim(o.domain) <> ''
UNION ALL
-- Aliases are hashed: the graph never exposes a possibly personal name.
SELECT ('org:' || a.org_id::text)::text, ('alias:' || md5(lower(btrim(a.alias))))::text,
       'has_alias'::text, jsonb_build_object('source', a.source)
  FROM org_alias a JOIN org o ON o.id = a.org_id
 WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND a.alias IS NOT NULL AND btrim(a.alias) <> ''
UNION ALL
SELECT ('org:' || x.org_id::text)::text, ('domain:' || lower(btrim(x.valeur)))::text,
       'owns_domain'::text, jsonb_build_object('source', x.source)
  FROM org_enrichissement x JOIN org o ON o.id = x.org_id
 WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND x.champ = 'domaine' AND x.valeur IS NOT NULL AND btrim(x.valeur) <> ''
UNION ALL
-- Explicit, reviewed organisation relations.
SELECT ('org:' || r.src_id::bigint::text)::text, ('org:' || r.dst_id::bigint::text)::text,
       r.relation_type::text, COALESCE(r.evidence, '{}'::jsonb)
  FROM relation r
 WHERE r.src_kind = 'org' AND r.dst_kind = 'org'
   AND r.src_id ~ '^[0-9]+$' AND r.dst_id ~ '^[0-9]+$'
   AND EXISTS (SELECT 1 FROM org o WHERE o.id = r.src_id::bigint
                AND o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87'))
UNION ALL
-- Certificate transparency: domain -> host -> certificate -> issuer.
SELECT ('domain:' || lower(btrim(c.domaine)))::text, ('host:' || lower(btrim(c.sous_domaine)))::text,
       'has_host'::text, jsonb_build_object('source', c.source)
  FROM ct_sous_domaine c
 WHERE c.domaine IS NOT NULL AND c.sous_domaine IS NOT NULL
   AND btrim(c.domaine) <> '' AND btrim(c.sous_domaine) <> ''
UNION ALL
SELECT ('host:' || lower(btrim(c.sous_domaine)))::text, ('cert:' || c.certificat_id::text)::text,
       'signed_by'::text, jsonb_build_object('source', c.source)
  FROM ct_sous_domaine c WHERE c.certificat_id IS NOT NULL
UNION ALL
SELECT ('cert:' || c.certificat_id::text)::text, ('issuer:' || md5(lower(btrim(c.emetteur))))::text,
       'issued_by'::text, '{}'::jsonb
  FROM ct_sous_domaine c
 WHERE c.emetteur IS NOT NULL AND btrim(c.emetteur) <> ''
UNION ALL
-- DNS: domain -> resolved address, and domain -> identified hosting provider.
SELECT ('domain:' || lower(btrim(s.domain)))::text, ('ip:' || ip.addr)::text,
       'resolves_to'::text, jsonb_build_object('observedAt', s.observed_at)
  FROM dns_snapshot s
 CROSS JOIN LATERAL unnest(COALESCE(s.a, '{}'::text[]) || COALESCE(s.aaaa, '{}'::text[])) AS ip(addr)
 WHERE ip.addr IS NOT NULL AND btrim(ip.addr) <> '' AND ip.addr ~ '^[0-9A-Fa-f:.]+$'
UNION ALL
SELECT ('domain:' || lower(btrim(s.domain)))::text, ('provider:' || f.name)::text,
       'hosted_by'::text, jsonb_build_object('mode', f.mode)
  FROM dns_snapshot s
 CROSS JOIN LATERAL unnest(COALESCE(s.mx, '{}'::text[]) || COALESCE(s.ns, '{}'::text[])) AS rec(addr)
 JOIN dns_fournisseur f ON lower(btrim(rec.addr)) = lower(f.suffix)
                        OR lower(btrim(rec.addr)) LIKE '%.' || lower(f.suffix)
 WHERE rec.addr IS NOT NULL AND btrim(rec.addr) <> ''
UNION ALL
-- Incidents: only rows flagged Nouvelle-Aquitaine; `victim` is never read.
SELECT ('incident:' || l.id::text)::text, ('org:' || l.org_id::text)::text,
       'affects'::text, jsonb_build_object('source', l.source)
  FROM leak_claim l WHERE l.na IS TRUE AND l.org_id IS NOT NULL
UNION ALL
SELECT ('incident:' || l.id::text)::text, ('group:' || lower(btrim(l.group_name)))::text,
       'claimed_by'::text, '{}'::jsonb
  FROM leak_claim l
 WHERE l.na IS TRUE AND l.group_name IS NOT NULL AND btrim(l.group_name) <> ''
UNION ALL
-- Events regional by flag, or attached to a regional organisation.
SELECT ('event:' || e.id::text)::text, ('org:' || e.org_id::text)::text,
       'targeted_by'::text, '{}'::jsonb
  FROM event e
 WHERE e.org_id IS NOT NULL
   AND (e.regional IS TRUE OR EXISTS
        (SELECT 1 FROM org o WHERE o.id = e.org_id
          AND o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')))
UNION ALL
SELECT ('event:' || e.id::text)::text, ('source:' || e.source_id)::text,
       'reported_by'::text, '{}'::jsonb
  FROM event e
 WHERE e.source_id IS NOT NULL
   AND (e.regional IS TRUE OR EXISTS
        (SELECT 1 FROM org o WHERE o.id = e.org_id
          AND o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')))
UNION ALL
SELECT ('event:' || e.id::text)::text, ('family:' || e.family)::text,
       'in_family'::text, '{}'::jsonb
  FROM event e
 WHERE e.family IS NOT NULL
   AND (e.regional IS TRUE OR EXISTS
        (SELECT 1 FROM org o WHERE o.id = e.org_id
          AND o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')))
UNION ALL
SELECT ('event:' || e.id::text)::text,
       ('group:' || lower(btrim(e.evidence ->> 'group')))::text,
       'attributed_to'::text, '{}'::jsonb
  FROM event e
 WHERE e.evidence ->> 'group' IS NOT NULL AND btrim(e.evidence ->> 'group') <> ''
   AND (e.regional IS TRUE OR EXISTS
        (SELECT 1 FROM org o WHERE o.id = e.org_id
          AND o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')))
UNION ALL
-- Asset table is an optional extension (empty in the current corpus): it
-- already models domain / subdomain / ip / ip_range / asn / url assets.
SELECT ('org:' || a.org_id::text)::text, (a.kind || ':' || lower(btrim(a.value)))::text,
       'owns_asset'::text, '{}'::jsonb
  FROM asset a
 WHERE a.org_id IS NOT NULL AND a.value IS NOT NULL AND btrim(a.value) <> ''
   AND EXISTS (SELECT 1 FROM org o WHERE o.id = a.org_id
                AND o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87'))
UNION ALL
-- Offline ASN/hoster anchor measured on a source used by the regional radar.
SELECT ('source:' || x.source_id)::text, ('ip:' || x.ip)::text,
       'observed_address'::text, jsonb_build_object('observedAt', x.observed_at)
  FROM graph_complet_asn_observation x
UNION ALL
SELECT ('ip:' || x.ip)::text, ('asn:' || x.asn)::text,
       'belongs_to'::text, '{}'::jsonb
  FROM graph_complet_asn_observation x
UNION ALL
SELECT ('asn:' || x.asn)::text, ('hoster:' || x.hoster)::text,
       'operated_by'::text, '{}'::jsonb
  FROM graph_complet_asn_observation x;

COMMIT;
