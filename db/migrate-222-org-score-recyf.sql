-- Indice ReCyF par collectivité.
--
-- La maturité affichée n'est pas un score maison : elle est transposée du
-- référentiel national ANSSI (source EXTERNE, jamais présentée comme une source
-- locale du radar) selon une méthode datée et empreintée. Aucune certification
-- ANSSI n'est revendiquée : l'indice est un indicateur public non certificatif.
--
-- Méthode (empreinte SHA-256 ci-dessous) :
--   index = 1 - somme(max(0, severite - 1)) / (3 * nombre d'evenements), borne [0,1]
--   confiance = min(0.99, 0.5 + 0.1 * min(5, nombre d'evenements))
--
-- Ce script est rejouable : les lignes ReCyF sont recalculées à chaque migration.

CREATE TABLE IF NOT EXISTS org_score (
  org_id     integer PRIMARY KEY REFERENCES org(id) ON DELETE CASCADE,
  score      double precision NOT NULL CHECK (score >= 0 AND score <= 1),
  services   integer NOT NULL DEFAULT 0,
  confirmees integer NOT NULL DEFAULT 0,
  criticite  double precision NOT NULL DEFAULT 0 CHECK (criticite >= 0),
  regle      text NOT NULL DEFAULT 'ctem-priorite@1',
  calcule_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_score_check CHECK (confirmees >= 0 AND confirmees <= services)
);

ALTER TABLE org_score ADD COLUMN IF NOT EXISTS referentiel text;
ALTER TABLE org_score ADD COLUMN IF NOT EXISTS methode_sha256 text;
ALTER TABLE org_score ADD COLUMN IF NOT EXISTS confidence double precision;
ALTER TABLE org_score ADD COLUMN IF NOT EXISTS formule text;
ALTER TABLE org_score ADD COLUMN IF NOT EXISTS methode text;

-- Les scores historiques restent lisibles sous leur propre référentiel.
UPDATE org_score
   SET referentiel = CASE WHEN regle LIKE 'ReCyF%' THEN 'ReCyF-2.5' ELSE 'ctem-priorite@1' END
 WHERE referentiel IS NULL;

-- Une organisation peut porter plusieurs scores (CTEM, ReCyF) : la clé primaire
-- historique sur org_id seul est remplacée par le couple (org_id, referentiel).
ALTER TABLE org_score DROP CONSTRAINT IF EXISTS org_score_pkey;
DO $recyf$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'org_score'::regclass
       AND contype = 'p'
       AND conkey = ARRAY[
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'org_score'::regclass AND attname = 'org_id' AND NOT attisdropped),
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'org_score'::regclass AND attname = 'referentiel' AND NOT attisdropped)
           ]::smallint[]
  ) THEN
    ALTER TABLE org_score ADD CONSTRAINT org_score_pkey PRIMARY KEY (org_id, referentiel);
  END IF;
END
$recyf$;

CREATE INDEX IF NOT EXISTS org_score_referentiel_idx ON org_score (referentiel);

INSERT INTO org_score
  (org_id, score, services, confirmees, criticite, regle, referentiel,
   methode_sha256, confidence, formule, methode, calcule_le)
SELECT e.org_id,
       LEAST(1, GREATEST(0,
         1 - SUM(GREATEST(0, e.severity::numeric - 1)) / (3 * COUNT(*))::numeric
       ))::double precision,
       COUNT(*)::integer,
       COUNT(*) FILTER (WHERE e.confidence IS NOT NULL)::integer,
       SUM(GREATEST(0, e.severity::numeric - 1))::double precision,
       'ReCyF-2.5@1',
       'ReCyF-2.5',
       '2683a397fbbf87d4dea6eb920b20c21eb4ffe39ec5f273dc5dcb3c5ee0cd6ed6',
       LEAST(0.99, 0.5 + 0.1 * LEAST(5, COUNT(*))::numeric)::double precision,
       'index = clamp(1 - sum(max(0, severite-1)) / (3*nb_evenements), 0, 1) ; confiance = min(0.99, 0.5 + 0.1*min(5, nb_evenements)) ; reference ANSSI : source nationale externe, transposition non certificative ; methode datee 2026-11-23',
       'ReCyF-2.5 ; method dated 2026-11-23 ; national reference ANSSI (external source, not a local radar source) ; public non-certifying transposition of ANSSI hygiene guidance ; index = 1 - sum(max(0, severity-1)) / (3 * event_count), clamped to [0,1] ; severity scale 1-4 ; confidence = min(0.99, 0.5 + 0.1 * min(5, event_count)) ; no personal data, no secret, no ANSSI certification claimed',
       now()
  FROM event e
  JOIN org o ON o.id = e.org_id AND o.kind = 'collectivite'
 GROUP BY e.org_id
ON CONFLICT (org_id, referentiel) DO UPDATE SET
  score = EXCLUDED.score,
  services = EXCLUDED.services,
  confirmees = EXCLUDED.confirmees,
  criticite = EXCLUDED.criticite,
  regle = EXCLUDED.regle,
  methode_sha256 = EXCLUDED.methode_sha256,
  confidence = EXCLUDED.confidence,
  formule = EXCLUDED.formule,
  methode = EXCLUDED.methode,
  calcule_le = EXCLUDED.calcule_le;

COMMENT ON COLUMN org_score.referentiel IS
  'Référentiel de la note : ReCyF-2.5 (transposition publique du référentiel national ANSSI) ou règle historique.';
COMMENT ON COLUMN org_score.methode_sha256 IS
  'Empreinte SHA-256 du texte de méthode daté, identique dans le code et dans la migration.';
COMMENT ON COLUMN org_score.confidence IS
  'Confiance de l indicateur au regard du nombre d evenements publics observes.';
COMMENT ON COLUMN org_score.formule IS
  'Formule explicite de calcul du score, reproduite dans le CSV exporté.';
