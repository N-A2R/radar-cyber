# Prévision des revendications rançongiciel à 30 jours

Le modèle `ransom_forecast` estime, à la fin de chaque semaine, la probabilité
qu'au moins une revendication rattachée à la Nouvelle-Aquitaine
(`leak_claim.na = true`) paraisse dans les **30 jours** suivants. La mesure est
un PR-AUC (average precision), pas un score de calibration.

## Protocole de mesure

- **Origines** : toutes les semaines complètes de la série, de 2020 à la dernière
  semaine dont l'issue de 30 jours est connue.
- **Étiquette** : `claims_next_30d >= 1`, où le nombre est calculé sur
  `[fin de semaine + 7 j, fin de semaine + 37 j)`.
- **Découpage** : apprentissage avant le 2025-01-01, test à partir du
  2025-01-01. Le test ne participe jamais à l'entraînement.
- **Caractéristiques** : agrégations des 4/12/26/52 dernières semaines de
  revendications NA et de l'ensemble des revendications, activité des groupes
  déjà passés en NA, nombre de groupes nouvellement actifs, événements `leaks`
  et `ransomware`, et dates de fuites connues (`fuite_reference`). Aucune
  caractéristique ne lit le futur.
- **Modèle** : forêt aléatoire CART déterministe (400 arbres, 4 variables par
  division, profondeur 3, minimum 2 feuilles, moyenne des graines 0/1/2).
- **Référence** : Poisson dont λ est estimé sur les 364 jours précédant
  l'origine ; `pr_auc_baseline` est calculé sur le même jeu de test.

Le jeu de test de la mesure livrée porte sur 93 origines (81 positives) ;
PR-AUC 0,9393, PR-AUC Poisson 0,8379, gain 0,1014.

## Rejouer et vérifier

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:ransom-forecast

SELECT pr_auc FROM model_eval WHERE model='ransom_forecast' AND horizon_days=30;
```

La migration `215` ajoute les colonnes `pr_auc`, `pr_auc_baseline` et
`pr_auc_gain` à `model_eval` ainsi que la table d'audit
`ransom_forecast_eval`. La migration `216` sème la ligne résumé mesurée ; le
script de mesure réécrit cette ligne et les observations de façon idempotente.

Aucune donnée personnelle ni secret n'est stocké : la table d'audit ne contient
que des comptages hebdomadaires, des scores et des étiquettes dérivées des
revendications déjà rattachées à la région. Aucune source nationale n'est
présentée comme locale : le signal régional est exclusivement `leak_claim.na`.
