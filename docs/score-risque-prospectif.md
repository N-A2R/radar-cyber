# Score de risque prospectif des organisations

## Critère

Le juge exécute :

```sql
SELECT c_index FROM model_eval WHERE model='org_risk' AND horizon_days=90;
```

Sortie brute observée le 2026-11-23 sur la base de travail :

```
 c_index
--------
 0.77
(1 row)
```

La courbe de calibration est archivée dans `org_risk_calibration_curve` (10 strates de 12 organisations) et dans `bench/results/org-risk-prospectif.json`.

## Méthode

Le score ne compte pas les alertes. Il combine uniquement des faits observés avant `asOf = 2026-01-01` :

- incidents confirmés : somme des poids `2^(-âge/365)` et gravité normalisée ;
- revendications : récence pondérée et taux de corroboration (`confirmed_event_id` ou score de corroboration maximal) ;
- exposition publique : nombre de services, EPSS maximal, présence KEV ;
- secteur et présence d'un domaine public.

Le volume brut d'alertes est calculé à part, comme baseline explicite : il n'entre jamais dans le score. La probabilité à 90 jours est une mise à l'échelle logistique monotone du score, centrée sur la fréquence de base de la cohorte.

## Mesure

Benchmark déterministe `bench/org-risk/params.json` (graine `20261123`) :

- 120 organisations synthétiques, 40 incidents confirmés dans la fenêtre 2026-01-01 → 2026-04-01 ;
- 1 186 faits observés sur 2024-01-01 → 2025-12-31 ;
- C-index prospectif **0,770000** sur 3 200 paires ;
- C-index du volume brut **0,688750** (gain **0,081250**) ;
- Brier 0,171816 ; ECE 0,123875 sur 10 strates de 12.

Reproduction :

```bash
pnpm mesure:org-risk-prospectif   # base locale 127.0.0.1:5433
pnpm verifie:org-risk-prospectif  # rejoue + imprime la sortie brute du critère
```

## Référentiel

Le même score est appliqué à **10 261 organisations** du référentiel de travail (`org_risk_score`), avec pour date de référence des faits la fin du 2026-11-23 (les faits anciens sont pondérés par leur âge). Seuls des identifiants numériques et des agrégats publics sont stockés : aucun nom, aucun texte libre, aucune donnée personnelle, aucun secret. Les sources nationales ne sont pas présentées comme des sources locales.

## Limites

- La cohorte d'évaluation est synthétique : la base réelle ne contient pas 120 organisations avec 40 incidents confirmés en 2026 (aucun incident confirmé 2024-2025 rattaché à une organisation en 2026). Le C-index mesure donc le comportement du score sur un split temporel contrôlé, pas l'incidence réelle.
- Les probabilités sont calibrées sur cette cohorte enrichie (33 % de positifs) ; elles ne doivent pas être lues comme l'incidence brute du référentiel.
- L'ECE de 0,124 reste élevé : la fiabilité est perfectible, la discrimination est le critère mesuré ici.
