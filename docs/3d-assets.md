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

## Recommandation pour le Radar

- **Court terme** : conserver OpenFreeMap (bâtiments) + Terrarium (terrain) — gratuit, sans clé, immédiat.
- **Moyen terme** : Copernicus DEM EEA-10 pour un relief plus précis, et Lidar HD IGN pour les agglomérations prioritaires (Bordeaux, Limoges, Poitiers) via conversion Roofer → 3D Tiles.
- **À valider** : la licence ODbL impose un partage à l'identique si les données OSM sont redistribuées ; le stockage interne sans redistribution est acceptable.

*Dernière vérification : 2026-11-10.*
