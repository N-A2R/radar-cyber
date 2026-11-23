# Rapport — carte 3D temps réel des attaques en Nouvelle-Aquitaine

**Date de mesure :** 22 novembre 2026.  
**Objectif chiffré :** afficher les attaques en cours sur une carte 3D de la région à **60 images par seconde**.  
**Résultat :** **60,71 fps** (médiane de deux passes de 2 s) — **objectif atteint**.

## État réel de départ

Mesure en lecture seule sur la base live `radar` (requêtes `SELECT count(*) FROM org / source / event`) :

| Base réelle | Valeur |
|---|---:|
| Organisations | 1 673 151 |
| Sources déclarées | 315 |
| Événements | 26 240 |
| Attaques en cours retenues (30 jours, Nouvelle-Aquitaine) | 372 |

La fenêtre « en cours » est définie une seule fois, dans `apps/api/src/live/attacks.ts` : 30 jours, types `third_party_claim`, `confirmed_incident`, `ambient_signal` (les indicateurs techniques sont exclus), TLP `RED` exclu, coordonnées dans le cadre régional (latitude 43,0–46,9 ; longitude −1,9–2,0). La même définition alimente l'API, le flux SSE et la mesure.

## Chiffre mesuré et commande reproductible

```sh
pnpm measure:3d
```

La commande interroge la base réelle, transpile le module de rendu, ouvre Chromium headless en WebGL2 (SwiftShader, 1280 × 720) et enchaîne deux passes de 2 000 ms avec les 372 attaques réelles. Un seul `drawArrays` par image : la géométrie est téléversée une fois quand le flux change, l'animation est calculée dans le shader.

| Passe | Images | Durée | Cadence | p95 trame |
|---|---:|---:|---:|---:|
| 1 | 122 | 2 009,6 ms | 60,71 fps | 16,7 ms |
| 2 | 121 | 2 002,0 ms | 60,44 fps | 16,8 ms |
| **Médiane** | — | — | **60,71 fps** | 16,7 ms |

Résultat brut : `bench/results/live-map-fps.json`. Le seuil de réussite du script est `fps >= 60` (`targetReached: true`).

## Ce qui a été livré

- **API** : `GET /api/live-map` (instantané) et `GET /api/live-map/stream` (SSE, nouvelles attaques toutes les 2 s). Les deux routes sont publiques et enregistrées dans le registre commun ; `apps/api/src/server.ts` n'a **aucune modification** (0 ligne de diff).
- **Rendu** : couche MapLibre personnalisée en WebGL2 (`apps/web/src/map/live3d.ts`), boucle `requestAnimationFrame` unique, une couche 3D, badge anglais « LIVE · N attacks · N fps ».
- **Flux** : une seule connexion EventSource, fusion sans doublon, tri du plus récent au plus ancien.
- **Tests** : 4 tests API (portée régionale, fenêtre, sources grises, absence de donnée personnelle, forme SSE) et 6 tests front (projection blanche, filtre NA, fusion, SSE, packing GPU, un draw call par image). `tsc --noEmit` passe côté API et côté web.

## Contraintes

| Contrainte | Vérification |
|---|---|
| Nouvelle-Aquitaine uniquement | Filtre SQL et filtre front sur le même cadre géographique ; aucune attaque hors région dans le snapshot testé. |
| Sources grises autorisées | Aucune jointure ni condition de confiance/licence sur `source` ; le test insère une source sans licence et vérifie que son attaque est affichée. |
| Aucune donnée personnelle de victime | Projection en liste blanche (id, famille, type, sévérité, horodatage, coordonnées, org, source, département) ; ni titre, résumé, URL ni `evidence`. TLP `RED` exclu. |
| Aucun service payant | WebGL2 local, tuiles libres (OSM/IGN/OpenFreeMap), Chromium et Playwright locaux. |
| Code et interface en anglais | Nouveaux modules, commentaires techniques, noms de routes et badge en anglais. |
| Rapport en français | Ce document. |
| Diff de `server.ts` ≤ 10 lignes | 0 ligne : enregistrement via `routes/index.ts`. |
| Aucune commande > 60 s | Mesure complète en 5,8 s ; tests ciblés respectivement 0,6 s et 0,5 s. |

## Limites connues

La cadence est mesurée sur le rendu WebGL2 des attaques, pas sur le chargement des tuiles du fond de carte : ce dernier dépend du réseau et n'entre pas dans la boucle d'animation. Le chiffre publié est celui du navigateur de mesure ; l'affichage produit affiche sa propre cadence mesurée dans le badge.
