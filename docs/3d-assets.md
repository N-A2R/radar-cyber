# Assets 3D et données ouvertes — Radar Cyber NA

Inventaire des sources 3D/datasets ouverts utilisables, avec licences et intégration.

## Actuellement intégré

| Asset | Source | Licence | Usage |
|---|---|---|---|
| **OpenFreeMap — planet** | https://tiles.openfreemap.org/planet | ODbL / OSM contributors | Bâtiments 3D extrudés (`render_height`), source-layer `building` |
| **Terrarium DEM** | https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png | Amazon (gratuit, sans clé) | Terrain 3D (exagération 1,8) |
| **OpenStreetMap raster** | https://tile.openstreetmap.org | ODbL | Fond de carte sombre |

## Bâtiments 3D (alternatives et compléments)

| Source | Format | Licence | Note |
|---|---|---|---|
| **OpenFreeMap** (actuel) | PMTiles/MVT | ODbL | hauteurs OSM, sans clé |
| **Overture Maps — buildings** | GeoParquet (S3/Azure) | ODbL | `height`, `num_floors`, `min_height` ; téléchargeable via DuckDB (`s3://overturemaps-us-west-2/release/…`) |
| **GlobalBuildingAtlas** (zhu-xlab) | GeoJSON/GeoParquet | ODbL / CC BY-NC 4.0 | polygones + LoD1 + height maps |
| **OSM Buildings** (osmbuildings.org) | GeoJSON | ODbL | footprints + hauteurs partielles |
| **CityJSON datasets** (cityjson.org) | CityJSON | variables | modèles 3D urbains prêts |
| **Cesium OSM Buildings** | 3D Tiles (ion) | OSM | via Cesium ion (gratuit, quota) |
| **IGN BDTOPO 3D** | BDTopo ( Géoportail) | Licence Ouverte 2.0 | bâtiments vectoriels 3D, précision métrique |
| **Microsoft Building Footprints** | GeoJSON | MIT (données) | footprints, sans hauteurs |

## Relief et altitude

| Source | Résolution | Licence | Accès |
|---|---|---|---|
| **Copernicus DEM EEA-10** | 10 m | Copernicus (libre) | Copernicus Data Space Ecosystem |
| **Copernicus DEM GLO-30/90** | 30/90 m | Copernicus | idem |
| **IGN RGE ALTI** | 1 m / 5 m | Licence Ouverte 2.0 | WMTS/WFS (Géoservices) |
| **NASADEM** | 30 m | NASA (libre) | Earthdata |
| **Terrarium** (actuel) | ~variable | Amazon | gratuit, sans clé |
| **IGN Lidar HD** | 10 pts/m² | Licence Ouverte 2.0 | tuiles LAZ 1 km² (0,5–2 Go), DTM/DSM/MNH |
| **AWS Terrain Tiles** | Terrarium | Amazon | S3 public |

## Images et textures

| Source | Type | Licence |
|---|---|---|
| **Copernicus Sentinel-2** | satellite 10 m | Copernicus (libre) |
| **IGN orthophotos** | aérien | Licence Ouverte 2.0 |
| **TerraColor / NextZen** | raster tiles | libre |

## Librairies 3D

| Lib | Licence | Usage |
|---|---|---|
| **MapLibre GL JS 6** | BSD-3 | carte, terrain, extrusion |
| **deck.gl 9** | MIT | couches analytiques (attention : `MapboxOverlay` incompatible MapLibre 6 — utiliser les couches natives) |
| **three.js / React Three Fiber** | MIT | scènes 3D libres |
| **CesiumJS** | Apache-2.0 | globe 3D (nécessite `setWorkerUrl` + quota ion pour le terrain) |
| **3D Tiles Community** | MIT | validations de tilesets |
| **pygltflib / cjio / pg2b3dm** | MIT/Apache | conversion CityJSON/glTF → 3D Tiles |
| **PDAL / Entwine / Cesium ion CLI** | BSD/MIT | nuages de points → 3D Tiles |

## Outillage de conversion (si on passe au 3D Tiles complet)

1. **Roofer** — toits 3D depuis LIDAR HD IGN + empreintes Overture (CityJSON).
2. **pg2b3dm** — PostGIS → 3D Tiles (b3dm).
3. **Cesium ion CLI** — tuilage de nuages/glTF.
4. **cesium-native** — lecture de 3D Tiles hors navigateur.

## Candidats v2 (2026-11-10)

Recherche du 2026-11-10. Toutes les URL ci-dessous ont été testées par requête HTTP (200, ou 401/403 documenté quand l'accès exige un compte/clé). Aucun asset « à vérifier plus tard ».

### Bâtiments 3D — tuiles 3D Tiles prêtes à l'emploi (zéro conversion)

| Asset | URL directe | Licence vérifiée | Poids | Intégration MapLibre | Effort |
|---|---|---|---|---|---|
| **Re:Earth Buildings** (global, 3D Tiles 1.1 + glTF) | `https://buildings.reearth.land/tileset.json` ; tuile test Bordeaux `https://buildings.reearth.land/v5-add/12/2041/1475.glb` (200, `model/gltf-binary`) | **ODbL 1.0** — © OpenStreetMap contributors + Overture Maps Foundation (certificat `asset.copyright`) ; code MIT | ~28 Ko/tuile z12, généré à la demande | `maplibre-gl-three` + `3d-tiles-renderer` (ou `opengeos/maplibre-gl-3d-tiles`) | **Faible** |
| **Cesium OSM Buildings** (global, >350 M) | `https://assets.ion.cesium.com/96188/tileset.json` — **401 sans token** : compte Cesium ion + `accessToken` requis | **ODbL / OSM + Cesium ion ToS** — attribution « © OpenStreetMap contributors » | streaming, pas de fichier | `3d-tiles-renderer` + `IonResource` (token) | **Moyen** (compte + quota) |
| **Google Photorealistic 3D Tiles** | `https://developers.google.com/maps/documentation/tile/3d-tiles-overview` (200) | **Google Maps Platform ToS** — streaming uniquement, **interdiction de télécharger/extraire/cacher** ; clé API + facturation | streaming | — | **Non retenu** (inutilisable hors streaming) |

### Bâtiments 3D — données sources à convertir

| Asset | URL directe | Licence vérifiée | Poids | Intégration | Effort |
|---|---|---|---|---|---|
| **Overture Maps buildings — PMTiles** | `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-10-21.0/buildings.pmtiles` (200, Range 206) | **ODbL 1.0** | **180,7 Go** (planète) — extraire la NA via `pmtiles extract --bbox=…` | PMTiles + `fill-extrusion` (champs `height`/`num_floors`) ou conversion 3D Tiles | **Moyen** |
| **Overture Maps — GeoParquet** | `https://overturemapswestus2.blob.core.windows.net/release/2026-10-21.0/theme=buildings/type=building/` (200) ; STAC `https://stac.overturemaps.org/2026-10-21.0/buildings/catalog.json` (200) | **ODbL 1.0** | partitions par theme/type | DuckDB / `overturemaps-py` → GeoParquet/GeoJSON | **Moyen** |
| **GlobalBuildingAtlas — ODbLPolygon** | `https://huggingface.co/datasets/zhu-xlab/GBA.ODbLPolygon/resolve/main/europe/e000_n50_e005_n45.geojson` (200, redir. CDN, 437 Mo) | **ODbL 1.0** | tuiles 5°×5° (4,3–9,8 Go) | conversion GeoJSON → glTF/3D Tiles | **Moyen** |
| **GlobalBuildingAtlas — LoD1** | `https://huggingface.co/datasets/zhu-xlab/GBA.LoD1/resolve/main/LoD1/europe/e000_n50_e005_n45.json` (200) | **CC BY-NC 4.0** — ⚠️ non commercial | tuiles 5°×5° (~1,4 Go) | conversion → 3D Tiles | **Moyen** (licence restrictive) |
| **Microsoft Global ML Building Footprints** | catalogue `https://bfppub.blob.core.windows.net/%24web/2026-08-13/dataset-links.csv` (200) ; tuile France `https://bfppub.z5.web.core.windows.net/2026-08-13/global-buildings.geojsonl/RegionName=France/quadkey=031313321/part-00145-110f5303-ff85-4c71-a2bf-c6070024fec8.c000.csv.gz` (200, 6,9 Mo) | **CDLA Permissive 2.0** | ~1 Milliard d'empreintes ; France ~200 Mo | conversion GeoJSONL → glTF | **Moyen** |
| **OSM Buildings** | `https://osmbuildings.org/copyright/` (200) ; tuiles `https://{s}.data.osmbuildings.org/0.2/{k}/tile/{z}/{x}/{y}.json` (**403** — UA/clé requis, testé sans navigateur) | **ODbL 1.0** | pas de bulk gratuit (ONEGEO payant) | dériver d'OSM (Overpass) | **Élevé** |
| **IGN BD Topo 3D — bâti** | WFS `https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities` (200) ; couche `BDTOPO_V3:batiment` | **Licence Ouverte 2.0** (compatible ODC-BY/CC-BY 2.0) | flux WFS à la demande | WFS → GeoJSON → extrusion | **Moyen** |
| **Bordeaux Métropole — Bati3D (LoD2 2012)** | `https://data.bordeaux-metropole.fr/opendata/graphic_downloader/?layer=343&format=76` (200, outil graphique — pas de fichier direct) | **Licence Ouverte** (attribution « SIG Bordeaux Métropole Agglo3D ») | tuiles 3DS 1,4 km × 1 km | conversion 3DS → glTF/3D Tiles | **Élevé** (donnée 2012) |

### Terrain et relief

| Asset | URL directe | Licence vérifiée | Résolution / poids | Intégration | Effort |
|---|---|---|---|---|---|
| **Copernicus DEM GLO-30** | `https://copernicus-dem-30m.s3.amazonaws.com/` ; tuile France `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N44_00_W001_00_DEM/Copernicus_DSM_COG_10_N44_00_W001_00_DEM.tif` (200, 47 Mo, COG) | **Copernicus** (libre, DOI 10.5270/ESA-c5d3d65) | 30 m, COG | Terrarium/terrain MapLibre | **Faible** |
| **Copernicus DEM EEA-10** | `https://dataspace.copernicus.eu/` (200) | Copernicus — **accès restreint** (catégories éligibles) | 10 m | idem | **Moyen** (demande d'accès) |
| **IGN RGE ALTI** | WMTS `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities` (200) | **Licence Ouverte 2.0** | 1 m / 5 m | terrain MapLibre | **Faible** |
| **Re:Earth Terrain** | `https://terrain.reearth.land/mapbox/ellipsoid/tilejson.json` (200) ; tuile `https://terrain.reearth.land/mapterhorn-egm08/mapbox/ellipsoid/{z}/{x}/{y}.webp` | **Mapterhorn / EGM2008 (NGA)** — libre | globale, max z14 | terrain MapLibre (compagnon de Re:Earth Buildings) | **Faible** |
| **Terrarium** (actuel) | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | Amazon (gratuit) | variable | déjà intégré | — |

### Lidar HD (agglomérations prioritaires)

| Asset | URL directe | Licence vérifiée | Poids | Intégration | Effort |
|---|---|---|---|---|---|
| **IGN LiDAR HD — tuiles COPC** | `https://data.geopf.fr/telechargement/download/LiDARHD-NUALID/NUALHD_1-0__LAZ_LAMB93_OO_2025-03-14/LHD_FXX_0877_6382_PTS_LAMB93_IGN69.copc.laz` (200, 229 Mo) ; catalogue WFS `https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typename=IGNF_LIDAR-HD_METADONNEE:metadata` (200) | **Licence Ouverte 2.0** | 1 km²/tuile, 0,5–2 Go | HTTP Range (COPC) → Roofer/PDAL → 3D Tiles | **Élevé** (conversion) |

### Ambiance « salle de contrôle » (HDRI, brouillard, éclairage)

| Asset | URL directe | Licence vérifiée | Poids | Intégration | Effort |
|---|---|---|---|---|---|
| **Poly Haven HDRIs** | `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr` (200, 5,4 Mo) ; nuit `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/qwantani_night_puresky_2k.hdr` (200, 5,5 Mo) | **CC0 1.0** | 5–75 Mo (1k–16k) | `THREE.HDRLoader` / `RoomEnvironment` / skybox | **Faible** |
| **ambientCG HDRIs** | `https://ambientcg.com/get?file=DaySkyHDRI032A_2K.zip` (200, 9,4 Mo, redir. `acg-download`) | **CC0 1.0** | 9 Mo (2K) | idem | **Faible** |
| **Brouillard / éclairage nocturne** | natif MapLibre (`map.setFog`) + three.js (`scene.fog`, `AmbientLight`/`DirectionalLight`) | — (natif) | — | code | **Faible** |

### Intégration MapLibre — bibliothèques et exemples vérifiés

| Ressource | URL directe | Licence | Usage |
|---|---|---|---|
| **maplibre-gl-three** 3.0.2 | `https://cdn.jsdelivr.net/npm/maplibre-gl-three@3.0.2/dist/maplibre-gl-three.min.js` (200) ; docs `https://maplibre-gl-three.readthedocs.io/latest/` (200) | MIT | glue MapLibre + three.js + 3d-tiles-renderer (`ThreeDManager`, `load3dTiles`) |
| **3d-tiles-renderer** 0.5.3 | `https://cdn.jsdelivr.net/npm/3d-tiles-renderer@0.5.3/build/index.three.js` (200) | MIT | rendu 3D Tiles 1.1 (GLB/b3dm/pnts) |
| **opengeos/maplibre-gl-3d-tiles** | `https://github.com/opengeos/maplibre-gl-3d-tiles` (200) | MIT | IControl + wrapper React, GLTF/Draco/KTX2 |
| **Exemple officiel MapLibre (3D Tiles + GLB)** | `https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/test/examples/add-3d-tiles-3d-objects-and-models-using-threejs.html` (200) | BSD-3 | custom layer + three.js + 3d-tiles-renderer |
| **Exemple custom layer GLB** | `https://docs.maptoolkit.com/maplibre/examples/add-a-3d-model-using-threejs/` (200) | — (exemple de documentation) | placement GLB à coordonnées réelles |
| **Exemple OpenFreeMap 3D (fill-extrusion)** | `https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/` (200) | BSD-3 | `render_height`/`render_min_height` |
| **3D Tiles Community (validation)** | `https://github.com/CesiumGS/3d-tiles` (200) | Apache-2.0 | spécification + ressources 3D Tiles |

### Perf — points clés

- **Re:Earth Buildings** : 3D Tiles 1.1, `refine: ADD`, LOD par classes de taille (z12 landmarks → z14 reste), GLB meshopt compressé, altitude au sol déjà cuite.
- **GLB/GLTF** : `InstancedMesh` par mesh (1 draw call par mesh), `frustumCulled = false` (frustum MapLibre imprécis), matrices d'instance en Mercator (mètres), rotation de buffers pour éviter les stalls GPU.
- **Tuilage 3D Tiles** : charger uniquement les tuiles visibles ; `geometricError` adapté ; `EXT_meshopt_compression` + `EXT_structural_metadata` (Re:Earth).
- **Terrain** : `maxzoom` 14 (Re:Earth Terrain), Terrarium z6–z12, exagération 1,8.

### Recommandation opérationnelle v2

1. **Immédiat** : ajouter **Re:Earth Buildings** (3D Tiles 1.1, ODbL, CORS ouvert, sans clé) via `maplibre-gl-three` + `3d-tiles-renderer` — remplace/complète le fill-extrusion OpenFreeMap par de vrais toits 3D.
2. **Terrain** : **Copernicus DEM GLO-30** (S3 public, COG, sans clé) pour un relief 30 m ; **IGN RGE ALTI** en 1 m pour les agglomérations.
3. **Lidar HD** : pour Bordeaux/Limoges/Poitiers/Pau/La Rochelle, télécharger les tuiles COPC 1 km² (`url_npl` du WFS) et convertir avec **Roofer** → 3D Tiles.
4. **Ambiance** : HDRI **Poly Haven** (CC0) ou **ambientCG** (CC0) pour l'éclairage/skybox ; `map.setFog` pour le brouillard.
5. **Exclus** : Google Photorealistic (streaming only, téléchargement interdit) ; GBA LoD1 (CC BY-NC — non commercial) ; Cesium OSM Buildings (compte ion + token).

## Recommandation pour le Radar

- **Court terme** : conserver OpenFreeMap (bâtiments) + Terrarium (terrain) — gratuit, sans clé, immédiat.
- **Moyen terme** : Copernicus DEM EEA-10 pour un relief plus précis, et Lidar HD IGN pour les agglomérations prioritaires (Bordeaux, Limoges, Poitiers) via conversion Roofer → 3D Tiles.
- **À valider** : la licence ODbL impose un partage à l'identique si les données OSM sont redistribuées ; le stockage interne sans redistribution est acceptable.

*Dernière vérification : 2026-11-10.*

---

## Vérification du 10 novembre 2026 — candidat retenu

Recherche refaite après la mise au propre du front. Une seule piste retenue,
les autres écartées pour une raison mesurée.

### Re:Earth Buildings — retenu

| Élément | Valeur observée |
|---|---|
| Racine | `https://buildings.reearth.land/tileset.json` → **200**, `application/json`, `access-control-allow-origin: *` |
| Tuile témoin (Bordeaux, z12) | `https://buildings.reearth.land/v5-add/12/2041/1475.glb` → **200**, `model/gltf-binary`, CORS ouvert |
| Licence | **ODbL 1.0** — © OpenStreetMap contributors + Overture Maps Foundation, attribution obligatoire |
| Format | 3D Tiles 1.1, GLB meshopt, LOD par `geometricError`, `refine: ADD` |
| Poids | ~29 Ko par tuile z12, chargée à la demande |
| Gain visuel | vrais volumes et toits, contre l'extrusion 2.5D actuelle des empreintes OpenFreeMap |

Une tuile a répondu **503** avec `retry-after: 2` au premier essai : le CDN est
transitoirement instable, il faut un repli sur l'extrusion existante.

### Écartés, avec la raison

| Asset | Raison |
|---|---|
| Cesium OSM Buildings | `https://assets.ion.cesium.com/96188/tileset.json` → **401** sans jeton ion |
| Google Photorealistic 3D Tiles | conditions d'usage interdisant le stockage, contraire au projet |
| GBA LoD1 | CC BY-NC 4.0, non commercial |

### Ce que l'intégration demande

MapLibre 6 ne rend pas les 3D Tiles nativement : il faut une couche `three.js`
(`maplibre-gl-three` + `3d-tiles-renderer`). Ces deux paquets avaient été
retirés du `package.json` le 10 novembre parce qu'aucun code ne les utilisait —
les réintroduire n'a de sens qu'au moment de brancher la couche, pas avant.
La charte ne change pas : teinte des bâtiments et palette d'arcs restent celles
de `styles.css`.
