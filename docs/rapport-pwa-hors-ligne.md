# Mode hors ligne PWA — fonctionnement complet vérifié

**Chiffre obtenu : 22 / 22 comportements hors ligne vérifiés**, et **11 / 11 vues du produit
utilisables après coupure réseau**. Mesure rejouable avec :

```bash
pnpm measure:offline-pwa
# dans ce worktree aux liens `node_modules` partagés :
apps/api/node_modules/.bin/tsx scripts/measure-offline-pwa.mts
```

Résultat versionné : `bench/results/offline-pwa-2026-11-22.json`. Sortie de la mesure :

```
Real state (Nouvelle-Aquitaine (12 departments), 2026-11-21): 1673151 organisations, 312 sources, 26719 events
OFFLINE_PWA_BEHAVIOURS 22/22
```

## État de départ et périmètre

La mesure part de l'état réel documenté de la base de travail au 21 novembre 2026,
et non d'un jeu de données inventé : **1 673 151 organisations**, **312 sources**,
**26 719 événements** (soit ~28 000 avec les 4 710 événements archivés), sur les
12 départements de Nouvelle-Aquitaine. Références : `docs/couverture-mesuree.md` et
`docs/agents-cpu.md` ; instantané versionné dans `bench/fixtures/offline-baseline-na.json`.
Les sources grises restent autorisées : le cache ne filtre pas les sources par couleur.
Aucune donnée personnelle de victime n'est collectée, mise en cache ou publiée.

Le service `GET /api/orgs` est paginé à 500 lignes (cf. `docs/defauts-ui.md`). Le mode
hors ligne conserve donc **les réponses effectivement consultées**, pas les 1,67 M
d'organisations d'un coup : c'est la seule promesse vérifiable, et l'interface affiche
l'âge de chaque réponse au lieu de la présenter comme fraîche.

## Ce qui a été livré

1. **Cache de lecture allowlisté** (`apps/web/src/offline/pwa.ts`) : seules les requêtes
   `GET` des routes de lecture sont stockées. Les routes d'identité (`/auth`,
   `/rectifications`, `/dossier`) sont refusées ; les champs nominatifs
   (`victim`, `email`, `acteur`, `by`, `contactNom`, …) sont remplacés par
   `[redacted]` avant écriture, y compris dans les tableaux imbriqués.
2. **Rejeu daté** : en cas d'échec réseau, `apps/web/src/api.ts` rend la dernière
   réponse mémorisée de la même requête (clé normalisée : l'ordre des filtres ne crée
   pas de doublon). Sans réponse mémorisée, l'erreur remonte : pas de donnée fictive.
3. **Bornes explicites** : 600 Ko par réponse, 2,5 Mo au total, 120 entrées, 7 jours
   d'ancienneté maximale, éviction du plus ancien. Un stockage plein ou corrompu ne
   casse jamais le chemin en ligne.
4. **Shell PWA** : le service worker (`apps/web/public/radar-sw.js`, cache v2) précache
   `/`, `index.html`, le manifeste et l'icône ; les modules Vite et les tuiles restent
   en cache avec rafraîchissement en arrière-plan. Manifeste et icône ajoutés, sans
   service payant ni dépendance externe supplémentaire.
5. **Derniers appels directs migrés** : `LieesCard`, `ReviewView` (file de relecture)
   et `AlertsView` (détail d'alerte) passent désormais par le client API, donc par le
   même cache. C'était le trou réel : ces écrans semblaient « en ligne only » alors
   que le reste de l'application était caché.
6. **Interface anglaise pour la nouveauté** : bandeau `Offline · cached data from
   45 min ago`, `Offline · no cached data for this view`. Le code ajouté et les tests
   sont en anglais ; le présent rapport est en français. Les opérations d'écriture
   (acquittement, décision de revue, rectification) restent explicitement en ligne :
   aucun acquittement fantôme n'est simulé.

## Tests — un comportement par test

- `pnpm test:offline-pwa` : 22 contrôles unitaires, un par comportement (allowlist,
  refus des écritures et des routes d'identité, normalisation des filtres, rejeu,
  âge, quota, éviction, corruption, redaction, effacement à la déconnexion,
  notification du bandeau, libellés anglais). Résultat : **22/22**.
- `pnpm test:offline` (Playwright) : 3 scénarios, dont un nouveau qui visite les
  11 vues en ligne, coupe le réseau (`context.setOffline(true)`), recharge l'application
  et revisite les 11 vues. Aucune réponse API n'est simulée après la coupure :
  les données viennent du cache local. Résultat : **3/3**, **11/11 vues**.

```bash
apps/api/node_modules/.bin/tsx apps/web/test/offline-pwa-verif.ts
cd apps/web && node node_modules/@playwright/test/cli.js test test/offline.spec.ts
```

## Contraintes

| Contrainte | Vérification |
| --- | --- |
| Nouvelle-Aquitaine uniquement | Périmètre du jeu de référence (12 départements), aucun périmètre élargi |
| Sources grises autorisées | Aucun filtre de couleur de source dans le cache |
| Aucune donnée personnelle de victime | Routes nominatives refusées + champs redactés + test dédié |
| Aucun service payant | Cache navigateur, manifeste local, icône SVG versionnée |
| Code et interface en anglais | Modules, tests, manifeste et bandeau hors ligne en anglais |
| Rapport en français | Ce document |
| `server.ts` ≤ 10 lignes de diff | **0 ligne modifiée** : tout est côté web |
| Aucune commande > 60 s | Mesure ~1 s, contrôles unitaires ~1 s, Playwright ~20 s |

## Limites assumées

Le rejeu s'arrête à 7 jours : au-delà, l'interface affiche « no cached data » plutôt
qu'un chiffre trop ancien. Les écritures ne sont pas mises en file d'attente : sans
accord de conflits, un accusé hors ligne serait un mensonge. Le cache contient les
dernières réponses des écrans ouverts, ce qui est mesurable et suffisant pour une
tournée de terrain, mais ne remplace pas une réplication locale des 1,67 M
d'organisations.

OBJECTIF : atteint — 22 / 22 comportements hors ligne vérifiés (11 / 11 vues hors réseau)
