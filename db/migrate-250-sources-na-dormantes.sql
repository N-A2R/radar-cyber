-- Réveil d'un petit lot de sources officielles/régionales dormantes (24/11/2026).
--
-- Constat : elles étaient `enabled`, `statut='active'`, mais sans `collector_run`
-- sur 30 jours et avec `reader=NULL` (auto). Or leurs réponses HTTP réelles,
-- conservées sous apps/api/test/fixtures/sources-na-dormantes-2026-11-24/ et
-- décrites dans bench/results/na-sources-dormantes-2026-11-24.json, sont des
-- flux RSS 2.0 bien formés : 16, 10, 20, 20 et 20 items respectivement.
--
-- Le lecteur `feed` (migration 036) rend l'intention explicite : le corps est
-- un flux, pas une page dont on devrait deviner les liens. Aucun événement
-- n'est créé ici ; l'admission reste la porte du collecteur.
BEGIN;

UPDATE source
SET reader = 'feed',
    description = COALESCE(description, '') || ' [LECTURE FEED 2026-11-24 : RSS réel vérifié, voir bench/results/na-sources-dormantes-2026-11-24.json]'
WHERE id IN (
  'corpus:sante-ars-nouvelle-aquitaine',
  'corpus:agri64-01-chambre-agriculture-pyrenees-atlantiques',
  'corpus:agri64-05-draaf-nouvelle-aquitaine',
  'corpus:agri64-03-chambre-regionale-na-agricultures-64',
  'corpus:agriculture-23-annuaire-chambres-agriculture'
)
  AND reader IS DISTINCT FROM 'feed';

-- URL réellement morte : HTTP 500 (quatre appels, dont deux timeouts), corps
-- TYPO3 « Oops, an error occurred! », 0 item. Les variantes /rss.xml et /feed
-- répondent 404, /actualites.rss timeout : aucune URL de remplacement prouvée.
-- On désactive donc avec motif explicite plutôt que de laisser une source
-- dormante donner l'illusion d'une couverture.
UPDATE source
SET enabled = false,
    disabled_at = now(),
    disabled_reason = 'HTTP 500 répété le 2026-11-24 sur https://charente.chambres-agriculture.fr/actualites-1 ; corps = page d''erreur TYPO3 sans item RSS. Variantes /actualites.rss (timeout), /rss.xml et /feed (404). Preuve : bench/results/na-sources-dormantes-2026-11-24.json'
WHERE id = 'corpus:agriculture-16-chambre-d-agriculture-de-la-charente'
  AND enabled;

COMMIT;
