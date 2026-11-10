-- Reclassification des sources de presse généraliste
UPDATE source
SET family = 'presse', relevance = 'context'
WHERE kind = 'narrative'
  AND (
    url ILIKE '%sudouest%' OR url ILIKE '%charentelibre%' OR
    url ILIKE '%france3%' OR url ILIKE '%francebleu%' OR
    url ILIKE '%lanouvellerepublique%' OR url ILIKE '%lamontagne%' OR
    url ILIKE '%lepopulaire%' OR url ILIKE '%ouest-france%'
  );

-- sources déjà cyber → strict
UPDATE source
SET relevance = 'strict'
WHERE relevance = 'context'
  AND kind = 'narrative'
  AND NOT (
    url ILIKE '%sudouest%' OR url ILIKE '%charentelibre%' OR
    url ILIKE '%france3%' OR url ILIKE '%francebleu%' OR
    url ILIKE '%lanouvellerepublique%' OR url ILIKE '%lamontagne%' OR
    url ILIKE '%lepopulaire%' OR url ILIKE '%ouest-france%'
  );

-- Mesure : part des événements par famille
SELECT family, count(*) AS n, round(100.0*count(*)/(SELECT count(*) FROM event),2) AS pct
FROM event GROUP BY family ORDER BY n DESC;

-- Top 20 sources narratives dont AUCUN événement ne matche un mot-clé (bruit à purger)
SELECT s.id, s.name, count(e.id) AS events
FROM source s
LEFT JOIN event e ON e.source_id = s.id
WHERE s.kind='narrative'
GROUP BY s.id,s.name
HAVING count(e.id)=0
ORDER BY s.id
LIMIT 20;

-- Les blocklists/indicateurs ne sont jamais de la presse : pertinence stricte.
UPDATE source SET relevance = 'strict' WHERE kind = 'indicator' AND relevance <> 'strict';
