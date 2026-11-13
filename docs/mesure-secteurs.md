# Mesure par secteur — chantier 7

Résultat du script `scripts/mesure-secteurs.mts` sur la base vivante (34 330 organisations).

| Secteur | Faits | Vus | Rappel | Précision |
|---|---|---|---|---|
| entreprise | 6 | 0 | réserve (6) | réserve (6) |
| collectivite | 4 | 4 | réserve (4) | réserve (4) |
| sante | 1 | 1 | réserve (1) | réserve (1) |
| enseignement | 1 | 0 | réserve (1) | réserve (1) |

Réconciliation : corpus total 20 incidents ; hors fenêtre 5 ; hors secteur (`entiteType: "autre"`) 3 ; mesurés 15 ; répartis en secteurs 12. La ligne `autre` n'a pas de taux : ces incidents ne se rattachent pas à un secteur d'activité du référentiel.

Conclusion honnête : tous les secteurs sont en réserve (sous 10 faits). Le corpus est trop mince pour mesurer par secteur ; il faudrait au moins 10 faits par secteur (donc ~40 au total au minimum) pour que la réserve tombe. C'est le résultat du chantier, pas un échec à masquer. Le global (5/15 = 33 %) cachait que l'entreprise — secteur le plus peuplé du référentiel — est à 0 % sur ce corpus.
