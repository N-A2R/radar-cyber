# Couverture agriculture — Charente (16)

Mesure du 2026-11-22. Objectif : au moins 5 sources d'information du secteur `agriculture` dans le département 16, vérifiées en HTTP 200 (même cible que les tranches agriculture sœurs des autres départements).

## Mesure reproductible

- `jq -s '{sources: length, secteurs: (map(.secteur)|unique), departements: (map(.departement)|unique), code_http_200: (map(select(.code_http==200))|length)}' bench/corpus/sources-agriculture-16.jsonl` → 12 sources, toutes `agriculture`/`16`, 12 en `code_http=200`.
- `jq '{sources, urls_verifiees, urls_200}' bench/results/verification-sources-agriculture-16.json` → 12 sources, 30 URL contrôlées, 30 en HTTP 200.
- `db/migrate-064-sources-agriculture-16.sql` : 12 lignes `INSERT` `corpus:agriculture-16-*`.

OBJECTIF : atteint — 12 / 5
