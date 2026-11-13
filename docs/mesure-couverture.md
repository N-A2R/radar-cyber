# Mesure de couverture

La seule question qui justifie le projet :

> Sur les incidents publics de Nouvelle-Aquitaine des douze derniers mois,
> quelle part le radar a-t-il vue ?

Mesure du **13 novembre 2026**, fenêtre `2025-11-01 → 2026-10-31`, corpus de
20 incidents publics vérifiés sur pièces.

## Le résultat, sans arrangement

```
Couverture : 5/15 (33,3 %)
  non admis              0
  non rattachés         10
    dont 9 organisations absentes du référentiel
    dont 1 présente mais non reconnue par le moteur
Référentiel entreprises : 0 ligne en agroalimentaire, industrie, BTP, commerce
```

Ce que le radar voit — les cinq collectivités moyennes, nommées dans le texte
avec un rôle explicite :

| Incident | Organisation trouvée |
| --- | --- |
| Mairie de Marennes-Hiers-Brouage | Commune de Marennes-Hiers-Brouage |
| Ville de Tarnos | Commune de Tarnos |
| Mairie d'Espelette | Commune de Espelette |
| EHPAD Résidence du Parc de Champdeniers | EHPAD RESIDENCE DU PARC |
| Ville de Gradignan — police municipale | Commune de Gradignan |

## Ce qu'il ne voit pas, et pourquoi

**Neuf organisations ne sont pas au référentiel.** Ce n'est pas un défaut du
moteur, c'est un trou de données :

| Incident | Pourquoi elle manque |
| --- | --- |
| Intermarché d'Altillac, magasins de Béarn | grande distribution, absente du bloc 2 |
| Vignobles Toutigeac, SICSOE | viticulture et logistique viticole, non collectées |
| Bordeaux Sciences Agro | école d'ingénieurs publique, hors annuaire scolaire |
| Fédération Nationale des Chasseurs, FFC | associations nationales |
| Delicity | start-up de livraison, hors périmètre numérique |
| Euskal Moneta | association de monnaie locale |

**Une organisation est présente mais non reconnue** : `YMED` est en base
(entreprise de numérique, Gironde), mais son nom tient en un seul mot. Le
gazetteer refuse de trancher sur un alias mono-jeton — règle posée parce qu'un
mot seul est un lieu ou une marque, pas une preuve. « Ymed » relève donc de la
revue, pas du rattachement automatique.

## Ce que la mesure change dans la feuille de route

Le goulot n'est **pas** le moteur de rattachement. Il est à 0 faux positif et
ne rate qu'un cas sur dix pour une raison assumée.

Le goulot est **le référentiel** : 13 332 entreprises, dont 13 035 en numérique,
et **zéro** en agroalimentaire, industrie, construction et commerce — les
secteurs les plus rançonnés de la région. Tant que ce trou existe, tout taux de
couverture est flatteur par construction : le radar ne peut pas manquer ce dont
il ignore l'existence.

## Méthode

- Chaque incident du corpus est transformé en événement normalisé et passé à la
  **porte d'admission du contrat** (`contract/admit.ts`), la même que
  l'ingestion.
- Le texte traverse le **gazetteer réel** sur les 34 330 organisations.
- Aucun refus n'est une case vide : tout est motivé (`pas_admis`,
  `pas_rattache`, `absent_du_referentiel`, `au_referentiel_mais_non_reconnu`).

**Limite assumée** : la mesure évalue la capacité à reconnaître un incident
publié, pas le délai réel de collecte. Une source publiée avec trois jours de
retard sur l'événement n'est pas pénalisée ici.

## Reproductible

```bash
pnpm tsx scripts/mesure-couverture.mts                        # affiche
pnpm tsx scripts/mesure-couverture.mts --json=out.json        # publie
```

Corpus : `bench/fixtures/corpus-reference-na.json` (versionné).
Résultat : `bench/results/couverture-2026-11-13.json` (publié).
