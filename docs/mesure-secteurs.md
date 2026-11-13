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


---

## La réserve ne suffisait pas : un intervalle dit combien

Le seuil de 10 faits produisait un verdict binaire — « réserve » ou « taux » —
qui laissait un secteur à 4 faits sans aucune information. Or la Nouvelle-
Aquitaine ne produit pas 10 incidents publics par secteur en douze mois :
mesuré sur 23 incidents, **2 en santé, 2 en enseignement**. Exiger 10 par
secteur demande cinq ans de données.

Le taux est donc désormais toujours calculé, accompagné d'un **intervalle de
confiance à 95 % (Wilson)**, et la réserve reste comme avertissement :

| Secteur | Faits | Vus | Rappel | Intervalle 95 % |
| --- | --- | --- | --- | --- |
| entreprise | 7 | 2 | 29 % | 8 – 64 % |
| collectivité | 4 | 4 | 100 % | 51 – 100 % |
| santé | 2 | 2 | 100 % | 34 – 100 % |
| enseignement | 1 | 1 | 100 % | 21 – 100 % |

Ce que ça dit, sans détour : le référentiel voit bien les collectivités
(4 sur 4), et **on ne sait presque rien** des trois autres secteurs. Un
intervalle de 8 – 64 % pour les entreprises n'est pas un résultat, c'est une
fourchette — mais une fourchette honnête vaut mieux qu'une case vide.

Wilson plutôt que l'intervalle normal : sur de petits effectifs et des taux
proches de 0 ou 1, l'intervalle normal donne des bornes négatives ou
supérieures à 100 %.
