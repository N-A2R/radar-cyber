# Presse : périmètre et famille `presse_cyber`
Le fil garde le régional d'abord, puis le contexte : la presse n'est pas jetée, elle est filtrée puis séparée.

## Règle de bascule (`scripts/reclassify-press.mts`)
Un événement `presse` passe en `presse_cyber` si **les deux** tiennent :
1. le texte (titre + résumé) contient un terme cyber — prédicat `isCyberText` de
   `apps/api/src/collectors/classify.ts`, importé et jamais recopié ;
2. le texte nomme un département, une préfecture ou une commune de
   Nouvelle-Aquitaine, **ou** la source est régionale (`presse-*`, `estorides:*`).
Le reste demeure `presse` (en base, masqué dans le fil).

## Exécution
`--dry-run` est le défaut : transaction complète puis `ROLLBACK`. `--apply`
archive la ligne entière (motif inclus) dans `event_press_archive` avant
l'`UPDATE`, en une transaction. `db/migrate-019-press-scope.sql` étend un
éventuel CHECK sur `event.family` — aucune contrainte n'existe aujourd'hui.
Mesure 2026-11-10 : 1 797 `presse` → 50 `presse_cyber`. `FAMILIES`
(`packages/shared`) ignore encore la valeur ; le script écrit en SQL direct.
