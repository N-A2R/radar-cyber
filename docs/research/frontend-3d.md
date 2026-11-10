# Recherche — Front 3D / cartographie : briques à réutiliser

*Vérifié le 2026-11-10. Chaque URL a été interrogée le jour même (API GitHub / curl / registre npm) ; code HTTP et licence lus directement. Cadre légal : usage **personnel, interne, non diffusé, non commercial** → copier du code **GPL/AGPL** dans le repo n'est acceptable que si le repo reste privé et n'est jamais diffusé ; par défaut on copie le *pattern*, pas le code.*

## 1. Versions installées vs recommandées

| Paquet | Installé | Dernier npm (vérifié) | Verdict |
|---|---|---|---|
| `@deck.gl/*` | 9.4.1 | **9.4.1** (registry.npmjs.org, HTTP 200) | ✅ à jour. Note : dernier *tag GitHub* visgl/deck.gl = v9.3.12 (2026-10-30), npm est en avance. |
| `3d-tiles-renderer` | 0.5.4 | **0.5.4** (registry.npmjs.org, HTTP 200) | ✅ à jour, c'est la version consommée par `maplibre-gl-three` et `opengeos/maplibre-gl-3d-tiles`. |
| MapLibre GL JS | — | repo actif (push 2026-11-10) | Licence `LICENSE.txt` « Copyright (c) 2023, MapLibre contributors », clauses BSD-3 (GitHub la classe NOASSERTION). |

## 2. Dépôts évalués

| Dépôt | URL | ★ | Dernier commit | Licence (lue) | Verdict |
|---|---|---|---|---|---|
| visgl/deck.gl | github.com/visgl/deck.gl | 14 743 | 2026-11-10 | MIT | **RÉUTILISER** — exemples officiels dans `examples/website/` (arc, maplibre, trips, globe, 3d-heatmap, heatmap, 3d-tiles, path-style-extension, terrain-extension). On copie les patterns de couches, on consomme le paquet npm. |
| visgl/deck.gl-website | github.com/visgl/deck.gl-website | — | — | — | **N'EXISTE PAS** (GitHub API → HTTP 404). La gallery vit dans `visgl/deck.gl/examples/website/`. |
| visgl/deck.gl-community | github.com/visgl/deck.gl-community | 101 | 2026-11-10 | MIT | **ADAPTER** — `modules/timeline-layers` (HorizonGraph, time-axis) et `modules/layers`. ⚠️ le README officiel prévient : code sans mainteneur dédié, pas de support. Copier au cas par cas, pas dépendre du paquet. |
| maplibre/maplibre-gl-js | github.com/maplibre/maplibre-gl-js | 12 055 | 2026-11-10 | BSD-3 (LICENSE.txt) | **RÉUTILISER** (déjà en prod). Exemples officiels : `animate-a-point`, `animate-a-marker`, `animate-a-line`, `animate-a-point-along-a-route`, `add-3d-tiles-3d-objects-and-models-using-threejs` (HTTP 200). |
| NASA-AMMOS/3DTilesRendererJS | github.com/NASA-AMMOS/3DTilesRendererJS | 2 522 | 2026-11-07 | Apache-2.0 | **RÉUTILISER** (déjà en prod, v0.5.4). On consomme le paquet ; ses examples/ servent de référence pour le renderer three.js. |
| opengeos/maplibre-gl-3d-tiles | github.com/opengeos/maplibre-gl-3d-tiles | 19 | 2026-10-20 | MIT | **ADAPTER** — `IControl` MapLibre + React wrapper autour de 3d-tiles-renderer, Draco/KTX2, multi-tilesets. 19★ mais actif et exactement notre cas d'usage ; on copie la structure du custom layer plutôt que d'ajouter la dépendance. |
| safwat-halaby/maplibre-gl-three | github.com/safwat-halaby/maplibre-gl-three | 7 | 2026-10-07 | MIT | **ADAPTER/RÉUTILISER** — `ThreeDManager` (custom layer three.js + 3D Tiles). C'est la lib derrière les exemples officiels MapLibre « add-3d-tiles… » et « raycast-3d-tiles » (HTTP 200). Petit (7★) mais canonique. |
| clement-igonet/maplibre-gl-3dtiles-terrain | github.com/clement-igonet/maplibre-gl-3dtiles-terrain | 3 | 2026-07-28 | BSD-3-Clause | **ÉVITER** — 3★, recouvre ce que font les deux précédents. |
| reearth/reearth-buildings | github.com/reearth/reearth-buildings | 4 | 2026-09-30 | MIT | **RÉUTILISER** (consommation) — « Overture Maps → 3D Tiles 1.1 on Cloudflare Workers » ; https://buildings.reearth.land → HTTP 200. C'est la source de tuiles 3D bâtiments déjà visée ; le code Workers est copiable si on veut auto-héberger la conversion Overture→3D Tiles. |
| osmbuildings/osmbuildings | github.com/osmbuildings/osmbuildings | 1 013 | **2021-04-29** | Licence custom BSD-style (LICENSE.md, © 2018 OSM Buildings) | **ÉVITER** — mort depuis 4 ans, rendu 2D-extrudé maison sans deck.gl ; on fait déjà mieux avec fill-extrusion + 3D Tiles. |
| syt123450/giojs | github.com/syt123450/giojs | 1 742 | **2021-02-18** | Apache-2.0 | **ÉVITER** — globe Data-Driven Documents abandonné, canvas 2D, pas intégré MapLibre. |
| cyanfish-x/tellux | github.com/cyanfish-x/tellux | 218 | 2026-11-04 | MIT | **ADAPTER** — moteur globe three.js (terrain, 3D Tiles, atmosphère, nuages). On copie les shaders atmosphère/nuages si on veut un halo terrestre hors MapLibre-globe. |
| pmndrs/postprocessing | github.com/pmndrs/postprocessing | 2 963 | 2026-11-01 | Zlib | **RÉUTILISER** — bloom/SelectifBloom sur la scène three.js (3D Tiles). Zlib = pas de contrainte. Effort : S si on rend les tuiles dans notre propre renderer three.js, L si on veut bloom sur les couches deck.gl (interop maplibre overlay non triviale). |
| geoblocks/maplibre-gl-shader-layer | github.com/geoblocks/maplibre-gl-shader-layer | 38 | 2026-07-02 | MIT | **ADAPTER** — squelette de custom layer MapLibre en GLSL pur (heatmaps animées, filtres). Base propre pour un halo pulsant ou un heatmap animé. |
| koala73/worldmonitor | github.com/koala73/worldmonitor | 90 432 | 2026-11-10 | **AGPL-3.0** | **ÉVITER (code) / pattern oui** — dashboard de threat map global réel (90k★). Utilise `arcDashAnimateTime(5000)` (src/components/GlobeMap.ts:906, 4080-4083). **Ne pas copier le code** (AGPL, contamination) sauf repo privé non diffusé ; on retient le pattern : arcs deck.gl + `arcDashAnimateTime` + toggle pause. |

## 3. Extraits copiables (vérifiés, licences compatibles)

### 3.1 ArcLayer animé — pattern officiel (MIT, visgl/deck.gl `examples/website/arc/app.tsx`, lu intégral, 162 l.)

```ts
new ArcLayer<MigrationFlow>({
  id: 'arc',
  data: arcs,
  getSourcePosition: d => d.source.properties.centroid,
  getTargetPosition: d => d.target.properties.centroid,
  getSourceColor: d => (d.value > 0 ? inFlowColors : outFlowColors)[d.quantile],
  getTargetColor: d => (d.value > 0 ? outFlowColors : inFlowColors)[d.quantile],
  getWidth: strokeWidth
})
```
+ animation : `extensions: [new ArcFactorExtension]` ou plus simple `arcDashAnimateTime` — effort **S** (1-2 h) pour arcs statiques animés, **M** pour arcs « lancés » depuis une source (style threat map).

### 3.2 AnimatedArcLayer — shader officiel réutilisable (MIT, `examples/website/maplibre/animated-arc-layer.ts`, lu, 105 l.)

Sous-classe `ArcLayer` qui injecte `getSourceTimestamp`/`getTargetTimestamp` + uniform `timeRange` dans le vertex shader (`in float instanceSourceTimestamp`, plugin `animatedArc`). C'est **exactement** la brique pour un scrubber temporel sur les arcs : le temps est passé en uniform, pas recalculé par frame JS. Effort d'intégration : **S-M** (copier le fichier, brancher notre timeline). Testable : `pnpm dlx` sur l'exemple maplibre du repo deck.gl.

### 3.3 Custom layer three.js ↔ MapLibre (MIT, maplibre-gl-three / opengeos/maplibre-gl-3d-tiles)

```js
import {ThreeDManager} from 'maplibre-gl-three';
// map.addControl(new ThreeDManager(map, {three, renderer, tilesOptions}))
```
(README lu, HTTP 200 ; l'exemple officiel https://maplibre.org/maplibre-gl-js/docs/examples/add-3d-tiles-3d-objects-and-models-using-threejs/ → HTTP 200.) Effort : **S** si on adopte maplibre-gl-three, **M** si on garde notre implémentation 3d-tiles-renderer actuelle et qu'on s'inspire d'opengeos pour le contrôle/fly-to.

### 3.4 Halo pulsant / point animé (BSD-3, docs MapLibre)

Pas de « pulsing-dot » chez MapLibre (URL maplibre.org/.../pulsing-dot/ → HTTP 404) ; les exemples officiels vérifiés sont `animate-a-point`, `animate-a-marker`, `animate-a-line`. Pattern : sprite DOM/canvas animé via `requestAnimationFrame` + `marker.setLngLat`, ou shader-layer (geoblocks) pour la version GPU. Effort : **S** (DOM) / **M** (GLSL).

### 3.5 Bloom (Zlib, pmndrs/postprocessing)

`EffectComposer` + `BloomEffect({ intensity, luminanceThreshold })` sur le renderer three.js qui affiche les 3D Tiles. Effort : **S** dans notre pipeline three.js existant.

## 4. Ce qui manque — « rien de réutilisable, on écrit »

| Besoin | Constat vérifié | Décision |
|---|---|---|
| **Timeline scrubber** (UI lecture/pause/scrub pilotant couches deck.gl) | `@deck.gl-community/timeline-layers` = graphes temporels (HorizonGraph, axes), **pas** un scrubber de playback. Aucun composant React scrubber+deck.gl trouvé dans les dépôts vérifiés. | **On écrit** (~100-200 l. React + uniform `timeRange` → §3.2). |
| **Halo pulsant** sur cible d'attaque | Pas d'exemple MapLibre dédié (404), rien dans deck.gl. | **On écrit** (§3.4). |
| **Arcs multicouches** (attaque / scan / beacon avec styles distincts) | Les exemples deck.gl montrent une seule ArcLayer ; worldmonitor (AGPL) le fait mais on n'en copie que l'idée. | **On écrit** la composition de plusieurs ArcLayer + TripsLayer, pattern trivial. |
| **Heatmap animée** (onde temporelle) | `geoblocks/maplibre-gl-shader-layer` donne le squelette custom-layer GLSL mais pas l'effet. | **On écrit** le shader à partir du squelette (MIT). |

## 5. Hugging Face — assets 3D & modèles ML

Licences et statut vérifiés via `https://huggingface.co/api/datasets|models/<id>` le 2026-11-10.

### 5.1 Datasets 3D géospatiaux

| Dataset | URL (API 200 sauf mention) | Licence | Format / contenu | Ce qu'on télécharge | Verdict |
|---|---|---|---|---|---|
| zhu-xlab/GBA.LoD1 — GlobalBuildingAtlas | huggingface.co/api/datasets/zhu-xlab/GBA.LoD1 (200) ; arbre `main/LoD1/europe` vérifié 200 par le parent | **CC-BY-NC-4.0** | LoD1 3D bâtiments, couverture mondiale, ~3,1 Md bâtiments (paper lié dans la card) | LoD1 par continent/région ; compatible avec notre usage non commercial, mais **NC = interdit si le produit devient commercial/diffusé** | **RÉUTILISER** (interne) — source de bâtiments 3D alternative à Overture si besoin de volumes LoD1 prêts |
| zhu-xlab/GBA.Polygon / GBA.Height | arbre → **HTTP 401** (non listé anonymement aujourd'hui) | n/a | n/a | inaccessibles sans auth/acceptation | **BLOQUÉ** — à re-tester avec compte HF ; ne pas compter dessus |
| Overture Maps | **pas de dataset officiel sur HF** ; la recherche `?search=overture` ne retourne que des miroirs tiers (`do-me/overture-places`, `DataDock/overturemaps`, `wherobots/overturemaps-us-west-2`, licences à relire avant usage) | — | — | Overture officiel vit sur AWS/Azure (buildings.reearth.land le convertit déjà) | **ÉVITER HF** — consommer Overture via reearth-buildings (§2) |
| Microsoft Global ML Building Footprints | pas sur HF ; repo officiel github.com/microsoft/GlobalMLBuildingFootprints (1 983★, dernier commit 2026-08-14, licence NOASSERTION — à lire avant toute copie) | — | footprints + hauteurs, GeoJSON par continent | téléchargement direct depuis le repo (liens blob stockage) | **RÉUTILISER** si besoin de footprints mondiaux bruts |
| Modèles ville CityJSON/3D Tiles sur HF | rien de notable trouvé dans les recherches (`search=overture`, `building footprints` → miroirs nationaux uniquement, ex. `yuiseki/microsoft-building-footprints-kanto-2026-08-13`) | — | — | — | **RIEN DE RÉUTILISABLE** — on reste sur Overture→3D Tiles (reearth) + GBA.LoD1 |

### 5.2 Objets 3D (marqueurs/icônes, pas du bâti)

| Dataset | URL | Licence | Contenu | Verdict |
|---|---|---|---|---|
| allenai/objaverse | huggingface.co/api/datasets/allenai/objaverse (200, gated:false, lastModified 2026-10-08) | **ODC-BY** | ~800 k objets GLB, métadonnées Parquet | **RÉUTILISER** — GLB pour marqueurs 3D deck.gl `ScenegraphLayer`. Effort **S** : choisir une poignée de GLB, pas le dataset entier |
| allenai/objaverse-xl | …/allenai/objaverse-xl (200, ODC-BY) | ODC-BY | ~10 M objets, parquet | **ÉVITER** — surdimensionné pour des icônes |

### 5.3 Modèles ML utiles à la carto

| Modèle | URL | Licence (lue) | Usage | Verdict / effort |
|---|---|---|---|---|
| geobase/building-footprint-segmentation | huggingface.co/api/models/geobase/building-footprint-segmentation (200, ONNX, 330 dl, lastMod 2025-08-19) | card sans SPDX explicite → **à relire avant usage** | segmentation de bâtiments sur imagerie | **ADAPTER** — ONNX = inférence locale facile ; effort **M** (pipeline tuiles satellite → masques → GeoJSON) |
| keremberke/yolov8m-building-segmentation (+ n/s) | 200 | à relire (YOLOv8 = licence AGPL côté Ultralytics → **pattern/weights séparés, attention**) | détection bâtiments | **ÉVITER** si on ne peut pas garantir le non-diffusion ; préférer geobase |
| geobase/changestar-building-segmentation-vitb | trouvé dans la recherche (200) | à relire | détection de changement (bâti nouveau/détruit) | **ADAPTER** — pertinent pour l'observatoire (delta temporel) ; effort **M-L** |
| geolocal/StreetCLIP | huggingface.co/api/models/geolocal/StreetCLIP (200, **CC-BY-NC-4.0**, 6 854 dl) | CC-BY-NC-4.0 | géolocalisation d'images (zero-shot) | **ADAPTER** (interne) — géolocaliser des images d'OSINT ; ONNX dispo (`onnx-community/StreetCLIP-ONNX`, 200) ; effort **M** |
| facebookresearch/* | rien trouvé dans nos recherches ciblées segmentations satellite | — | — | **RIEN DE RETENU** ici |

### 5.4 Téléchargement — commandes exactes

```sh
# CLI (datasets non gated, ex. GBA.LoD1) :
pip install -U "huggingface_hub[cli]"
hf download zhu-xlab/GBA.LoD1 --repo-type dataset \
  --include "LoD1/europe/*" --local-dir data/gba-lod1
# (ancien nom : huggingface-cli download — même syntaxe)

# Python :
from huggingface_hub import hf_hub_download
p = hf_hub_download(repo_id="zhu-xlab/GBA.LoD1", repo_type="dataset",
                    filename="LoD1/europe/<fichier>.gz")  # vérifier l'arbre exact
```

- **Quotas** : pas de quota dur anonyme sur les fichiers publics ; les téléchargements massifs passent mieux avec un token HF gratuit (auth → 401 disparaît pour les repos « listés mais protégés » comme GBA.Polygon).
- **Gated** : `gated:false` vérifié pour GBA.LoD1, objaverse, StreetCLIP → pas d'acceptation de conditions requise pour ces trois-là. Les 401 sur GBA.Polygon/Height suggèrent un état non public ou protégé : re-tester authentifié avant de planifier quoi que ce soit dessus.

## 6. Synthèse décisionnelle

| Brique | Source | Copie ? | Effort |
|---|---|---|---|
| Arcs animés | deck.gl examples (MIT) | code | S |
| Scrubber temporel sur arcs | animated-arc-layer.ts (MIT) | code | S-M |
| Scrubber UI React | — | — | on écrit |
| 3D Tiles ↔ MapLibre | maplibre-gl-three / opengeos (MIT) | code ou paquet | S-M |
| Bâtiments 3D | reearth-buildings (MIT) + GBA.LoD1 (CC-BY-NC) | consommation | S |
| Bloom | pmndrs/postprocessing (Zlib) | paquet | S |
| Halo pulsant | — | — | on écrit (S) |
| Heatmap animée | geoblocks (MIT) squelette | code + shader maison | M |
| Threat map globale (référence) | worldmonitor (AGPL) | **pattern uniquement** | — |
