# Score calibré — Brier du score de confiance

Mesure du 22 novembre 2026, sur l'état réel de la base :
1 673 220 organisations, 463 sources, 27 899 événements dont 27 873 notés.

## Cible

La mission ne fournit pas de seuil chiffré. La cible suivante est donc fixée
**avant la première mesure**, puis écrite dans le script et non modifiable par
un argument de ligne de commande :

> **Brier calibré ≤ 0,22** sur les 100 événements étiquetés à la main, évalué
> en validation croisée à 5 plis, sans fuite entre entraînement et évaluation.

Le Brier brut (score/100 direct) sert de référence, ainsi que le prédicteur
constant à la fréquence de base. Un Brier plus bas est meilleur ; 0 est parfait.

## Méthode

- **Prédiction** : `event_confidence.score`, note entière sur 100 produite par
  `apps/api/src/analyse/confidence-score.ts` (quatre composantes : sources
  indépendantes, qualité de la source, cohérence temporelle, corpus validé).
- **Étiquettes** : `bench/pertinence/corpus-100.json`, 100 événements réels des
  sources du projet Nouvelle-Aquitaine (`gn-*`, `presse-*`, `eco-*`), 70
  « cyber » et 30 « hors sujet », jugés à la lecture du titre **sans consulter
  le score ni ses composantes**. Aucune étiquette d'incident issue du corpus
  validé n'est utilisée : ce corpus alimente déjà la quatrième composante du
  score et serait circulaire.
- **Calibration** : binning de fiabilité à quatre intervalles de largeur égale,
  lissage symétrique avec un pseudo-comptage de poids 1 vers la fréquence de
  base. Chaque pli est calibré sur les quatre autres, puis évalué sur son pli :
  aucune étiquette ne sert à calibrer sa propre prédiction.
- **Données personnelles** : aucune. Seuls des identifiants d'événements, des
  étiquettes agrégées et des scores sont lus ; aucun nom de victime, aucune
  donnée individuelle n'entre dans la mesure. Aucun service payant, aucun appel
  réseau, aucune écriture en base.

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-brier.mts \
  --json=bench/results/brier-calibration-2026-11-22.json
```

Équivalent : `pnpm mesure:brier -- --json=bench/results/brier-calibration-2026-11-22.json`.
La commande sort avec un code non nul si la cible n'est pas atteinte. Le rapport
machine est `bench/results/brier-calibration-2026-11-22.json`.

## Résultat mesuré

| Mesure | Valeur |
|---|---|
| Brier brut (score/100) | **0,29526** |
| Brier calibré (5 plis, hors pli) | **0,21180** |
| Brier de la fréquence de base (0,70) | 0,21000 |
| Cible | ≤ 0,22000 |
| Gain | **28,3 %** |

OBJECTIF : atteint — 0,21180 / 0,22000

### Fiabilité

| Intervalle du score | Événements | Taux observé cyber | Score moyen brut | Probabilité calibrée |
|---|---|---|---|---|
| 0,00–0,25 | 0 | — | — | 0,700 |
| 0,25–0,50 | 76 | 0,724 | 0,377 | 0,723 |
| 0,50–0,75 | 24 | 0,625 | 0,590 | 0,631 |
Le score brut est nettement sous-confiant sur cette étiquette : des notes
moyennes de 0,38 et 0,59 correspondent à des taux réels de 0,72 et 0,63. La
calibration corrige cet écart ; le Brier calibré reste très proche de celui de
la fréquence de base, ce qui signifie que la note brute ne discrimine presque
pas ce critère. Ce chantier mesure et corrige la **calibration**, pas la
discrimination : utiliser ces probabilités pour classer la pertinence cyber
exigerait un travail séparé.

## Limites

- 100 étiquettes seulement : l'intervalle de confiance est large. Le chiffre
  est une mesure rejouable sur un jeu gelé, pas une estimation de population.
- L'étiquette porte sur la pertinence cyber, pas sur la vérité d'un incident :
  les corpus d'incidents servant déjà au score ne peuvent pas faire office de
  vérité indépendante.
- Les intervalles vides héritent de la fréquence de base ; les intervalles
  peu peuplés sont lissés vers elle.
- Le score de confiance lui-même n'est pas modifié : les autres consommateurs
  (`/api/confidence/*`, scripts, base) gardent leurs notes et leurs seuils.
