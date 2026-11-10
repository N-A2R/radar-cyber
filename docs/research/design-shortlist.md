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

**Choix retenu pour radar-cyber : Carbon**, avec Primer en repli si l'intégration Sass pose problème.
Raisons : Apache-2.0 propre, data table dense native, thème sombre d'entreprise, typographie IBM Plex
(dont une mono pour les compteurs et les dates), et une esthétique qui n'a rien d'un template
générique. Coût : Sass (peerDep) + styles Carbon à charger une fois.

## 4. Plan d'adoption (si validé)

1. `pnpm -F @radar/web add @carbon/react sass` ; importer la feuille Carbon une fois dans `main.tsx`.
2. Thème : `g100` par défaut, nos 4 variantes deviennent des surcharges de tokens Carbon
   (`--cds-*`), pas un système parallèle.
3. Remplacer dans l'ordre : `DataTable` (vue santé des 347 sources) → `Tag` (familles/sévérité) →
   `Tabs` (4 vues) → `Search` + `Modal` (recherche, fiche org) → `InlineNotification` (collecte).
4. Garder impérativement en CSS maison : `Map3D` (MapLibre), `EventList` (densité 34 px),
   `FamilyFilter`, `TimelineScrubber`.
5. Effort estimé : **1,5 à 2 jours** (0,5 j intégration Sass/theme, 1 j remplacement des 5 composants,
   0,5 j régression des 4 thèmes).
