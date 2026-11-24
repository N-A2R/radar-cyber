# OBJECTIF — Astryx lot 7 : stories et dataviz

## Critère canonique

Toute l'interface web est documentée dans Storybook et rendue sous le thème
Astryx gothic :

- **100 % des composants exportés** ont au moins une story
  (`coveragePercent = 100`, `missing = []`) ;
- **100 % des fichiers `.stories.tsx`** portent le décorateur local
  `<Theme theme={gothicTheme} mode="dark">`, en plus du décorateur global de
  `apps/web/.storybook/preview.tsx` : aucune story ne dépend d'un thème par
  défaut ;
- les dataviz MapLibre et force-graph restent rendues dans leurs stories, sans
  remplacer le composant réel par un mock.

Le critère est binaire : un composant sans story, ou une story sans décorateur
gothic local, fait échouer la mesure.

## Mesure reproductible

```bash
# Couverture des composants (aucune écriture ; la baseline PostgreSQL est
# informative et peut varier, elle ne fait pas partie du critère).
cd apps/web && node scripts/measure-storybook.mjs && cd ../..

# Décorateur gothic sur toutes les stories.
total=$(find apps/web/src -name '*.stories.tsx' | wc -l)
themed=$(rg -l 'Theme theme=\{gothicTheme\}' apps/web/src --glob '*.stories.tsx' | wc -l)
test "$total" -eq "$themed" || exit 1
echo "OBJECTIF : atteint — $themed / $total fichiers de stories avec décorateur gothic"

# Contrat des stories (états peuplés, vides, erreur, dataviz).
cd apps/web && ./node_modules/.bin/vitest run test/storybook-coverage.test.tsx --environment jsdom
```

## Résultat observé le 2026-11-24

```
components: 52 / 52 documentés (100 %), 43 fichiers de stories, 91 stories, missing: []
décorateur gothic local : 43 / 43 fichiers de stories
vitest storybook-coverage : 56 tests réussis sur 56
pnpm -F @radar/web typecheck : vert
```

OBJECTIF : atteint — 52 / 52 composants documentés ; 43 / 43 stories avec décorateur gothic ; 4 stories manquantes ajoutées (`ErrorRetry`, `ExportMenu`, `SourcesDashboardView`, `WarcProofCard`).

## Périmètre

Le lot 7 n'a pas modifié la logique des vues : seuls les rendus Storybook, les
décorateurs de thème et les correctifs défensifs déjà identifiés sont livrés.
Les fixtures restent synthétiques et en Nouvelle-Aquitaine ; aucune donnée
personnelle de victime n'est introduite.
