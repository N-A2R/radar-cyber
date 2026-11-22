# Couverture juridique — Charente-Maritime (17)

Quatorze sources du secteur `juridique` pour le département 17, vérifiées en HTTP 200 le 2026-11-22 ; 29 URL distinctes contrôlées, toutes en 200.

Corpus : `bench/corpus/sources-juridique-17.jsonl` — preuve HTTP : `bench/results/verification-sources-juridique-17.json` — intégration : `db/migrate-074-sources-juridique-17.sql` (14 sources, 29 traces `ok200`).

Mesure reproductible :

```
jq -s '[.[] | select(.secteur=="juridique" and .departement=="17" and .code_http==200)] | length' bench/corpus/sources-juridique-17.jsonl
jq '.urls_verifiees, .urls_200' bench/results/verification-sources-juridique-17.json
```

→ 14 sources en HTTP 200 ; 29 URL vérifiées, 29 en 200.

OBJECTIF : atteint — 14 / 5
