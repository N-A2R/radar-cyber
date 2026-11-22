# Couverture bâtiment — Charente-Maritime (17)

Seize sources du secteur `bâtiment` pour le département 17, vérifiées en HTTP 200 le 2026-11-22 ; 29 URL distinctes contrôlées, toutes en 200.

Corpus : `bench/corpus/sources-batiment-17.jsonl` — preuve HTTP : `bench/results/verification-sources-batiment-17.json` — intégration : `db/migrate-070-sources-batiment-17.sql` (16 lignes dans `source`). Empreinte du corpus mise à jour dans `bench/corpus/HASH`.

Mesure reproductible :

```
jq -s '[.[] | select(.secteur=="bâtiment" and .departement=="17" and .code_http==200)] | length' bench/corpus/sources-batiment-17.jsonl
jq '[.detail[].urls[] | select(.code == 200)] | length' bench/results/verification-sources-batiment-17.json
```

→ 16 sources en HTTP 200 ; 29 URL vérifiées, 29 en 200. Cible : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur « bâtiment » / département 17 (Charente-Maritime). Aucun code ni test modifié.

OBJECTIF : atteint — 16 / 5
