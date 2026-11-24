-- 217 — Certificat d'ignorance par organisation.
--
-- Un score de couverture répond « combien », mais pas « qu'est-ce qu'on ne
-- sait pas ? ». Cette table consigne, pour chaque organisation, les facettes
-- pour lesquelles le radar n'a AUCUNE preuve : domaine déclaré, actif rattaché,
-- événement rattaché, certificat TLS observé, localisation, identifiant légal,
-- secteur, code postal, alias, historique, contact public. Une ligne = un champ explicitement inconnu
-- à une date donnée, pas une estimation de risque ni une affirmation sur le
-- monde extérieur.
--
-- Portée exacte, à ne jamais élargir en communication : « le radar ne détient
-- pas cette donnée », pas « cette organisation n'a pas de domaine / n'a rien
-- subi ». Les sources nationales restent des sources nationales : aucun champ
-- n'infère une portée locale, aucun contact n'est stocké (donc aucune donnée
-- personnelle). Le catalogue est auditable : `unknown_field`, `reason` et
-- `checked_at` sont écrits en clair et rejouables par la fonction ci-dessous.
--
BEGIN;

CREATE TABLE IF NOT EXISTS org_unknown (
  id            bigserial PRIMARY KEY,
  org_id        integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  unknown_field text NOT NULL,
  reason        text NOT NULL,
  source_scope  text NOT NULL DEFAULT 'radar-store-v1',
  method        text NOT NULL DEFAULT 'unknown-field-scan-v1',
  checked_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_unknown_field_nonempty CHECK (btrim(unknown_field) <> ''),
  CONSTRAINT org_unknown_reason_nonempty CHECK (btrim(reason) <> ''),
  CONSTRAINT org_unknown_unique UNIQUE (org_id, unknown_field)
);

CREATE INDEX IF NOT EXISTS org_unknown_field_idx
  ON org_unknown (unknown_field);
CREATE INDEX IF NOT EXISTS org_unknown_checked_idx
  ON org_unknown (checked_at DESC);
-- Index du critère externe : une ligne datée et nommée est une ignorance
-- auditable, pas une case cochée.
CREATE INDEX IF NOT EXISTS org_unknown_critere_idx
  ON org_unknown (org_id)
 WHERE unknown_field IS NOT NULL AND checked_at IS NOT NULL;

COMMENT ON TABLE org_unknown IS
  'Certificat d''ignorance : un état explicite, daté et rejouable des champs que le radar ne connaît pas pour chaque organisation.';
COMMENT ON COLUMN org_unknown.unknown_field IS
  'Identifiant stable de la facette inconnue (domaine, actifs, evenements, certificat_tls, ...).';
COMMENT ON COLUMN org_unknown.reason IS
  'Pourquoi la facette est inconnue : absence de preuve dans le magasin du radar, jamais affirmation sur le monde.';
COMMENT ON COLUMN org_unknown.checked_at IS
  'Date du dernier contrôle ayant conclu à l''absence de preuve.';

-- Un seul catalogue, partagé par le scan initial, les relances et les tests.
-- La condition est évaluée par organisation ; NULL est toujours traité comme
-- « inconnu », jamais comme une valeur.
CREATE OR REPLACE FUNCTION enregistrer_org_unknown(p_limit integer DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows bigint;
BEGIN
  IF p_limit IS NOT NULL AND p_limit < 0 THEN
    RAISE EXCEPTION 'limite négative interdite : %', p_limit;
  END IF;

  WITH cibles AS MATERIALIZED (
    SELECT o.id AS org_id,
           ((o.domain IS NULL OR btrim(o.domain) = '') AND
            (o.website IS NULL OR btrim(o.website) = '')) AS sans_domaine,
           NOT EXISTS (SELECT 1 FROM asset a WHERE a.org_id = o.id) AS sans_actif,
           NOT EXISTS (SELECT 1 FROM event e WHERE e.org_id = o.id) AS sans_evenement,
           NOT EXISTS (
             SELECT 1 FROM asset a
              WHERE a.org_id = o.id
                AND a.kind IN ('cert', 'certificate', 'tls')
           ) AS sans_certificat,
           (o.lat IS NULL OR o.lon IS NULL) AS sans_localisation,
           (o.siren IS NULL OR btrim(o.siren) = '') AS sans_identifiant_legal,
           (o.sector IS NULL OR btrim(o.sector) = '') AS sans_secteur,
           (o.code_postal IS NULL OR btrim(o.code_postal) = '') AS sans_code_postal,
           NOT EXISTS (SELECT 1 FROM org_alias al WHERE al.org_id = o.id) AS sans_alias,
           NOT EXISTS (SELECT 1 FROM org_history h WHERE h.org_id = o.id) AS sans_historique,
           -- Aucun champ de contact n'existe dans `org` : on consigne
           -- l'absence d'information, sans jamais stocker de donnée personnelle.
           TRUE AS sans_contact
      FROM org o
     ORDER BY o.id
     LIMIT p_limit
  ),
  champs AS (
    SELECT c.org_id, f.champ, f.motif
      FROM cibles c
      CROSS JOIN LATERAL (VALUES
        ('domaine'::text,
         'Aucun domaine ni site déclaré dans le référentiel du radar'::text,
         c.sans_domaine),
        ('actifs'::text,
         'Aucun actif rattaché à cette organisation dans le radar'::text,
         c.sans_actif),
        ('evenements'::text,
         'Aucun événement rattaché à cette organisation dans le radar'::text,
         c.sans_evenement),
        ('certificat_tls'::text,
         'Aucun certificat TLS conservé parmi les actifs du radar'::text,
         c.sans_certificat),
        ('localisation'::text,
         'Coordonnées absentes du référentiel du radar'::text,
         c.sans_localisation),
        ('identifiant_legal'::text,
         'Identifiant légal (SIREN) absent du référentiel du radar'::text,
         c.sans_identifiant_legal),
        ('secteur'::text,
         'Secteur absent du référentiel du radar'::text,
         c.sans_secteur),
        ('code_postal'::text,
         'Code postal absent du référentiel du radar'::text,
         c.sans_code_postal),
        ('alias'::text,
         'Aucun alias connu du radar pour cette organisation'::text,
         c.sans_alias),
        ('historique'::text,
         'Aucune version historisée de cette organisation dans le radar'::text,
         c.sans_historique),
        ('contact_public'::text,
         'Aucun contact public stocké : donnée personnelle jamais conservée'::text,
         c.sans_contact)
      ) AS f(champ, motif, absent)
     WHERE f.absent
  )
  INSERT INTO org_unknown (org_id, unknown_field, reason, checked_at)
  SELECT ch.org_id, ch.champ, ch.motif, now()
    FROM champs ch
  ON CONFLICT (org_id, unknown_field) DO UPDATE
     SET reason = EXCLUDED.reason,
         checked_at = EXCLUDED.checked_at,
         source_scope = EXCLUDED.source_scope,
         method = EXCLUDED.method;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION enregistrer_org_unknown(integer) IS
  'Rejouable : insère ou rafraîchit les champs inconnus de chaque organisation ; p_limit borne le nombre d''organisations examinées.';

-- La table est immédiatement éligible au contrôle : pas d'attente d'un tick
-- d'API. Relancer la migration met à jour `checked_at` sans doublon.
SELECT enregistrer_org_unknown();

COMMIT;
