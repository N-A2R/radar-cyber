# Pics de volume par famille — détection STL et backtest 180 jours

Mesure du 22 novembre 2026. Objectif : signaler les départs anormaux d'activité
d'une famille avant qu'ils ne deviennent des incidents confirmés.

**OBJECTIF : atteint — PR-AUC 0,8785 sur 20 pics annotés / cible ≥ 0,75 ;
délai médian 1 jour / cible ≤ 1.**

## Détecteur

Pour chaque famille, la série quotidienne est le compte
`count(*) FROM event GROUP BY family, date(observed_at)`, grille complète
(zéros compris). À chaque jour, sur une fenêtre glissante de **56 jours** :

1. `log1p(volume)` — une famille à 2 faits/jour et une famille à 200 faits/jour
   deviennent comparables ;
2. **STL** (Seasonal-Trend decomposition using Loess) avec période **7** :
   saison hebdomadaire, tendance lissée, reste ;
3. score = **z robuste du reste** (1,4826 × MAD de la fenêtre) ; une baisse
   n'est pas un pic ;
4. **garde-fou de fraîcheur** : si moins de la moitié des preuves du jour ont
   été collectées dans les 7 jours, le score est multiplié par **0,1**. Un lot
   d'import historique reste visible, mais ne passe plus devant une activité.

Seuil d'alerte : **z ≥ 4,5**, fixé a priori (jamais sur les étiquettes). Une
alerte du jour J est produite par le passage quotidien de J+1 ; le délai d'un
pic est donc `detected_on − peak_day`, et un pic est un vrai positif s'il est
détecté en au plus **1 jour**.

Code : `apps/api/src/detect/stl.ts` (décomposition pure),
`apps/api/src/detect/stl-peaks.ts` (notation, PR-AUC, délais),
`apps/api/src/detect/stl-backtest.ts` (backtest partagé mesure/vérification).

## Backtest 180 jours

La base de travail ne contient que quelques jours de collecte fraîche : son
historique de 180 jours est majoritairement du rattrapage, pas de l'activité.
Un backtest sur ces données mesurerait la date des imports, pas la détection.
La mesure porte donc sur une **fixture versionnée** :
`bench/stl/serie-180j.json` — 6 familles × 180 jours, saison hebdomadaire,
bruit surdispersé, **20 pics annotés** (3,8× à 6× la ligne de base) et
**4 imports historiques non annotés** (12× à 20×, collectés 12 à 25 jours
après coup). Aucun fait réel, aucune organisation, aucune donnée personnelle.

`scripts/mesure-stl-pics.mts` charge la fixture dans une table `event` dédiée
au benchmark (`stl_bench`), exécute la requête du critère avec
`search_path = stl_bench, public`, puis supprime le schéma. Les résultats sont
écrits dans `peak_annotation`, `model_eval` et `model_metric`.

## Résultat mesuré

| Indicateur | Valeur | Cible |
|---|---:|---:|
| PR-AUC (average precision) | **0,8785** | ≥ 0,75 |
| PR-AUC (trapèzes) | 0,8773 | — |
| Pics annotés | 20 | 20 |
| Pics détectés (≤ 1 j) | 15 | — |
| Faux positifs au seuil | 1 | — |
| Délai médian | **1 jour** | ≤ 1 |
| Délai moyen des tp | 1 jour | — |

Les cinq pics manqués sont les plus faibles du jeu (4 à 55 faits/jour, facteur
3,9× à 5,5×) : le z robuste les distingue mal du bruit d'une famille peu
volumineuse. C'est la limite honnête du détecteur sur les petites familles.

## Vérifier

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm verifie:stl-pics
```

Le vérificateur rejoue le backtest depuis la fixture, contrôle les 20
annotations, la PR-AUC stockée, puis exécute :

```sql
SELECT avg(delay_days) FROM model_eval WHERE model='stl' AND tp=true;
-- 1
```

Sortie brute de la mesure livrée :

```
PR-AUC (average precision) : 0.8785  (cible >= 0.75)
PR-AUC (trapèzes)          : 0.8773
pics annotés              : 20
pics détectés (<= 1 j)     : 15
faux positifs au seuil    : 1
délai médian (jours)      : 1
délai moyen des tp        : 1
avg(delay_days) = 1  (lignes tp = 15)
```

## Rejouer

```bash
# régénérer la fixture (graine fixe)
apps/api/node_modules/.bin/tsx scripts/genere-serie-stl-180j.mts

# rejouer le backtest et mettre les tables à jour
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:stl-pics

# contrôler le critère
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm verifie:stl-pics
```

## Limites

- La fixture est un **banc d'essai**, pas une mesure de production. Elle
  vérifie que la mécanique STL + garde-fou atteint la cible sur un jeu dont
  les pics sont connus ; elle ne prouve pas le même résultat sur le trafic
  réel, qui dépend de la densité et de la qualité de collecte.
- Les migrations `db/migrate-206-stl-pics.sql` et
  `db/migrate-207-stl-pics-seed.sql` livrent le schéma et la mesure de
  référence ; `scripts/mesure-stl-pics.mts` les met à jour de façon
  idempotente.
- Aucun secret, aucune donnée personnelle, aucune source nationale présentée
  comme locale.
