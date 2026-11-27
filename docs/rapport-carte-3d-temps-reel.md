# Rapport — carte 3D temps réel des attaques en Nouvelle-Aquitaine

**Date du rapport :** 27 novembre 2026.

**Objectif chiffré :** afficher les attaques en cours sur une carte 3D de la région à **60 images par seconde**.

**Statut de la preuve :** le **60,71 fps** publié le 22 novembre est **retiré**. Il venait d'une base live glissante sur 30 jours et n'était pas reproductible à l'identique. Aucun nouveau chiffre n'est publié ici : la mesure est désormais rejouable, mais le rejeu complet n'a pas été lancé dans cette correction bornée.

## Corpus figé et provenance

La charge de travail est maintenant `bench/fixtures/live-map-fps-corpus.json` (schéma `live-map-fps-corpus/v1`). C'est un corpus **synthétique déterministe** de 372 attaques, dimensionné sur la taille historique ; ce n'est **pas** un instantané de la base live et il ne prétend pas représenter les attaques réelles du jour.

Paramètres explicites du fixture : graine `20261122`, générateur `lcg-1664525-1013904223-v1` (`state = (Math.imul(1664525, state) + 1013904223) >>> 0`), cadre régional 43,0–46,9 / −1,9–2,0, six familles, trois types d'assertion, sévérité 1–5, 11 départements, 12 sources grises, `orgId` tous les 7 enregistrements. `frozenAt` (`2026-11-22T04:40:26.962Z`) est seulement l'étiquette de date de l'ancien relevé.

Empreintes relevées par le contrôle légère décrit ci-dessous :

| Objet | SHA-256 |
|---|---|
| Fixture | `cb714a8b0e700a5f7910297406bc6b7427411d688eaae80139861f8bf99456ba` |
| 372 attaques générées | `05ddf23e48eda8812ae0996eff2f30d54c0cf25e576f8fa2dfc04e0e9c445810` |

## Commande de rejeu

```sh
pnpm measure:3d
```

Le script ne fait **aucune requête base** : il lit le fixture, dérive les 372 attaques avec la graine ci-dessus, transpile `apps/web/src/map/live3d.ts`, ouvre Chromium headless en WebGL2 (SwiftShader, 1280 × 720) et enchaîne deux passes de 2 000 ms. La cadence publiée est la médiane des deux passes ; le seuil reste `fps >= 60`.

La sortie `bench/results/live-map-fps.json` est régénérée à chaque rejeu et contient : `measuredAt` (horodatage ISO de la mesure), `corpus.fixture`, `corpus.fixtureSha256`, `corpus.attacksSha256`, `corpus.frozenAt`, `corpus.provenance`, `corpus.generator`, `corpus.seed`, `corpus.params`, `runtime` (Node/plateforme) et `browser.version`. Deux mesures du même fixture sont donc comparables par leurs empreintes et leur environnement, même si la cadence brute reste sensible à la charge machine.

Contrôle rapide, sans navigateur ni écriture de résultat :

```sh
pnpm measure:3d -- --dry-run
```

Il affiche les deux empreintes, le générateur et la graine. À ce stade, `bench/results/live-map-fps.json` contient encore l'ancien relevé live : ne pas le citer comme preuve avant d'avoir rejoué la commande complète.

## Ancien relevé (obsolète, non probant)

| Passe | Images | Durée | Cadence | p95 trame |
|---|---:|---:|---:|---:|
| 1 | 122 | 2 009,6 ms | 60,71 fps | 16,7 ms |
| 2 | 121 | 2 002,0 ms | 60,44 fps | 16,8 ms |
| **Médiane** | — | — | **60,71 fps** | 16,7 ms |

Ces valeurs correspondaient à 372 attaques réelles sur la fenêtre glissante de 30 jours, avec 1 673 151 organisations, 315 sources et 26 240 événements dans la base au 22 novembre. Elles sont conservées pour trace, pas comme résultat vérifié.

## Ce qui a été livré

- **API** : `GET /api/live-map` (instantané) et `GET /api/live-map/stream` (SSE, nouvelles attaques toutes les 2 s). Les deux routes sont publiques et enregistrées dans le registre commun ; `apps/api/src/server.ts` n'a **aucune modification** (0 ligne de diff).
- **Rendu** : couche MapLibre personnalisée en WebGL2 (`apps/web/src/map/live3d.ts`), boucle `requestAnimationFrame` unique, une couche 3D, badge anglais « LIVE · N attacks · N fps ».
- **Flux** : une seule connexion EventSource, fusion sans doublon, tri du plus récent au plus ancien.
- **Mesure** : corpus figé et versionné, empreintes et provenance dans la sortie, rejeu documenté ci-dessus.
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
| Mesure reproductible | Fixture figé, graine et paramètres explicites, empreintes du fixture et du corpus généré dans la sortie. |

## Limites connues

La cadence est mesurée sur le rendu WebGL2 des attaques, pas sur le chargement des tuiles du fond de carte : ce dernier dépend du réseau et n'entre pas dans la boucle d'animation. Le corpus figé garantit la même charge de travail, pas la même cadence absolue sur deux machines ou deux états de charge différents : c'est précisément pour cela que la sortie enregistre l'environnement. Il ne remplace pas une mesure sur données live pour juger de la couverture opérationnelle. Le chiffre publié est celui du navigateur de mesure ; l'affichage produit affiche sa propre cadence mesurée dans le badge.
