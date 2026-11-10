# UI — Radar Cyber Nouvelle-Aquitaine

## Vues

Quatre vues navigables via la barre `nav` (`App.tsx`) :

- **carte** — carte 3D MapLibre (`Map3D`) avec arcs, légende familiale, inspecteur d'organisation.
- **graphe** — graphe force-directed (`GraphView`) des organisations/sources/événements.
- **sources** — `SourcesView` : état détaillé des flux.
- **santé** — `HealthView` : état des sources pour le monitoring.

## Hiérarchie des composants (`apps/web/src/`)

```
App.tsx
├── KpiBand          (4 indicateurs)
├── EventTicker      (14 derniers événements)
├── [view]
│   ├── sante  → HealthView
│   ├── sources → SourcesView
│   └── carte/graphe → workspace
│       ├── aside.panel (gauche)
│       │   ├── EventList (+ FamilyFilter dans filters)
│       │   └── TimelineScrubber
│       ├── section.stage
│       │   ├── Map3D | GraphView
│       │   └── MapLegend (carte uniquement)
│       └── aside.panel.inspector
└── StatusBar
```

## Système de design

- Thèmes : `observatoire`, `terminal`, `souverain`, `clair` (select `.theme-picker`).
- Fond de carte : `sat` (satellite) / `plan` via `.basemap-picker`.
- Tokens couleur/sévérité/familles/natures orgs définis dans `styles.css`, `components/panels.css`, `components/timeline.css`, `components/chrome.css`.
- Sévérité : portée par `Event.severity` (nombre) dans `Map3D`/`GraphView`.
- Familles : filtre multi-sélection `FamilyFilter` (`Set<string>`).

## Raccourcis / interactions

- Navigation par boutons de vues.
- Sélection d'organisation : `onSelect`/`onSelectEvent` → inspecteur.
- Filtre temporel : `TimelineScrubber` (range `from`/`to`).
- Filtre familial : `FamilyFilter` avec compteurs.

## États de la carte

- `basemap`: `"sat" | "plan"`.
- Données : `orgs`, `events` filtrés, `flows` (arcs org → hébergement, fallback orgs).

## Ajouter un composant

1. Créer `apps/web/src/components/<Nom>.tsx`.
2. Importer dans `App.tsx`, brancher les props typées.
3. Styles dans le CSS approprié (panels/timeline/chrome) ou `styles.css`.
4. Vérifier `pnpm -F @radar/web typecheck`.
