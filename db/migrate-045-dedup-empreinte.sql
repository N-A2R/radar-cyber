-- 045 : empreinte d'article = titre normalisé + jour UTC + source.
--
-- La clé `feed:<sha256(titre)>` (migration 039) échoue dès que le même article
-- revient avec une casse, des espaces ou des accents différents : la clé change
-- et l'événement est réécrit. L'empreinte porte l'identité réelle d'un article,
-- calculée de la même façon côté SQL et côté TypeScript (generic.ts) :
--   minuscules, accents retirés, ponctuation réduite à un espace, puis
--   `|` + jour UTC de `observed_at` + `|` + identifiant de source.
--
-- La colonne reste nullable : les autres voies d'écriture (Hermès, revue,
-- quarantaine) ont leur propre clé et ne portent pas d'empreinte. Seuls les
-- événements de flux, qui écrivent explicitement cette colonne, sont uniques.
-- Les doublages historiques de flux sont purgés (les plus anciens restent) ;
-- ils redeviennent collectables, comme en 039.

ALTER TABLE event ADD COLUMN IF NOT EXISTS fingerprint text;

UPDATE event
   SET fingerprint = btrim(regexp_replace(
         translate(lower(title),
           'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ',
           'aaaaaaceeeeiiiinoooooouuuuyy'),
         '[^a-z0-9]+', ' ', 'g'))
     || '|' || COALESCE(
       lpad(extract(year from (observed_at AT TIME ZONE 'UTC'))::text, 4, '0') || '-' ||
       lpad(extract(month from (observed_at AT TIME ZONE 'UTC'))::text, 2, '0') || '-' ||
       lpad(extract(day from (observed_at AT TIME ZONE 'UTC'))::text, 2, '0'),
       'sans-date')
     || '|' || source_id
 WHERE dedup_key LIKE 'feed:%'
   AND fingerprint IS NULL;

DELETE FROM event e
 USING event older
 WHERE older.id < e.id
   AND older.fingerprint = e.fingerprint;

CREATE UNIQUE INDEX IF NOT EXISTS event_fingerprint_key
  ON event (fingerprint)
 WHERE fingerprint IS NOT NULL;
