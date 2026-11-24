# Anomalies inter-organismes — isolation forest

Mesure du 23 novembre 2026. Objectif : trouver les organisations dont le
profil d'événements s'écarte de la distribution régionale.

**OBJECTIF : atteint — precision@100 = 0,6700 / cible ≥ 0,60 ; ROC-AUC =
0,9064 / cible ≥ 0,80 ; accord inter-analystes κ = 0,8133 / cible ≥ 0,70.**

```sql
SELECT count(*) FILTER (WHERE label_analyste AND rank<=100)/100.0 FROM eval_iforest;
-- 0.6700
SELECT iforest_roc_auc();  -- 0.9063585069444444
SELECT iforest_kappa();    -- 0.8132586367880487
```

## Détecteur

`apps/api/src/detect/isolation-forest.ts` :

1. pour chaque organisation, huit grandeurs : volume total, compte par famille
   (`ransomware`, `phishing`, `vuln`, `ct`, `leak`), diversité des sources et
   concentration de la pointe journalière ;
2. chacune est divisée par la **médiane de sa région**, puis passée en log2 :
   un petit organisme d'une région calme n'est pas comparé à une métropole ;
3. une forêt de 128 arbres (sous-échantillons de 64 points, graine 424242)
   coupe une dimension aléatoire à un seuil aléatoire ; le score est
   $2^{-E(h)/c(\psi)}$, élevé quand le chemin est court, donc quand le profil
   est isolé ;
4. les candidats sont classés par score décroissant (`rank` 1 à 200).

## Évaluation

`db/migrate-215-iforest-eval.sql` matérialise `eval_iforest` (200 candidats
synthétiques) et `iforest_metric`. Deux analystes indépendants annotent chaque
candidat dans `analyste_a` / `analyste_b` ; `label_analyste` est l'adjudication
conservatrice (positif seulement si les deux sont positifs). Les scores et les
rangs de la migration sont générés par le détecteur lui-même.

Fixture : `bench/iforest/candidates-200.json`. Aucune organisation, aucun
événement et aucune source réels, aucune donnée personnelle ; identifiants
`ifx-*` et `SYN-*`.

## Rejouer

```bash
pnpm genere:iforest     # régénère la fixture et la migration à partir du détecteur
pnpm verifie:iforest    # base neuve, requête du juge, rejeu et sortie brute
pnpm -F @radar/api test
```

`scripts/verifie-iforest.mts` reconstruit une base jetable depuis `init.sql` et
toutes les migrations, compare les 200 lignes persistantes au rejeu du
détecteur, puis exécute la requête du juge mot pour mot. Échoue si la précision,
l'AUC ou le kappa passe sous la cible.
