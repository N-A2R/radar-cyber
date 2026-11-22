# Sources d'information — secteur santé, département 24 (Dordogne)

Trente et une sources du secteur `santé` pour le département 24, vérifiées en HTTP 200 le 2026-11-22 ; 117 URL distinctes contrôlées, toutes en 200, aucune anomalie.

Corpus : `bench/corpus/sources-sante-24.jsonl` — preuve HTTP : `bench/results/verification-sources-sante-24.json` — intégration : `db/migrate-096-sources-sante-24.sql` (31 sources, 117 traces `ok200`).

Mesure reproductible :
`jq -s '[.[] | select(.secteur=="santé" and .departement=="24" and .code_http==200)] | length' bench/corpus/sources-sante-24.jsonl`
→ 31 sources en HTTP 200 ; `jq '[.urls_verifiees, .urls_200, (.anomalies|length)]' bench/results/verification-sources-sante-24.json` → `[117,117,0]`.

OBJECTIF : atteint — 31 / 5
