-- 039 : un article est un événement, pas un événement par flux.
--
-- La clé de dédoublement des flux était `feed:<source>:<empreinte du lien>`.
-- Deux défauts mesurés sur D0 :
--
--   * les douze flux départementaux reprennent les mêmes dépêches, donc le
--     même article entrait jusqu'à douze fois ;
--   * Google News sert la même dépêche sous une URL différente selon la
--     requête, donc l'empreinte du lien ne suffisait pas non plus — huit
--     copies du même titre ont été observées.
--
-- L'identité d'un article est son titre. La clé devient `feed:<empreinte du
-- titre>`, et les événements de flux déjà écrits sont purgés : ils sont
-- re-collectables, et un fil qui contient huit fois la même dépêche n'est pas
-- un fil.

DELETE FROM event
 WHERE dedup_key LIKE 'feed:%'
   AND family = 'cti';
