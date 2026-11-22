-- 205 : réancrage du 2026-11-13, ancré sur des bornes fausses.
--
-- L'ancre du 2026-11-13 a été écrite par `anchor.ts` avant le correctif du
-- 22/11 : la requête triait `id::text` (alias texte), donc l'ordre était
-- lexicographique et non numérique. Le jour chevauche la bascule 99999→100000
-- et deux jours ont été touchés différemment :
--   * 2026-11-20 a échoué (bornes inversées, contrainte respectée) et a été
--     réancré correctement par le code corrigé ;
--   * 2026-11-13 a été ancré « avec succès » mais sur `fin = 9999` au lieu de
--     48429, avec une racine Merkle calculée dans le désordre : `verifierJour`
--     échoue dessus. Une ancre fausse est pire qu'une ancre absente : elle
--     atteste d'un état qui n'a jamais existé.
--
-- Le tableau est append-only par trigger. Cette correction est donc une
-- **opération d'opérateur explicite**, tracée ici : on retire la seule ligne
-- corrompue, dans une transaction qui désactive le trigger le temps d'une
-- instruction, puis on le rétablit. Le service réancre le jour au démarrage
-- suivant (rattrapage borné à 7 jours) — avec les bornes et la racine justes.
--
-- Vérification après réancrage :
--   select jour, journal_debut_id, journal_fin_id, journal_lignes
--     from journal_anchor where jour = '2026-11-13';
--   attendu : debut = 1, fin = 48429, lignes = 48429

BEGIN;

ALTER TABLE journal_anchor DISABLE TRIGGER journal_anchor_no_update;

DELETE FROM journal_anchor
WHERE jour = '2026-11-13'
  AND journal_fin_id <> 48429;

ALTER TABLE journal_anchor ENABLE TRIGGER journal_anchor_no_update;

COMMIT;
