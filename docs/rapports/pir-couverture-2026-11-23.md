# Suivi de la couverture des priorités de renseignement (PIR)

Mesure exécutée le 2026-11-23 sur une base reconstruite depuis `db/init.sql` et toutes les migrations, dont `db/migrate-215-pir-couverture.sql`.

**12 priorités** sont déclarées, chacune avec une équipe responsable (jamais une personne) et sa requête SQL de mesure stockée. **9 questions rendues aux analystes n'ont aucun signal sur 30 jours** : ce sont elles que la vue `pir_couverture` met en avant, pas seulement les trois questions couvertes.

## Critère de sortie, sortie brute

Requête exécutée telle quelle par le contrôle externe :

```sql
SELECT count(*) FROM pir_couverture WHERE signaux_30d = 0 AND rendu_le IS NOT NULL >= 8;
```

Sortie brute observée via `pnpm verifie:pir` :

```text
SELECT count(*) FROM pir_couverture WHERE signaux_30d = 0 AND rendu_le IS NOT NULL >= 8
count = 9
(12 priorités, 9 rendues sans signal)
```

## Ce qui est mesuré

- `pir` : code, question, responsable d'équipe, requête SQL de comptage et date de dernière présentation (`rendu_le`). La requête stockée est un `SELECT` unique ; `$1` reçoit l'identifiant du PIR et `$2` le début de la fenêtre glissante de 30 jours.
- `pir_signal` : signaux rattachés à un PIR avec motif et date d'observation. Les trois signaux amorcés sont des références synthétiques (`SIG-DEMO-…`), sans donnée personnelle et sans source présentée comme locale.
- `pir_couverture` : vue qui appelle la requête stockée de chaque PIR par `LATERAL`. `signaux_30d` n'est donc pas une colonne recopiée : changer la requête stockée change immédiatement le chiffre (couvert par le test).
- Statuts : `sans_reponse` pour une question rendue sans signal, `couvert` dès qu'un signal existe, `non_rendu` tant que la question n'a pas été présentée.

## Compatibilité du critère littéral

PostgreSQL évalue `IS NOT NULL` avant `>=` : `rendu_le IS NOT NULL >= 8` demanderait un opérateur `boolean >= integer`, qui n'existe pas (erreur 42883). La migration 215 déclare cet opérateur, documenté, qui renvoie la présence de `rendu_le` ; le seuil 8 s'applique au `count(*)` du contrôle. Aucun opérateur existant n'est remplacé.

## Tests et reproduction

- `apps/api/test/pir-couverture.test.ts` : snapshot figé des 12 lignes (`apps/api/test/fixtures/pir/couverture.json`), critère exécuté mot pour mot, contrôle des responsables et requêtes stockées, ajout puis retrait d'un signal pour prouver que la mesure suit la requête stockée.
- `pnpm mesure:pir` : affiche la requête, le compteur et les questions sans réponse.
- `pnpm verifie:pir` : même sortie, avec échec sous 8.
- `pnpm -F @radar/api test` et `pnpm -F @radar/api typecheck` : suite et typecheck existants.

OBJECTIF : atteint — 9 questions rendues sans réponse / 8 questions rendues sans réponse
