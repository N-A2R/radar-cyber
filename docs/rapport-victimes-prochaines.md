# Prédiction des prochaines victimes de Nouvelle-Aquitaine

OBJECTIF : atteint — 10 victimes classées à 30 jours, précision 0,0000 (0/60) et rappel 0,0000 (0/15) mesurés sur 6 mois de rétro-test / 10 victimes prédites avec précision et rappel mesurés sur 6 mois de rétro-test.

## Ce qui est livré

Un classement déterministe des **10 organisations de Nouvelle-Aquitaine les plus probables à être citées comme victimes dans les 30 prochains jours**, et un rétro-test *walk-forward* de six fenêtres consécutives de 30 jours (180 jours, du 26 mai au 22 novembre 2026).

Classement au 22 novembre 2026, horizon au 22 décembre 2026 (identifiants d'organisation uniquement, aucun nom de victime) :

| Rang | Organisation | Département | Secteur | Score |
|---:|---:|:---:|---|---:|
| 1 | 2190093 | 33 | activites-specialisees | 48,93 |
| 2 | 604869 | 23 | culture-loisirs | 45,43 |
| 3 | 160389 | 33 | immobilier | 44,27 |
| 4 | 2230758 | 33 | activites-specialisees | 42,67 |
| 5 | 2285568 | 17 | activites-specialisees | 40,73 |
| 6 | 2175692 | 17 | activites-specialisees | 39,20 |
| 7 | 482872 | 33 | associations | 38,93 |
| 8 | 213857 | 33 | commerce | 38,43 |
| 9 | 688670 | 17 | immobilier | 37,60 |
| 10 | 313584 | 87 | activites-specialisees | 37,50 |

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  npm run measure:victims -- --as-of=2026-11-22 \
  --json=bench/results/victim-forecast-2026-11-22.json
```

Sortie observée (30 s, base locale réelle) :

```
Universe: 1,671,906 NA organisations, 74 NA claims, 240 NA organisation events, 463 sources
Backtest: 6 windows x 10 predictions = 60, 15 victims, 0 hits
Precision: 0.0000  Recall: 0.0000  Wilson 95%: [0.0000, 0.2039]
```

Le détail figé, fenêtre par fenêtre, est dans `bench/results/victim-forecast-2026-11-22.json` :

| Début | Fin | Prédictions | Victimes | Touchés |
|:---|:---|---:|---:|---:|
| 2026-05-26 | 2026-06-25 | 10 | 2 | 0 |
| 2026-06-25 | 2026-07-25 | 10 | 3 | 0 |
| 2026-07-25 | 2026-08-24 | 10 | 6 | 0 |
| 2026-08-24 | 2026-09-23 | 10 | 0 | 0 |
| 2026-09-23 | 2026-10-23 | 10 | 3 | 0 |
| 2026-10-23 | 2026-11-22 | 10 | 1 | 0 |

Précision et rappel sont micro-moyennés sur les six fenêtres : `hits / prédictions` et `hits / victimes`. Une fenêtre sans victime donne un rappel `null`, pas zéro. L'intervalle de Wilson 95 % du rappel agrégé est `[0 ; 0,2039]`.

## Méthode

- **Univers** : 1 671 906 organisations dont le département est dans les 12 départements de Nouvelle-Aquitaine, 463 sources, 27 899 événements, 74 revendications `leak_claim` marquées NA et rattachées à une organisation.
- **Vérité terrain** : une organisation est victime d'une fenêtre si au moins une revendication NA la concernant a été publiée dans cette fenêtre. Les doublons sont comptés une seule fois.
- **Absence de fuite** : les caractéristiques d'une fenêtre (revendications antérieures, groupes distincts, ancienneté, taux de base par secteur et département, événements et sources antérieurs) utilisent exclusivement des dates strictement antérieures au début de la fenêtre. Les bornes sont exclusives côté apprentissage, inclusives côté résultat. Le script ne lit ni le nom de la victime, ni la description de la revendication, ni l'URL de preuve.
- **Score** : somme pondérée et plafonnée de signaux au niveau organisation, déterministe, avec départage par identifiant. Le code et la sortie sont en anglais ; ce rapport est en français.

## Résultat et limite importante

La mesure est nulle : **0 hit sur 60 prédictions, 0 victime retrouvée sur 15**. Le classement produit donc bien dix candidats, mais il n'a pas de valeur prédictive démontrée sur cette période. Ce n'est pas un artefact de calcul :

- aucune des 15 victimes des fenêtres n'avait de revendication antérieure, d'événement antérieur, d'alerte ou de mention en quarantaine avant sa propre revendication ;
- seules 3 organisations du corpus ont deux revendications, toutes deux en dehors des fenêtres de test ;
- les études d'anticipation déjà menées sur le radar (`docs/anticipation.md`) arrivent au même constat : 0 incident sur 50 avec un signal précurseur retenu.

Le score actuel privilégie donc les organisations déjà revendiquées et les taux de base sectoriels/départementaux ; il ne doit pas être présenté comme une alerte fiable. Une amélioration nécessiterait des signaux individuels antérieurs à la revendication, absents de l'état réel de la base.

## Conformité

- Nouvelle-Aquitaine uniquement (filtre département INSEE) ; sources grises autorisées et déjà présentes dans la base ; aucun service payant.
- Aucune donnée personnelle de victime : le rapport et la sortie n'exposent que des identifiants d'organisation, départements, secteurs et scores.
- `apps/api/src/server.ts` inchangé : **0 ligne de diff**.
- 11 tests, un par comportement, verts ; typecheck API vert ; commande de mesure 30 s (< 60 s).
