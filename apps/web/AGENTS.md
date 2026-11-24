# apps/web — règles de front (Astryx)

Le design system du front est **Astryx** : `@astryxdesign/core` + `@astryxdesign/theme-gothic`.
Ce fichier lie toute PR sur ce workspace, humaine ou agent : l'objectif est qu'un écran écrit par deux auteurs différents soit indiscernable.

## La cascade CSS (main.tsx)

1. `@astryxdesign/core/reset.css`
2. `@astryxdesign/core/astryx.css` — variables du système
3. `@astryxdesign/theme-gothic/fonts.css` + `theme.css` — le thème actif
4. `InternationalizationProvider locale="fr-FR"` + catalogue français Astryx
5. `./styles.css` — le pont de jetons radar

Ne pas importer d'autre feuille globale. Une feuille de composant ne charge que ses propres styles. Les libellés internes Astryx (champs, pagination, menus) passent par le catalogue français.

## Le pont de jetons (src/styles.css)

Tout jeton radar alias une variable Astryx :

| Jeton radar | Source Astryx |
| --- | --- |
| `--bg` / `--surface` / `--surface-2` / `--surface-3` | `--color-background-body` / `-surface` / `-card` / `-muted` |
| `--text` / `--muted` / `--faint` | `--color-text-primary` / `-secondary` / `-disabled` |
| `--line` / `--line-strong` | `--color-border` / `--color-border-emphasized` |
| `--accent` / `--accent-ink` | `--color-accent` / `--color-on-accent` |
| `--radius` | `--radius-inner` |
| `--space-1..6` | `--spacing-1..6` (base 4 px) |
| `--font-sans` / `--font-mono` / `--font-display` | `--font-family-body` / `-code` / `-heading` |
| `--raise` / `--sink` | `--shadow-low` / `--shadow-med` |

Conséquence : dans un composant, on écrit `var(--surface)` — jamais `#0e1014`, et jamais `var(--color-background-surface)` directement (le pont est la seule API locale ; il garantit que les variantes `data-theme` continuent de fonctionner).

## Règles

1. Un nouveau composant utilise un composant Astryx s'il existe (table ci-dessous). Sinon il écrit du CSS à jetons dans sa feuille locale.
2. Interdit : couleur, police, rayon, espacement ou ombre de chrome codés en dur dans un composant (`#fff`, `padding: 12px`, `border-radius: 6px`...). Toujours `var(--...)`.
3. Les couleurs de DONNÉES (sévérités 1-5, familles d'événement, natures d'organisation) sont des jetons du pont (`--sev-*`, `--family-*`, `--org-*`) : c'est le seul espace colorimétrique local autorisé.
4. Les composants tiers (maplibre, force-graph) se thèment par `className` + jetons, jamais par style inline.
5. Un état (vide, erreur, chargement) se rend avec le composant Astryx correspondant (EmptyState, Banner, Skeleton) — pas de div maison.
6. Les tests DOM/SSR (`test:navigation`, `test:a11y`) verrouillent la structure du shell (`nav.rail__nav button`, live regions error/offline) : ne pas la changer sans mettre à jour le test dans le même PR.

## Correspondance composants

| Besoin | Composant Astryx |
| --- | --- |
| Action | `Button` (`@astryxdesign/core/Button`) |
| Action icône seule | `IconButton` |
| Statut / catégorie | `Badge` |
| Message persistant (erreur, hors ligne, démo) | `Banner` |
| Conteneur | `Card` / `ClickableCard` |
| Tableau | `Table` (+ TanStack pour la virtualisation) |
| Squelette de chargement | `Skeleton` |
| État vide | `EmptyState` |
| Modale | `Dialog` / `AlertDialog` |
| Panneau latéral (fiche org, inspecteur) | `Drawer` |
| Message court | `Toast` |
| Recherche ⌘K | `CommandPalette` |
| Filtre mutuellement exclusif | `SegmentedControl` |
| Formulaire | `Field` + `TextInput` / `Selector` |
| Point d'état (flux direct) | `StatusDot` |
| Navigation d'app | `TopNav` / `SideNav` (voir règle 6 avant d'y toucher) |

## Migration terminée (2026-11-24)

La fondation et les écrans existants utilisent Astryx. Le fil d'événements n'est monté que sur Carte et Graphe ; les autres vues occupent toute la largeur.

- [x] `table.data` / `ds-table` → `Table`
- [x] `ds-modal` → `Dialog`
- [x] `ds-toast` → suppression au profit des états Astryx
- [x] `Skeleton.tsx` maison → `Skeleton`
- [x] `CommandPalette.tsx` maison → `CommandPalette`
- [x] `OrgSheet` / `Inspector` → `Drawer`
- [x] `LoginScreen` → `Card` + `Field` + `TextInput` + `Button variant="primary"`
- [x] `FamilyFilter` → `SegmentedControl`
- [x] `ExportMenu` → `DropdownMenu`
- [x] `ds-card` / `ds-field` / `ds-button` (styles.css) → `Card` / `Field` / `Button`, puis suppression du CSS mort
- [x] Re-audit AA des couleurs de données sur les surfaces gothic (`test:a11y`)

## Thème

Le thème actif est `@astryxdesign/theme-gothic`. Les anciens thèmes `terminal`, `souverain` et `clair` ont été supprimés ; ne pas réintroduire une seconde feuille de thème.
