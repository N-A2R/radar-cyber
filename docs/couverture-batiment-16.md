# Couverture « bâtiment » — Charente (16)

10 sources vérifiées, 24 URLs distinctes contrôlées en HTTP 200 le 2026-11-22
(sites, pages d'actualités et flux RSS/Atom). Aucune URL en échec retenue.

Corpus : `bench/corpus/sources-batiment-16.jsonl` — preuve HTTP :
`bench/results/verification-sources-batiment-16.json` — intégration :
`db/migrate-065-sources-batiment-16.sql` (10 sources, `department='16'`).

Mesure reproductible :
`jq -s '[.[] | select(.code_http == 200)] | length' bench/corpus/sources-batiment-16.jsonl`
→ 10 sources en HTTP 200 ; `jq '.urls_200' bench/results/verification-sources-batiment-16.json`
→ 24 URLs en 200. Cible : 5 sources vérifiées attendues (PR #409).

OBJECTIF : atteint — 10 sources vérifiées HTTP 200 / 5 attendues
