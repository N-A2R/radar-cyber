# Rapport — chantier G5 : SDK TypeScript et Python

Date : 2026-11-22. Branche : `ext/chantier-g5`, créée depuis `origin/main`.

## Prévolution

Aucune pull request existante sur ce sujet : recherche `gh pr list --state all`
avec `SDK`, `TypeScript SDK`, `Python SDK`, `chantier-g5`, et recherche dans
l'historique (`git log --oneline --all | grep -i sdk`) — aucun résultat. Le
chantier est donc implémenté depuis zéro sur la branche dédiée, sans reprise
d'objectif chiffré antérieur.

## État réel de départ

Mesure lue sur l'API de travail (`/api/stats`, `/api/health`) au moment de
l'exécution, avant toute modification :

| Grandeur | Valeur mesurée |
|---|---:|
| Organisations | 1 673 151 |
| Sources | 312 |
| Événements | 26 394 (ordre de grandeur des ~28 000 de la consigne) |
| Départements de Nouvelle-Aquitaine | 12 |

Ces chiffres ne sont pas codés en dur : les deux exemples les lisent sur l'API
live et échouent si les compteurs divergent entre `/health` et `/stats`.

## Livrable

- SDK TypeScript : `sdks/typescript/src/index.ts` — client typé, sans
  dépendance, avec erreurs `RadarApiError` et injection de `fetch`.
- SDK Python : `sdks/python/radar_sdk/client.py` — client reposant uniquement
  sur la bibliothèque standard (`urllib`), erreurs `RadarApiError` typées.
- Interface anglaise commune : `getHealth`, `getStats`, `getNaOverview`,
  `getNaEvents(department)`, `getSources`.
- Un exemple exécutable par SDK : `typescript/examples/overview.ts` et
  `python/examples/overview.py`.
- Douze tests, un par comportement : six par SDK (construction d'URL,
  en-tête de clé, erreur HTTP typée, projection sans donnée de victime,
  conservation des sources grises, filtre territorial). Serveur local de
  test uniquement — aucun appel réseau externe.
- Documentation d'interface en anglais : `sdks/README.md`.

## Commande reproductible et chiffre mesuré

```bash
# API seule, sans collecteurs, sur la base de travail réelle
DATABASE_URL='postgres://radar:radar@localhost:5433/radar' \
  PORT=8099 RADAR_COLLECT=0 \
  apps/api/node_modules/.bin/tsx apps/api/src/server.ts

# Mesure
RADAR_API_BASE_URL=http://127.0.0.1:8099/api \
  pnpm measure:sdks --json=bench/results/sdk-examples.json
```

Résultat observé à l'exécution de cette commande :

> **2/2 exemples exécutables** contre l'API live, **12/12 tests réussis**,
> avec les compteurs réels **1 673 151 organisations / 312 sources /
> 26 394 événements**. Les deux SDK renvoient exactement les mêmes chiffres.

La mesure (`scripts/measure-sdks.mts`) vérifie la sortie des deux exemples
(`sdk`, `scope=NA`, `status=OK`, compteurs positifs et identiques), exécute les
deux suites de tests et échoue si l'un de ces contrôles manque. Le détail est
écrit dans `bench/results/sdk-examples.json`. Chaque processus lancé par la
mesure est borné à 45 secondes.

## Contraintes vérifiées

| Contrainte | État |
|---|---|
| Nouvelle-Aquitaine uniquement | `getNaEvents` valide les 12 codes INSEE avant tout appel ; exemples en `scope=NA` |
| Sources grises autorisées | `getSources` ne filtre aucune origine ; test dédié avec une source grise |
| Aucune donnée personnelle de victime | projection sans titre, résumé ni nom ; test dédié |
| Aucun service payant | `fetch` / `urllib` uniquement, tests sur serveur local |
| Code et interface en anglais | SDK, exemples, tests et `sdks/README.md` en anglais |
| Rapport en français | ce document |
| Diff de `server.ts` ≤ 10 lignes | 0 ligne modifiée : aucun changement nécessaire, la surface publique `/api` suffit |
| Aucune commande > 60 s | mesure bornée à 45 s par sous-commande ; exécution observée en environ 6 s |

## Limite constatée

Dans l'état de travail observé, les routes `/api/v1` sont refusées par la
matrice de contrôle d'accès (aucune règle déclarée), tandis que les mêmes
routes sous `/api` sont publiques et fonctionnelles. Les SDK ciblent donc
`/api`, configurable par `RADAR_API_BASE_URL`. Ce chantier ne modifie ni la
matrice d'accès ni `server.ts` : ce point sort de son périmètre.
