# Tokens CSS Astryx — lot 6

OBJECTIF : atteint — 7 / 7 déclarations d'overlay, d'ombre et de badge utilisent des tokens Astryx (0 couleur crue résiduelle sur ces déclarations).

## Périmètre

Le lot 6 remplace les couleurs codées en dur de quatre feuilles de style par les
tokens définis par `@astryxdesign/core@0.7.17`, importé dans
`apps/web/src/main.tsx` (`reset.css` puis `astryx.css`) :

| Fichier | Déclarations converties | Tokens |
|---|---|---|
| `apps/web/src/components/review.css` | 1 | `--color-overlay` |
| `apps/web/src/graph/graphview.css` | 2 | `--color-overlay-pressed` |
| `apps/web/src/map/map-timeline.css` | 1 | `--color-overlay-pressed` |
| `apps/web/src/components/actor-attributions.css` | 3 | `--color-background-{green,yellow,red}`, `--color-on-{success,warning,error}` |

Soit 7 déclarations et 10 références de tokens. Les huit noms de tokens
figurent dans la feuille de tokens installée
(`@astryxdesign/core/dist/astryx.css`) : aucun n'est un alias local ni une
variable non définie. Les valeurs historiques remplacées étaient
`rgba(0, 0, 0, 0.55)`, `rgba(0, 0, 0, 0.28)`, `rgb(0 0 0 / 35%)` et les six
hexadécimaux des badges de confiance.

## Mesure reproductible

```bash
F="apps/web/src/components/review.css \
apps/web/src/graph/graphview.css \
apps/web/src/map/map-timeline.css \
apps/web/src/components/actor-attributions.css"

# Déclarations portant un token du lot 6 : 7 attendues
grep -hE 'var\(--color-(overlay|overlay-pressed|background-(green|yellow|red)|on-(success|warning|error))\)' $F | wc -l

# Références de tokens : 10 attendues
grep -hoE 'var\(--color-(overlay|overlay-pressed|background-(green|yellow|red)|on-(success|warning|error))\)' $F | wc -l

# Anciennes couleurs crues sur ce périmètre : 0 attendu
grep -hE 'rgba\(0, ?0, ?0, ?0\.(55|28)\)|rgb\(0 0 0 / 35%\)|#d7f2df|#14532d|#fff0c7|#713f12|#f2dede|#7f1d1d' $F | wc -l
```

Résultat observé sur cette branche après fusion de `origin/main` : `7`, `10`,
`0`. Les autres couleurs des mêmes fichiers (fallbacks des variables
historiques `--line-strong`, `--text`, bordures neutres) ne font pas partie du
périmètre de ce lot et restent inchangées.

## Vérifications

- `tsc --noEmit` API et web : vert (aucune erreur).
- `pnpm install --frozen-lockfile --lockfile-only` : lockfile à jour, aucun
  changement écrit.
- `pnpm provenance:check` : `Provenance gate PASS: 0/71`.
- Aucune suite API ni écriture en base : le lot ne touche que des feuilles de
  style et ce document.
