-- 251 : retire l'URL de revendication des événements publics na-gap.
--
-- La voie na-gap copiait `leak_claim.evidence_url` dans `event.source_url` et
-- `event.evidence->'evidence_url'`. Or ces événements sont TLP:CLEAR et la
-- chaîne de custody publique renvoie `source_url` : une annonce isolée
-- (corroboration_score < 2, absente de `leak_claim_public`) exposait ainsi une
-- URL de victime alors qu'elle n'avait jamais franchi le filtre public.
--
-- Correctif non destructif : le lien public pointe désormais vers l'accueil de
-- la source déjà rattachée à l'événement, et la clé `evidence_url` est retirée
-- du JSON. `claim_id`, les compteurs et l'idempotence restent inchangés.
-- Idempotent : ne touche que les lignes encore concernées.
-- Aucune URL ni nom de victime n'est écrit dans ce fichier.

UPDATE event e
   SET source_url = s.url,
       evidence = e.evidence - 'evidence_url'
  FROM source s
 WHERE s.id = e.source_id
   AND (e.dedup_key LIKE 'na-gap:%' OR e.dedup_key LIKE 'na-remaining-gap:%')
   AND (e.source_url IS DISTINCT FROM s.url OR e.evidence ? 'evidence_url');
