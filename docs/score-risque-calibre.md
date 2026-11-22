# Score de risque d'organisation — calibration à 90 jours

Le score public d'exposition d'une organisation est un petit entier calculé
uniquement à partir d'agrégats publics (domaine connu, secteur). Ce chantier le
convertit en probabilité d'incident revendiqué dans les 90 jours et publie la
qualité de cette conversion dans `model_eval` sous le nom
`org_risk_calibrated`.

## Mesure

`pnpm mesure:risk-calibration` (ou `apps/api/node_modules/.bin/tsx
scripts/measure-org-risk-calibration.mts`) :

1. sélectionne les organisations de Nouvelle-Aquitaine disposant d'un incident
   revendiqué entre le 2026-08-24 et le 2026-11-22 (18 positives), complétées
   par un échantillon déterministe de négatifs (`id % 997 = 7`) ;
2. tire une cohorte de 120 organisations, répartie en 10 strates de rang de 12,
   tous les positifs d'une strate étant conservés ;
3. estime la probabilité de chaque strate par rétrécissement vers la fréquence
   de base (poids 5), puis évalue chaque organisation **hors de sa propre
   étiquette** (leave-one-out) ;
4. écrit le Brier, l'ECE, les effectifs et les dix strates dans `model_eval` /
   `model_eval_bin`, puis le rapport `bench/results/org-risk-calibration.json`.

Aucun nom d'organisation, aucune adresse, aucun texte libre et aucun secret ne
sont stockés : la base ne contient que des agrégats numériques.

## Résultat publié (2026-11-22)

| Métrique | Valeur | Cible |
| --- | --- | --- |
| Brier (leave-one-out) | 0,127035 | ≤ 0,15 |
| ECE (10 bins) | 0,036458 | ≤ 0,05 |
| Organisations | 120 | 120 |
| Effectif minimal par bin | 12 | ≥ 12 |

Vérification :

```sql
SELECT brier, ece FROM model_eval WHERE model='org_risk_calibrated';
-- brier = 0.12703450520833334 ; ece = 0.03645833333333333
SELECT bin_index, count FROM model_eval_bin
WHERE model='org_risk_calibrated' ORDER BY bin_index;
-- 10 lignes, count = 12 pour chacune
```

## Limites

- La cohorte d'évaluation enrichit volontairement les positifs (18/120) pour
  que chaque strate soit observable ; les probabilités publiées décrivent donc
  la calibration **sur cette cohorte**, pas l'incidence brute de 1,1 % de
  l'ensemble des 1 699 organisations.
- Le score d'exposition est peu discriminant (AUC publiée par ailleurs ≈ 0,54) :
  ce chantier mesure la calibration, pas la capacité de classement.
- Peu d'incidents positifs sur la fenêtre : les probabilités restent proches de
  la fréquence de base et doivent être relues avec les strates publiées.
