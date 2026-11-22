# Couverture bâtiment — Dordogne (24)

Dix-huit sources du secteur `bâtiment` pour le département 24, vérifiées en HTTP 200 le 2026-11-22 ; 42 URL distinctes contrôlées, toutes en 200.

Corpus : `bench/corpus/sources-batiment-24.jsonl` — preuve HTTP : `bench/results/verification-sources-batiment-24.json` — intégration : `db/migrate-084-sources-batiment-24.sql` (18 sources ; empreinte du corpus dans `bench/corpus/HASH`).

Mesure reproductible :

```
jq -s '[.[] | select(.secteur=="bâtiment" and .departement=="24" and .code_http==200)] | length' bench/corpus/sources-batiment-24.jsonl
jq '.urls_verifiees, .urls_200' bench/results/verification-sources-batiment-24.json
```

→ 18 sources en HTTP 200 ; 42 URL vérifiées, 42 en 200.

OBJECTIF : atteint — 18 / 5
