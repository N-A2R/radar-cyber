# Couverture « bâtiment » — Corrèze (19)

12 sources vérifiées, 22 URLs distinctes contrôlées en HTTP 200 le 2026-11-22
(sites, pages d'actualités et flux RSS/Atom). Aucune URL en échec retenue.

Corpus : `bench/corpus/sources-batiment-19.jsonl` — preuve HTTP :
`bench/results/verification-sources-batiment-19.json` — intégration :
`db/migrate-076-sources-batiment-19.sql` (12 sources, 22 tracés `ok200`).

Mesure reproductible :
`jq -s '[.[] | select(.code_http == 200)] | length' bench/corpus/sources-batiment-19.jsonl`
→ 12 sources en HTTP 200 ; `jq '.urls_200' bench/results/verification-sources-batiment-19.json`
→ 22 URLs en 200.

OBJECTIF : atteint — 12 / 5
