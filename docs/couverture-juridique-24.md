# Couverture juridique — Dordogne (24)

Seize sources du secteur `juridique` pour le département 24, vérifiées en HTTP 200 le 2026-11-22 ; 39 URL distinctes contrôlées, toutes en 200.

Corpus : `bench/corpus/sources-juridique-24.jsonl` — preuve HTTP : `bench/results/verification-juridique-24.json` — intégration : `db/migrate-095-sources-juridique-24.sql` (16 sources, 39 traces `ok200`).

Mesure reproductible :
`jq -s '[.[] | select(.secteur=="juridique" and .departement=="24" and .code_http==200)] | length' bench/corpus/sources-juridique-24.jsonl`
→ 16 sources en HTTP 200 ; `jq '.urls_200' bench/results/verification-juridique-24.json` → 39 URL en 200.

OBJECTIF : atteint — 16 / 5
