# Cartographie : les dépôts qui fournissent une vraie carte (2026-11-10)

Question : au lieu de dessiner nos propres contours, quels dépôts donnent une **carte prête à
l'emploi** (tuiles + style), utilisable dans MapLibre 6 ?

Toutes les métadonnées ci-dessous sont mesurées par `gh api` le 2026-11-10.

## 1. Tuiles vectorielles + styles (le cœur)

| Projet | ★ | Licence | Dernier push | Ce qu'il donne |
| --- | --- | --- | --- | --- |
| **OpenFreeMap** (`hyperknot/openfreemap`) | 12 057 (org `maplibre` compris) — **1 275★ pour openfreemap** | MIT (code), ODbL (données OSM) | actif 2026-11 | **Tuiles vectorielles gratuites, sans clé, sans limite**, styles prêts, serveurs publics. **On l'utilise déjà** pour les bâtiments |
| **Protomaps `basemaps`** | 771 | BSD-3 (NOASSERTION à vérifier fichier) | 2026-09 | Styles MapLibre complets (light/dark) + **PMTiles auto-hébergeables**, une seule requête HTTP Range |
| **Versatiles styles** | 117 | **MIT** | 2026-11 | Jeux de styles (dark/light/colourful) pour tuiles Versatiles, propres et maintenus |
| **OpenMapTiles `dark-matter-gl-style`** | 110 | à lire (NOASSERTION) | 2024-05 | **Le** style sombre historique (Carto Dark Matter) : fond noir, routes grises, labels fins — exactement l'esthétique « salle de contrôle ». Attention : plus maintenu depuis 2024 |
| **OpenMapTiles `positron-gl-style`** | 146 | idem | 2026-08 | Style clair minimaliste (Carto Positron), bon pour un thème « clair » |
| **CARTO `basemap-styles`** | 390 | à lire | 2026-10 | Sources des styles Dark Matter / Positron / Voyager (JSON MapLibre) |
| **MapLibre `demotiles`** | 136 | **BSD-3** | 2026-08 | Tuiles de démo + style minimal, utile pour les tests hors ligne |

## 2. Données administratives françaises (contours)

| Source | Licence | Usage |
| --- | --- | --- |
| **`etalab/decoupage-administratif`** (66★, MIT, 2026-03) | MIT | Régions/départements/EPCI/communes en JSON, **la** source officielle Etalab ; contour simplifié pour la carte |
| **`gregoiredavid/france-geojson`** (841★, **sans licence**, 2022) | ⚠️ aucune | Contours prêts à l'emploi, **c'est ce que j'ai utilisé pour la maquette** — pratique mais sans licence : à remplacer par Etalab pour un usage propre |
| **IGN Géoplateforme** (data.geopf.fr) | Licence Ouverte 2.0 | Tuiles vectorielles **officielles France** (plan IGN, ortho, BD TOPO), gratuites, sans clé. Le bon choix pour une carte régionale française |

## 3. Ce que ça change pour notre carte

Aujourd'hui la maquette dessine des contours GeoJSON sur fond noir vierge : ça marche mais c'est
« une carte dessinée à la main ». Trois options, du plus simple au plus intégré :

1. **Garder notre fond noir + contours** (maquette actuelle) — zéro dépendance, mais pas de routes,
   pas de villes, pas de relief : on voit une silhouette, pas une carte.
2. **Style sombre réel** : brancher un style type `dark-matter` (ou Versatiles dark) sur les tuiles
   **OpenFreeMap qu'on a déjà** → routes, villes, littoral, tout est là, en sombre, sans clé ni coût.
   **C'est le meilleur rapport effort/rendu.**
3. **IGN Géoplateforme** : tuiles officielles France, plus précises (BD TOPO), toujours gratuites.
   Meilleur pour un rendu institutionnel ; un peu plus de config (source `plan-ign`).

## 4. Recommandation

**Option 2** : on garde OpenFreeMap (déjà branché) et on remplace notre style maison par un style
sombre complet inspiré de Dark Matter (routes en gris, eau noire, labels monospace discrets), avec
nos calques par-dessus (orgs, événements, arcs). Effort : **~0,5 jour**, aucun service payant, aucune
clé. Repli qualité : IGN si tu veux le rendu « officiel France ».

Note migration : remplacer `gregoiredavid/france-geojson` (sans licence) par
`etalab/decoupage-administratif` (MIT) avant tout usage au-delà de la maquette.
