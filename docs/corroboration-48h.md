# Verdict de publication à 48 h — mesure du 22 novembre 2026

## Objectif

La feuille de route à trois ans (`docs/roadmap-3ans.md`, « Délai de publication »)
exige qu'un incident ne soit nommé qu'après confirmation par une source
secondaire, **ou** 48 h après la première, avec un choix documenté. La tranche
précédente (PR #338) mesurait la corroboration, mais n'attribuait aucun verdict
de publication : les incidents isolés restaient sans décision traçable.

OBJECTIF : atteint — 56 / 56 incidents de Nouvelle-Aquitaine avec un verdict
de publication daté.

## Ce qui est livré

- `apps/api/src/analyse/incident-corroboration-48h.ts` : calcul pur du verdict
  (`second_source`, `after_delay`, `pending`) et du récapitulatif, à un instant
  explicite passé en paramètre — aucune heure implicite, mesure reproductible ;
- `apps/api/src/routes/incident-corroboration.ts` : `GET
  /api/incident-corroboration/verdicts`, route publique en lecture seule ;
- `scripts/measure-corroboration-48h.mts` (`pnpm mesure:corroboration-48h`) :
  mesure reproductible, sans écriture en base, sans appel réseau ;
- `bench/results/corroboration-48h-2026-11-22.json` : résultat publié ;
- `apps/api/test/incident-corroboration-48h.test.ts` et
  `apps/api/test/incident-corroboration-verdicts-route.test.ts` : un test par
  comportement.

Correctif de périmètre inclus dans la même tranche :
`loadCorroborationEvents()` ne transmettait jamais `org.dept` alors que
`isNA()` sait s'en servir. Le rattachement départemental est maintenant lu
dans la base (chaîne vide normalize en `null`) ; le périmètre passe de 36 à
**56 incidents NA** (voir `docs/corroboration-deux-sources.md`).

## Méthode

La source de vérité reste le rapport de corroboration existant : deux
éditeurs distincts sur la même victime et le même revendicataire dans une
fenêtre de 72 h. Pour chaque incident du périmètre NA :

- deux sources indépendantes → `second_source`, décision immédiate ;
- une seule source et 48 h écoulées depuis la première revendication →
  `after_delay`, avec la date exacte où le délai est rempli ;
- une seule source et moins de 48 h → `pending`, avec l'âge mesuré.

La date de décision est calculée à partir de `firstClaimAt`, jamais devinée.
Les groupes hors Nouvelle-Aquitaine et les groupes sans affirmation d'incident
sont exclus.

## Mesure reproductible

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-corroboration-48h.mts \
  --json=bench/results/corroboration-48h-2026-11-22.json
```

Base mesurée : 543 sources, 27 899 événements. Résultat : **56 incidents,
2 `second_source`, 52 `after_delay`, 2 `pending`**, âge médian des incidents en
attente 39,61 h. Aucun incident n'est nommé avant sa date de décision.

La route a aussi été vérifiée sur le serveur réel (`GET
/api/incident-corroboration/verdicts` → 200, mêmes totaux).

## Contrainte de confidentialité

La réponse et le rapport ne contiennent que des empreintes SHA-256 tronquées,
des horodatages et des noms d'éditeurs. Aucun titre, résumé, nom d'organisation
ou donnée personnelle de victime n'est exposé — le test de route vérifie
l'absence de titre et d'URL dans la réponse JSON.

Sources grises autorisées, aucun service payant, aucun appel réseau.
`server.ts` n'est pas modifié (0 ligne de diff) ; l'enregistrement de la route
passe par `routes/index.js` et la règle publique par `security/rbac.ts`.

Preuve : `bench/results/corroboration-48h-2026-11-22.json` — SHA-256
`9c6903c95db97bcd63580e87d9862c253e4c7b570432bd0a79d0960b4eca2a26`.

Vérification : 17 tests verts (`incident-corroboration`,
`incident-corroboration-48h`, `incident-corroboration-verdicts-route`) et
`tsc --noEmit` vert sur `apps/api`.
