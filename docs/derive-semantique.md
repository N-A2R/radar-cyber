# Détection de dérive sémantique des flux

Le détecteur `jsd-coverage@1` repère les changements de vocabulaire **ou** de
couverture d'un flux avant qu'un analyste ne les signale. Chaque jour, un flux
est décrit par deux histogrammes : les termes observés et les zones couvertes.
La divergence de Jensen-Shannon compare la fenêtre glissante de 7 jours aux
28 jours précédents. Le seuil est calibré sur l'historique du flux (médiane +
écart absolu médian, plancher à 0,10). Le même écart doit apparaître dans deux
semaines disjointes et sur deux jours consécutifs : un pic isolé n'alerte pas.

Le jeu de test est déterministe et entièrement synthétique : 5 flux dont le
vocabulaire ou la couverture basculent (signalement analyste simulé 24 à 30
jours plus tard) et 10 flux inchangés avec du bruit, des week-ends et des
volumes différents. Aucune donnée personnelle, aucun secret, aucune source
nationale ou réelle n'est utilisée ; les zones sont `ZONE-A` … `ZONE-F`.

## Commande de vérification

```sh
pnpm verifie:derive-semantique
```

Le script crée une base PostgreSQL éphémère, applique les migrations, charge
le jeu, exécute `runSemanticDriftCheck`, imprime les deux requêtes du critère
et leur sortie brute, puis détruit la base. Critère :

```sql
SELECT count(*) FILTER (WHERE early) AS confirmed_early, count(*) AS target
  FROM semantic_drift_eval WHERE model = 'jsd-coverage@1';  -- 5 / 5

SELECT count(*) AS alerts
  FROM semantic_drift_alert a
  JOIN semantic_drift_feed f USING (source_id)
 WHERE f.expected = 'unchanged';                             -- 0
```

`early` n'est vrai que si l'alerte précède le signalement manuel d'au moins
7 jours. Les alertes sur flux inchangés sont comptées sans exception. La
métrique complète est persistée dans `semantic_drift_metric` ; le détail des
alertes et des délais reste auditable dans `semantic_drift_alert` et
`semantic_drift_eval` (migration `db/migrate-217-semantic-drift.sql`).

## Code

- `apps/api/src/analyse/derive-semantique.ts` : détecteur pur, sans base.
- `apps/api/src/analyse/derive-semantique-fixture.ts` : générateur du jeu.
- `apps/api/src/analyse/derive-semantique-backtest.ts` : rapprochement avec
  les signalements et calcul des métriques.
- `apps/api/src/analyse/derive-semantique-store.ts` : lecture des observations,
  exécution et persistance transactionnelle.
- `apps/api/test/derive-semantique.test.ts` : tests du détecteur et du critère.
