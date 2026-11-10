# Astryx (`meta/astryx`) — fit pour radar-cyber

Vérifié le **2026-11-10** par `gh api` et le registre npm. Agent de recherche indisponible
(plafond horaire du fournisseur) : audit réalisé directement par le parent.

## Métadonnées

| Champ | Valeur |
| --- | --- |
| Dépôt | `meta/astryx` — **MIT**, TypeScript, 21 169★, push 2026-11-10, release v0.7.11 (2026-11-07) |
| Paquets | `@astryxdesign/core` 0.7.12, `charts` 0.1.9, `lab` 0.1.9 |
| peerDeps core | `react >=19.0.0`, `react-dom >=19.0.0`, **`@stylexjs/stylex ^0.19.0`** |
| Taille npm (unpacked) | **28,9 Mo** (sources + types + maps ; le bundle final est arbre-secousu) |
| Dépendance runtime | `intl-messageformat ^11.2.9` (une seule) |

## 1. Catalogue réel — ce qui existe

`packages/core/src` compte **147 entrées**. Composants pertinents pour radar-cyber :

| Besoin radar-cyber | Composant Astryx | Verdict |
| --- | --- | --- |
| Tableaux denses (347 sources, 8 749 événements) | **`Table`** | ✅ existe |
| Navigation de vues (carte/graphe/sources/santé) | **`TabList`** | ✅ existe |
| Panneaux, fiches d'org, détail d'événement | `Card`, `ClickableCard`, `Drawer`, `BottomSheet`, `MetadataList` | ✅ |
| Alertes, statut de collecte | `Badge`, `Banner`, `Toast`, `Tooltip`, `ProgressBar`, `Skeleton`, `Spinner` | ✅ |
| Filtres, sélecteurs | `Selector`, `MultiSelector`, `ComplexSelector`, `Switch`, `CheckboxList`, `RadioList`, `Select` | ✅ |
| Palette de commandes / recherche globale | **`CommandPalette`** | ✅ (notre `/api/search` s'y brancherait bien) |
| Coquille applicative | `AppShell`, `NavMenu`, `Breadcrumbs` | ✅ |
| Typo | `Text`, `Code`, `CodeBlock`, `Blockquote`, `Citation` | ✅ |
| Dialogues | `Dialog`, `AlertDialog`, `DropdownMenu`, `ContextMenu` | ✅ |

**Manques** : pas de graphe (nous avons `react-force-graph-2d`), pas de carte (MapLibre), pas de
datagrid virtualisée type AG Grid (`Table` est un tableau stylé, pas une grille virtuelle).

## 2. Thématisation — faisable, mais c'est un vrai fichier à écrire

Le thème n'est ni des variables CSS ni un simple JSON : c'est du TypeScript qui appelle
`defineTheme` / `defineSyntaxTheme` depuis `@astryxdesign/core/theme`, avec des références de
palette générées (`neutralPaletteRefs.generated.ts`) et des variantes clair/sombre par jeton :

```ts
const neutralSyntax = defineSyntaxTheme({
  name: 'astryx-neutral',
  tokens: {
    keyword: [purple.light[30], purple.light[80]],
    ...
  },
});
```

Un thème « salle de contrôle » (fond `#08090b`, accent teal, sévérité S1-S5, familles désaturées)
est donc **réalisable**, mais c'est un fichier de thème complet à écrire et à maintenir — pas un
`styles.css` de 20 jetons. Les 8 thèmes fournis (butter, chocolate, gothic, matcha, neutral, probe,
stone, y2k) sont des points de départ, aucun n'est un thème CTI sombre.

## 3. StyleX dans Vite 8 — le vrai coût

- `@stylexjs/vite-plugin` **n'existe pas** sur npm (vérifié).
- Seul `@stylexjs/babel-plugin` **0.19.1** existe → il faut l'injecter dans la chaîne Babel de
  `@vitejs/plugin-react` (option `babel.plugins`) ou passer par un plugin esbuild/rollup maison.
- Conséquences concrètes : compilation supplémentaire par module, CSS émis en classes atomiques,
  ordre des styles à gérer, et un mode dégradé si le plugin n'est pas en place (styles absents, pas
  d'erreur). C'est **le** point de friction.

## 4. Poids

- `@astryxdesign/core` : 28,9 Mo unpacked (npm). Le coût réel dépend des imports : importer `Table`
  + `TabList` + `Badge` + `Toast` ne tire que leur graphe, pas les 147 composants. [ESTIMATION]
  quelques dizaines de Ko gzip après tree-shaking, à mesurer une fois intégré.
- `charts` (0.1.9) tire `d3-array`, `d3-scale`, `d3-shape` — utile si on remplace nos graphiques,
  inutile si on garde `uPlot`.

## 5. Verdict

**HYBRIDE**, pas ADOPTER.

| Option | Gain | Coût | Risque |
| --- | --- | --- | --- |
| ADOPTER partout | Cohérence totale, 147 composants, CommandPalette/AppShell | StyleX + thème custom à écrire + tous les composants à remapper | **Élevé** : v0.x, API mouvante (push quotidien), verrouillage toolchain |
| **HYBRIDE** ✅ | `Table`, `TabList`, `Badge`, `Toast`, `Dialog`, `CommandPalette` pour l'interface ; MapLibre + notre CSS pour la carte et la densité | StyleX à brancher une fois, thème custom limité aux tokens utilisés | Moyen : 1 dépendance toolchain, mais composants isolés |
| ÉVITER | Zéro dépendance, contrôle total (CSS maison, déjà écrit) | Tout à écrire à la main | Faible techniquement, mais plafond esthétique si personne ne pousse le design |

**Effort estimé pour HYBRIDE : 2 à 3 jours** (0,5 j StyleX + build, 1 j thème sombre, 0,5-1 j
remplacement des 5-6 composants prioritaires, 0,5 j régression visuelle des 4 thèmes).

### Les 3 risques à surveiller

1. **Verrouillage StyleX** : sans plugin compilé, les styles ne s'appliquent pas silencieusement.
   Un build qui « passe » peut rendre une UI nue.
2. **Version 0.x** : releases fréquentes (v0.7.11 le 7 nov., push quotidien) → API non gelée.
3. **Thème** : notre identité « salle de contrôle » devra être réécrite dans leur modèle de jetons ;
   on perd la simplicité d'un `styles.css` lisible.

## 6. Si tu choisis HYBRIDE — l'ordre d'attaque

1. Brancher `@stylexjs/babel-plugin` dans `@vitejs/plugin-react`, vérifier qu'un composant Astryx
   rend bien son style en dev **et** en build (piège n°1).
2. Thème `radar-dark` : fond `#08090b`, surfaces `#0e1014`, accent teal `#3ddbd9`, sévérité S1-S5.
3. Remplacer dans l'ordre : `Badge` (sévérité) → `TabList` (les 4 vues) → `Table` (santé des sources)
   → `Toast` (collecte) → `Dialog` (fiche org) → `CommandPalette` (recherche `/api/search`).
4. Garder impérativement en CSS maison : `Map3D`, `EventList` (densité 34 px), `FamilyFilter`,
   `TimelineScrubber` — Astryx n'apporte rien sur ces surfaces.
