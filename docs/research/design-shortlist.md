# Design systems réutilisables — shortlist vérifiée (2026-11-10)

Objet : arrêter d'écrire du CSS générique à la main (« AI slop ») et prendre un système existant.
Astryx (`meta/astryx`) était un **exemple** : le point est qu'il en existe des dizaines, matures et
licences permissives, taillés pour des interfaces denses.

Toutes les métadonnées ci-dessous ont été mesurées par `gh api` et le registre npm le 2026-11-10.

## 1. Candidats

| Système | Dépôt | ★ | Licence | Dernier push | React 19 (peerDeps npm) | Ce qu'il apporte pour un poste de veille |
| --- | --- | --- | --- | --- | --- | --- |
| **IBM Carbon** | `carbon-design-system/carbon` (`@carbon/react` 1.120.0) | 9 612 | **Apache-2.0** | 2026-11-10 | ✅ `^19.0.0` (aussi 16/17/18) | **Data tables denses**, thème sombre « g100 », typographie IBM Plex, grille 2px, styles ops/entreprise. Le plus proche d'une salle de contrôle |
| **Primer** | `primer/react` (`@primer/react` 38.45.0) | 3 932 | **MIT** | 2026-11-10 | ✅ `18.x \| 19.x` | Le langage de GitHub : dense, sombre, mono pour les données, composants sobres. Léger, pas de Sass obligatoire |
| **PatternFly** | `patternfly/patternfly` (`@patternfly/react-core` 6.7.0) | 822 | **MIT** | 2026-11-09 | ✅ `^17 \| ^18 \| ^19` | Conçu pour les consoles d'ops (Red Hat) : dashboards, cartes de statut, tables, filtres |
| **Mantine** | `mantinedev/mantine` (`@mantine/core` 9.8.0) | 31 928 | **MIT** | 2026-11-09 | ✅ `^19.2.0` | Le plus gros catalogue (DataTable, notifications, spotlight/⌘K), thème dark natif, très actif |
| **shadcn/ui** | `shadcn-ui/ui` | 127 789 | **MIT** | 2026-11-10 | ✅ (copie de composants, pas de runtime) | On **possède le code** (copier-coller), zéro verrouillage. Impose Tailwind |
| **Radix Themes** | `radix-ui/themes` | 8 832 | **MIT** | 2026-04-11 | ✅ | Primitives accessibles + thème ; rythme de release plus lent |
| **HeroUI** | `heroui-inc/heroui` | 31 172 | **Apache-2.0** | 2026-11-10 | ✅ | Composants « modernes » animés (moins adapté au dense) |
| **Chakra UI** | `chakra-ui/chakra-ui` | 40 720 | **MIT** | 2026-11-10 | ✅ | Classique, bon écosystème |
| **Ant Design** | `ant-design/ant-design` | 100 137 | **MIT** | 2026-11-10 | ✅ | Très riche (tables, form) mais esthétique « admin chinois » datée |
| **Adobe Spectrum** | `adobe/react-spectrum` | 16 022 | **Apache-2.0** | 2026-11-09 | ✅ | Accessibilité de référence |
| **Fluent UI v9** | `microsoft/fluentui` | 20 386 | ⚠️ NOASSERTION | 2026-11-10 | ✅ | Licence non standard — à éviter sans lecture juridique |

## 2. Ce que ces libs apportent que notre CSS n'a pas

1. **Data tables** : tri, sélection, en-têtes collants, densité configurable, pagination — c'est 80 %
   de nos vues `sources` et `santé` (347 lignes).
2. **Cohérence des états** : focus, hover, disabled, chargement (skeletons), erreurs — notre CSS maison
   n'a que ce qu'on a pensé à écrire.
3. **Accessibilité** : rôles ARIA, navigation clavier, focus trap des dialogues — Carbon/Primer/PatternFly
   la testent en CI.
4. **Un vocabulaire visuel** déjà validé par des milliers d'écrans ops — donc pas de « slop ».

## 3. Recommandation

| Objectif | Choix |
| --- | --- |
| **Identité « salle de contrôle », dense, tables de données** | **IBM Carbon** (Apache-2.0, thème sombre g100, Plex Mono) |
| **Le plus léger / le plus sobre, sans Sass** | **Primer** (MIT, langage GitHub) |
| **Catalogue maximal, ⌘K, notifications, DataTable** | **Mantine** (MIT, React 19 strict) |
| **Zéro verrouillage, on possède le code** | **shadcn/ui** (MIT, mais Tailwind à installer) |

**Choix retenu pour radar-cyber : couche visuelle maison + TanStack Table** (arbitrage utilisateur).
Carbon avait d'abord été retenu ici ; il a été **écarté** : son data table impose sa propre grammaire
visuelle, là où le poste de veille a besoin d'une densité et de raccourcis qui lui sont propres.
On garde les jetons CSS existants (`--color-*`, `--raise`, `--sink`, mono pour les compteurs) et on
délègue à TanStack uniquement ce qui est pénible à réécrire : tri, en-têtes, état de table
(`@tanstack/react-table` 9.3.1, MIT) et virtualisation (`@tanstack/react-virtual` 3.14.26, MIT).
Arbitrage réversible : aucune dépendance visuelle n'est tissée dans les composants métier.

## 4. Adoption réelle (état des lieux)

Le plan Carbon ci-dessous n'a pas été suivi. Ce qui est en place aujourd'hui :

1. `@tanstack/react-table` 9.3.1 et `@tanstack/react-virtual` 3.14.26 (MIT) installés dans
   `@radar/web`. Aucune feuille de style tierce n'est chargée.
2. Les jetons restent les nôtres (`apps/web/src/styles.css`) ; les quatre variantes de thème
   continuent de fonctionner sans reprise.
3. TanStack est employé là où il paie : `DirectoryView` (tri, en-têtes, virtualisation de
   4 462 puis 104 462 lignes) et le rail de vues. `ReviewView` garde une liste native : la
   file se parcourt au clavier, une grille de table n'y apporte rien.
4. Restent en CSS maison, comme prévu : `Map3D`, `EventList`, `FamilyFilter`, `TimelineScrubber`,
   `OrgSheet`, `LiveAlerts`, `review.css`, `directory.css`.
5. Régression couverte par `apps/web/test/render.tsx` (rendu) et `apps/web/test/review-dom.tsx`
   (interactions clavier et décisions, jsdom).
