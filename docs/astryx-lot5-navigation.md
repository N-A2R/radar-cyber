# Astryx — lot 5 : navigation et carte

Lot 5 empilé sur le lot 4. Les contrôles restent pilotés par le code applicatif :
seuls les composants visuels passent à Astryx.

- `ExportMenu` : boutons CSV/PDF rendus par `Button` d'Astryx ; les formats et
  les règles d'export restent ceux de `src/export.ts`.
- `MapLegend` : `Card` transparent + `Badge` neutre par famille ; la palette
  `FAMILY_HEX` utilisée par les couches MapLibre n'est pas modifiée.
- `MapTimeline` : `Card` autour des contrôles ; `Play` et `All dates` restent
  des `<button>` natifs, exigés par le contrat de rendu SSR
  (`>Play</button>`, `>All dates</button>`).
- `HealthView` : un `total` absent rend « — » via `formatNumber(null)` au lieu
  de lever `toLocaleString` sur `undefined`.

## Critère

OBJECTIF : atteint — 26 / 26 paires écran-format CSV/PDF exportables sur 13 / 13 écrans, 11 / 11 contrôles SSR de la timeline passent avec `>Play</button>` et `>All dates</button>` conservés, 0 / 11 violations a11y AA, 0 / 71 faits de Nouvelle-Aquitaine sans provenance. Mesure reproductible : `pnpm -F @radar/web typecheck && pnpm -F @radar/web test:export && pnpm -F @radar/web test:map-timeline && pnpm -F @radar/web test:a11y && pnpm -F @radar/web test:navigation && pnpm -F @radar/web test:render && pnpm -F @radar/web test:corpus && pnpm -F @radar/web test:sources-rouges && pnpm -F @radar/web test:etats-vides && pnpm provenance:check` (à exécuter séquentiellement : les tests SSR partagent `apps/web/.smoke-out`).

## Vérifications rejouées le 24/11/2026

| Commande | Résultat observé |
|---|---|
| `pnpm -F @radar/web typecheck` | exit 0 |
| `pnpm -F @radar/web test:export` | 9 tests, `EXPORT_COVERAGE=13/13`, `EXPORT_FORMATS=26/26` |
| `pnpm -F @radar/web test:map-timeline` | 11 contrôles OK, dont les deux boutons natifs |
| `pnpm -F @radar/web test:a11y` | 11 tests, `A11Y_AA_AUDIT screens=11 violations=0` |
| `pnpm -F @radar/web test:navigation` | 4 tests |
| `pnpm -F @radar/web test:render` | tous les contrôles passent |
| `pnpm -F @radar/web test:corpus` | 22 contrôles OK |
| `pnpm -F @radar/web test:sources-rouges` | SSR vérifié sur 2838 sources rouges |
| `pnpm -F @radar/web test:etats-vides` | 17 / 17 contrôles |
| `pnpm provenance:check` | `Provenance gate PASS: 0/71` |

Le gate de provenance et la CI (typechecks API/web, tests API, gate bloquant,
build web) proviennent de `origin/main` et sont conservés dans ce lot. Aucune
suite API complète n'est lancée ici : elle écrit dans une base PostgreSQL de
test partagée entre les agents.
