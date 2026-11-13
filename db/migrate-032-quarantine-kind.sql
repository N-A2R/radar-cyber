-- 032 : distinguer un fait à trancher d'un corps illisible.
--
-- Deux choses très différentes atterrissaient dans `quarantine_raw` avec le
-- même statut `pending`, donc dans la même file humaine :
--
--   * `claim`      — une revendication lue, mais non rattachée : du travail ;
--   * `unparsable` — le corps d'une page que le parseur n'a pas su lire : un bug.
--
-- Un analyste ne pouvait pas les distinguer. 16 235 lignes dormaient, dont une
-- part n'était pas du travail mais des sources cassées.

ALTER TABLE quarantine_raw
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'claim';

ALTER TABLE quarantine_raw
  DROP CONSTRAINT IF EXISTS quarantine_raw_kind_check;

ALTER TABLE quarantine_raw
  ADD CONSTRAINT quarantine_raw_kind_check CHECK (kind IN ('claim','unparsable'));

-- Reprise : un corps illisible n'a ni indice d'organisation ni champs extraits.
UPDATE quarantine_raw
   SET kind = 'unparsable'
 WHERE kind = 'claim'
   AND org_hint IS NULL
   AND COALESCE(extracted, '{}'::jsonb) = '{}'::jsonb;

-- La file de revue ne lit que les faits : cet index la sert directement.
CREATE INDEX IF NOT EXISTS idx_quarantine_review
  ON quarantine_raw (status, kind, claimed_at DESC);

COMMENT ON COLUMN quarantine_raw.kind IS
  'claim = fait lu à trancher ; unparsable = corps que le parseur n''a pas su lire (bug de source)';
