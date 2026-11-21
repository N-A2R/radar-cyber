# Interface — Radar Cyber Nouvelle-Aquitaine

Les vues, une seule coquille. Ce document décrit ce que le code fait, pas ce
qu'on aimerait qu'il fasse : chaque composant cité existe dans
`apps/web/src/`, chaque fichier CSS cité est réellement importé.

## La coquille

`App.tsx` monte une grille à deux ou trois colonnes :

```
fil d'événements (gauche, 352 px)
  ├── FamilyFilter   — filtre par famille, avec compteurs
  └── EventList      — 300 derniers événements, « régional d'abord » par défaut
scène (centre)
  └── vue active
inspecteur (droite, 320 px, seulement si une sélection est ouverte)
  ├── Inspector      — événement ou organisation sélectionné
  └── OrgSheet       — fiche d'organisation détaillée
```

En haut : la marque, le rail de vues, le sélecteur de fond de carte
(`satellite` / `plan`), l'état du flux temps réel et la déconnexion.

Sans jeton de session, `LoginScreen` remplace toute la coquille : aucune requête
authentifiée ne part avant la connexion.

## Les vues

| Vue | Composant | Ce qu'elle montre |
|---|---|---|
| **Carte** | `map/Map3D.tsx` | Carte MapLibre GL 6 : fond satellite IGN ou plan sombre, terrain, bâtiments extrudés OpenFreeMap, choroplèthe de densité par département, arcs de flux, points d'organisation cliquables, événements agrégés au-delà de 5 000 points. |
| **Graphe** | `graph/GraphView.tsx` | Deux rendus du même graphe : réseau force-dirigé (`react-force-graph-2d`) et matrice famille × département (`components/GraphMatrix.tsx`). Bascule en haut à droite. |
| **Sources** | `components/SourcesView.tsx` | Registre des flux : état, dernier succès, dernier échec, nombre d'éléments, recherche. |
| **Corpus** | `components/CorpusView.tsx` | Tableau de bord de `GET /api/corpus/stats` : sources par famille et par département, organisations avec domaine, incidents confirmés et taux de sources productives sur 30 jours. |
| **Santé** | `components/HealthView.tsx` | Même donnée, orientée diagnostic : répartition par famille et par état. |
| **Alertes** | `components/AlertsView.tsx` | File d'alertes, séparée en incidents d'organisation et avis régionaux, filtres statut et sévérité, détail dépliable avec provenance, corroboration et note de confiance sur 100. |

## Données et temps réel

- `api.ts` est le seul client HTTP : un jeton `Bearer` en en-tête, sauf pour le
  flux SSE qui le passe en paramètre d'URL (un `EventSource` ne peut pas poser
  d'en-tête).
- `GET /api/stream` pousse chaque nouvel événement ; `App.tsx` l'insère en tête
  du fil et marque `connected`.
- Un endpoint en erreur n'empêche plus l'affichage : le chargement initial
  utilise `Promise.allSettled` et signale seulement les blocs indisponibles.
- Mode démonstration : `VITE_DATA_MODE=mock` sert `mock.ts` sans aucun appel API.

## Fichiers de style

Un seul point d'entrée, `styles.css`, plus un CSS par composant importé par le
composant lui-même :

| Fichier | Importé par |
|---|---|
| `styles.css` | `main.tsx` (tokens `--color-*`, `--surface`, `--border`, thèmes `terminal` / `souverain` / `clair`) |
| `components/feed.css` | `EventList`, `FamilyFilter` |
| `components/alerts.css` | `AlertsView` |
| `components/sources.css` | `SourcesView`, `HealthView` |
| `components/graphmatrix.css` | `GraphMatrix` |
| `components/inspector.css` | `Inspector` |
| `components/orgsheet.css` | `OrgSheet` |
| `components/login.css` | `LoginScreen` |

## Ajouter une vue

1. Créer `apps/web/src/components/<Nom>.tsx`.
2. Ajouter son identifiant à `ViewKey` dans `contracts.ts` et à `VIEWS` dans
   `App.tsx`.
3. Brancher le rendu dans la scène.
4. `pnpm -F @radar/web typecheck`.
