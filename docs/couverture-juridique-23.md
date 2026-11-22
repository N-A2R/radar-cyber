# Couverture juridique — Creuse (23)

Treize sources du secteur `juridique` pour le département 23, vérifiées en HTTP 200 le 2026-11-22 ; 30 URL distinctes contrôlées, toutes en 200.

Corpus : `bench/corpus/sources-juridique-23.jsonl` — preuve HTTP : `bench/results/verification-juridique-23.json` — intégration : `db/migrate-092-sources-juridique-23.sql` (13 sources, 30 traces `ok200`).

Mesure reproductible :
`jq -s '[.[] | select(.secteur=="juridique" and .departement=="23" and .code_http==200)] | length' bench/corpus/sources-juridique-23.jsonl`
→ 13 sources en HTTP 200 ; `jq '.urls_200' bench/results/verification-juridique-23.json` → 30 URL en 200.

OBJECTIF : atteint — 13 / 5
