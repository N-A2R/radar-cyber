# Couverture juridique — Haute-Vienne (87)

Quatorze sources du secteur `juridique` pour le département 87, vérifiées en HTTP 200 le 2026-11-22 ; 34 URL distinctes contrôlées, toutes en 200.

Corpus : `bench/corpus/sources-juridique-87.jsonl` — preuve HTTP : `bench/results/verification-juridique-87.json` — intégration : `db/migrate-121-sources-juridique-87.sql` (14 sources, 34 traces `ok200`).

Organisations couvertes : tribunal judiciaire et cour d'appel de Limoges, Ordre des avocats du Barreau de Limoges, annuaire Avocat.fr du barreau, Chambre interdépartementale des notaires 19-23-87, annuaire des notaires de Haute-Vienne, Village de la Justice, Le Populaire du Centre, La Montagne, ICI Limousin, France 3 Nouvelle-Aquitaine, Sud Ouest, actu.fr et Conseil départemental de la Haute-Vienne.

Mesure reproductible :
`jq -s '[.[] | select(.secteur=="juridique" and .departement=="87" and .code_http==200)] | length' bench/corpus/sources-juridique-87.jsonl`
→ 14 sources en HTTP 200 ; `jq '.urls_200' bench/results/verification-juridique-87.json` → 34 URL en 200.

OBJECTIF : atteint — 14 / 5
