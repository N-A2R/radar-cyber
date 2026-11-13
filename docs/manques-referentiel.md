# Le trou du référentiel, en liste de courses

> Chantier 13. Mesuré le 13 novembre 2026 sur la base de reprise
> (34 342 organisations). Reproductible :
> `tsx scripts/load-manques-exa.mts` puis `tsx scripts/mesure-manques.mts`.

## Ce qui a changé

Avant ce jour, le référentiel comptait **34 330 organisations et aucune ne
portait de domaine**. Le moteur de rattachement a une règle qui vaut certitude
— domaine identique, confiance 0,95 — et elle ne pouvait jamais se déclencher.
Tout incident retombait sur la comparaison de noms.

Les 302 entités manquantes avaient déjà été qualifiées par Exa (17,60 $ pour
la passe Ultra, 1,10 $ pour les onze lots à `medium`). Restait à les charger.

## Ce que le chargement a donné

| | |
|---|---|
| Entités qualifiées | 302 |
| Chargeables en l'état | **12** |
| En désaccord entre les deux passes Exa | 21 |
| « present » sans SIREN exploitable | 7 |
| **Chargées** | **12** |
| Organisations avant / après | 34 330 → **34 342** |
| Organisations avec domaine | 0 → **12** |

Les 21 désaccords ne sont pas chargés. Sept d'entre eux ont été tranchés à la
main par la passe Ultra (AFD → `afd-inc.com`, ASI → `asipartner.com`,
Transtec → `transtec.com.co`, ilemgroup, Funlab, Reward) ; les quatorze autres
attendent un arbitrage humain. **Aucun SIREN n'a été inventé** : une entité dont
l'identifiant n'est pas établi reste sans identifiant.

## Le trou résiduel, publié

**290 entités sur 302 restent absentes** après chargement. Elles sont hors de
portée du référentiel actuel, et c'est ce chiffre-là qui compte : charger 12
entités ne referme pas un trou de 302.

La liste complète, triée par zone, est produite par
`scripts/mesure-manques.mts`. Ce qu'elle montre, sans interprétation :

- **245 entités sur 290 n'ont aucun département identifiable** — ni en
  Nouvelle-Aquitaine ni ailleurs. On sait qu'elles manquent, on ne sait pas
  où les chercher ;
- les 45 autres portent une zone, et cette zone est très majoritairement
  étrangère ou hors région : États américains (Texas, Utah, Oregon,
  Pennsylvanie…), provinces canadiennes (Ontario, Québec), comtés anglais,
  Paris, Rhône.

Le trou n'est donc pas un trou *régional* qu'on pourrait refermer avec un
extrait supplémentaire du répertoire Sirene. Pour 245 des 290 entités, il
n'existe même pas de clé géographique pour lancer la recherche.

## Ce que ça change pour la mesure de couverture

Mesuré après chargement : la couverture reste **5/15 (33,3 %)**, à l'identique,
et la ligne « référentiel entreprises : 0 en agroalimentaire, industrie, BTP,
commerce » est inchangée. Les 12 entités chargées ne recoupent aucun incident
du corpus de référence.

C'est la conclusion du chantier : **le référentiel entreprises manque là où
la région est faite de petites structures**, et les 302 entités qualifiées par
Exa ne sont pas la bonne réponse à ce problème. Elles referment un autre trou.
