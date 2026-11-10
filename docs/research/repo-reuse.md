# Réutilisation de dépôts GitHub — carte 3D cybermenaces

Évalué le **2026-11-10**. Contexte : MapLibre GL JS 6.17 + React 19.3 + Vite 8, avec `deck.gl 9.4.1`
(`@deck.gl/core`, `/layers`, `/maplibre`), `3d-tiles-renderer 0.5.4` et `three 0.187.0` déjà installés.
Objectif : arcs animés, bâtiments 3D, temps réel SSE.

## 1. Bibliothèques de rendu

### visgl/deck.gl — RÉUTILISER

- <https://github.com/visgl/deck.gl> — MIT, ~14,7 k étoiles, maintenu par vis.gl / OpenJS Foundation.
- Dernière release : **v9.4.1** (28 oct. 2026) ; v9.4.0 (5 sept. 2026) annonçait la « final v9 release ».
  C'est exactement la version installée.
- Compat : `MapLibreOverlay` supporte officiellement MapLibre **v4.5.1+/v5/v6** ; le mode `interleaved`
  partage le contexte WebGL2 (les arcs passent correctement derrière les labels). React 19 : sans objet,
  l'overlay est un `IControl` pur JS monté dans un `useEffect`. Vite 8 : ESM, OK.
- Poids : `@deck.gl/core` + `layers` ≈ 150-250 ko gzip selon les layers importés (tree-shaking par
  import nommé).
- **Verdict : RÉUTILISER.** Couvre `ArcLayer` (arcs), `TripsLayer` (trajets animés),
  `ScatterplotLayer`, `TextLayer`, `HexagonLayer`. C'est le cœur du rendu, pas un candidat.

### NASA-AMMOS/3DTilesRendererJS — RÉUTILISER

- <https://github.com/NASA-AMMOS/3DTilesRendererJS> — Apache-2.0, ~336 k téléchargements/semaine,
  mainteneur actif (gkjohnson), adossé à NASA AMMOS.
- Release installée : **v0.5.4** (`TilesFadePlugin`, `ImplicitTilingPlugin`, support PlayCanvas).
- Compat : indépendant de MapLibre (renderer Three.js), s'intègre via un `CustomLayerInterface`.
- **Verdict : RÉUTILISER.** Meilleur renderer 3D Tiles JS disponible, bien plus léger que CesiumJS.

### opengeos/maplibre-gl-3d-tiles — ADAPTER

- <https://github.com/opengeos/maplibre-gl-3d-tiles> — MIT, v0.5.6 (28 juil. 2026), corrige explicitement
  la compat MapLibre v6 (plus de default export).
- Il utilise lui-même `3d-tiles-renderer` + `three` : c'est un wrapper.
- **Verdict : ADAPTER.** Récupérer son pattern de `CustomLayerInterface` (renderer Three partagé,
  `altitudeOffset`, `requestHeaders`) plutôt que d'ajouter la dépendance : on contrôle déjà le cycle de
  vie de la carte dans `Map3D.tsx`.

### visgl/react-map-gl — ÉVITER

- <https://github.com/visgl/react-map-gl> — MIT, v8.1.3 (sept. 2026), entry point `react-map-gl/maplibre`.
- **Verdict : ÉVITER.** `Map3D.tsx` câble déjà `maplibre-gl` directement ; react-map-gl ajoute une
  abstraction caméra qui entre en conflit avec `MapLibreOverlay`. Gain ≈ 0, coût = réécriture + risque
  de double contrôle caméra.

### vasturiano/three-globe / globe.gl — ÉVITER

- <https://github.com/vasturiano/three-globe> — MIT, v2.45.6 (14 oct. 2026), mainteneur unique.
- Rendu globe autonome : pas de projection mercator, pas de tuiles de fond, pas de `fill-extrusion`.
- **Verdict : ÉVITER.** Ce serait remplacer MapLibre, pas le compléter. Son API `arcDashAnimateTime`
  reste une bonne inspiration, reproduite nativement par `ArcLayer`.

### Project-PLATEAU/PLATEAU-VIEW-3.0 — ÉVITER

- `reearth/plateau-view` n'existe pas sous ce nom : les dépôts réels sont
  `Project-PLATEAU/PLATEAU-VIEW-3.0` (Apache-2.0, 23 étoiles, dernier push mars 2024) et
  `eukarya-inc/reearth-plateauview` (archivé). `reearth/go3dtiles` est un parseur Go.
- **Verdict : ÉVITER.** Application complète sur Cesium/Re:Earth, pas une librairie ; inactive depuis 2024 ;
  stack incompatible.

## 2. Démos « threat map » réutilisables

| Dépôt | Licence | Ce qui est copiable |
| --- | --- | --- |
| [nihalnihalani/ARGUS](https://github.com/nihalnihalani/ARGUS) | **aucune détectée** | Rien (référence d'architecture seulement : structure `{from,to,family,severity}`) |
| [aadithya-vimal/threatstream](https://github.com/aadithya-vimal/threatstream) | MIT | `src/lib/threat/` : normalisation, déduplication par id stable, transitions diff (fade-in, fenêtre de grâce) — exactement le pattern pour notre SSE `new` |
| [tinywaffles/Catto](https://github.com/tinywaffles/Catto) | **AGPL-3.0** | Rien (copyleft fort → contamination) ; référence de design seulement |

Non retenus : `nadirzhon/shadowmap` (Leaflet), `AlexPGAO/cybermap-attack-globe` (Three.js mono-fichier,
utile pour lire un shader d'arc simple), `VortexisTV/HoneyRadar` et `OCDEkr/ThreatMapDemo` (Globe.GL).

## 3. Plan d'intégration

**Étape 1 — overlay interleaved.** Après création de la map :

```ts
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { ArcLayer } from "@deck.gl/layers";

const overlay = new MapLibreOverlay({ interleaved: true, layers: [] });
map.addControl(overlay);
// mise à jour temps réel sans recréer la carte :
overlay.setProps({ layers: buildLayers(arcs) });
```

Un seul overlay interleaved par map ; WebGL2 requis ; ne pas passer `viewState`/`controller` (la caméra
reste à MapLibre).

**Étape 2 — arcs animés.** `ArcLayer` avec `greatCircle: true` et les props natives de dash
(`arcDashLength`, `arcDashGap`, `arcDashAnimateTime`) pour le flux continu ; `TripsLayer` en complément
pour rejouer les trajectoires récentes (`trailLength`, `currentTime`, `fadeTrail`).

**Étape 3 — bâtiments 3D.** Garder le `fill-extrusion` MapLibre existant : pas de deck.gl pour les
bâtiments. En interleaved, l'ordre se règle par `beforeId` pour glisser les arcs sous ou sur les labels.

**Étape 4 — tuiles 3D.** Custom layer MapLibre + renderer Three partagé :

```ts
const tilesRenderer = new TilesRenderer(tilesetUrl);
tilesRenderer.setCamera(camera);
tilesRenderer.setResolutionFrom(camera, renderer);
// dans render(): tilesRenderer.update();
```

`TilesFadePlugin` pour les fondus, `altitudeOffset` pour caler sur le terrain.

**Étape 5 — temps réel SSE.** Sur l'event `new` de `/api/stream` : mapper snake_case → objet arc,
append dans un `useReducer`, puis `overlay.setProps({ layers })` dans un `useEffect`. Appliquer le diff
de threatstream (id stable, fade-in, purge des arcs expirés). Au-delà de ~2 000 arcs, agréger ou
fenêtrer : `ArcLayer` = 1 instance GPU par arc.

## Récapitulatif

| Dépôt | Licence | Dernière release | Compat ML6 / React 19 | Verdict |
| --- | --- | --- | --- | --- |
| visgl/deck.gl | MIT | v9.4.1 (2026-10-28) | oui, officiel | RÉUTILISER (installé) |
| NASA-AMMOS/3DTilesRendererJS | Apache-2.0 | v0.5.4 | oui (custom layer) | RÉUTILISER (installé) |
| opengeos/maplibre-gl-3d-tiles | MIT | v0.5.6 (2026-07-28) | oui (v6 fixé) | ADAPTER (copier le pattern) |
| visgl/react-map-gl | MIT | v8.1.3 (2026-09) | oui | ÉVITER (redondant) |
| vasturiano/three-globe | MIT | v2.45.6 (2026-10-14) | non (globe ≠ carte) | ÉVITER |
| PLATEAU-VIEW-3.0 | Apache-2.0 | push 2024-03 | non (Cesium) | ÉVITER |
| nihalnihalani/ARGUS | aucune | actif 2026 | oui | référence seulement |
| aadithya-vimal/threatstream | MIT | actif 2026 | oui | copier `lib/threat` (diff/dedup) |
| tinywaffles/Catto | AGPL-3.0 | actif 2026 | oui | ÉVITER la copie (copyleft) |
