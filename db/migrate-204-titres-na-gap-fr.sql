-- 204 : les revendications `na-gap` s'écrivent en français.
--
-- Ces événements ne viennent pas d'un collecteur du dépôt : ils sont écrits par
-- la voie d'ingestion externe `na-remaining-gap`, qui produisait un gabarit
-- anglais (« Third-party ransomware claim referencing a Nouvelle-Aquitaine
-- organization (department 16) »). Le titre est affiché tel quel dans le fil,
-- le détail, la recherche et Aujourd'hui : on corrige donc la donnée source,
-- pas l'affichage — traduire à l'affichage abîmerait les vrais titres anglais
-- des sources (NVD, RansomLook, Telegram).
--
-- Idempotent : ne touche que les titres encore au gabarit anglais, conserve le
-- numéro de département. Réversible (voir le bloc en fin de fichier).

UPDATE event
SET title = replace(
      title,
      'Third-party ransomware claim referencing a Nouvelle-Aquitaine organization (department ',
      'Revendication de rançongiciel par un tiers visant une organisation de Nouvelle-Aquitaine (département '
    )
WHERE dedup_key LIKE 'na-%-gap:%'
  AND title LIKE 'Third-party ransomware claim %(department %';

-- Retour arrière, à jouer à la main si besoin :
--
-- UPDATE event
-- SET title = replace(
--       title,
--       'Revendication de rançongiciel par un tiers visant une organisation de Nouvelle-Aquitaine (département ',
--       'Third-party ransomware claim referencing a Nouvelle-Aquitaine organization (department '
--     )
-- WHERE dedup_key LIKE 'na-%-gap:%'
--   AND title LIKE 'Revendication de rançongiciel par un tiers%';
