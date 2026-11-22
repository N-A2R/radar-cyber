# Source primaire obligatoire — mesure du 22 novembre 2026

## Objectif

La roadmap 3 ans (`docs/roadmap-3ans.md`, contrainte juridique n°1) interdit de
nommer une organisation sans lien public vers la source qui l'affirme : « Pas de
source, pas de nom. » Les tranches précédentes avaient livré la corroboration,
le délai de 48 h et le journal de la décision de publier, mais aucune décision
ne portait le lien qui la rend vérifiable par un tiers.

OBJECTIF : atteint — 49 / 49 incidents NA nommés avec un lien public vers la source qui les affirme / 49 incidents NA

## Ce qui est livré

- `apps/api/src/analyse/source-primaire.ts` : extrait une URL publique par
  incident depuis les événements de la grappe. Seules les URL `http(s)` avec un
  domaine sont acceptées ; la requête et le fragment sont retirés (jetons,
  données personnelles éventuelles). Les adresses `.onion` en `http` restent
  acceptées : ce sont des sources grises déjà utilisées par le radar, pas un
  service payant.
- `apps/api/src/analyse/publication-decisions.ts` : quand un audit des sources
  est fourni, chaque décision porte `sourcePrimaire`. Sans URL publique, le
  nommage est refusé sous `source-primaire-manquante` — même si deux éditeurs
  confirment l'incident ou si 48 h se sont écoulées. L'URL entre dans la chaîne
  SHA-256 : la modifier casse le rejeu. Sans audit, le comportement historique
  est inchangé, donc les journaux déjà publiés restent rejouables.
- `GET /api/source-primaire` : route publique en lecture seule, avec le
  récapitulatif, la tête de chaîne et le rejeu.
- `scripts/measure-source-primaire.mts` (`pnpm mesure:source-primaire`) et
  `bench/results/source-primaire-2026-11-22.json`. Aucune écriture en base.
- Le fait `publication.decided` du journal append-only porte désormais le champ
  `sourcePrimaire` quand l'audit est fourni.

## Limite assumée

Le lien publié est l'URL publique de l'éditeur enregistrée avec l'événement
(flux public ou site de revendication), pas une URL d'article propre à chaque
victime : la base ne stocke pas cette dernière. Le champ prouve donc quelle
source publique affirme l'incident, pas quel article précis le relaye ; la
mesure ne prétend pas davantage.

## Mesure

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-source-primaire.mts \
  --json=bench/results/source-primaire-2026-11-22.json
```

Base mesurée : 914 sources, 26 770 événements. Résultat : **49 incidents, 49
avec une URL publique, 0 nommé sans source**, chaîne rejouée **49/49 (ok)**.
Répartition des verdicts : 2 confirmés par deux éditeurs, 47 après 48 h. Sur
les 49 liens, 34 sont des URL web ordinaires et 15 des adresses `.onion` de
sites de revendication (sources grises autorisées, aucun paiement, aucun
contact avec un groupe criminel). Le garde-fou est vérifié sur données réelles
par le test de route : une source seulement en `onion:` (schéma non HTTP) est
anonymisée avec le motif `source-primaire-manquante`.

## Contrainte de confidentialité

Le rapport et la route ne contiennent que des URL publiques nettoyées, des
empreintes tronquées de victime, des horodatages, des motifs et des compteurs —
jamais un titre, un nom d'organisation ou une donnée personnelle. Les tests de
route vérifient l'absence des titres, des noms et du jeton d'URL. Aucun appel
réseau, aucun service payant, aucune écriture en base. `server.ts` n'est pas
modifié par cette tranche.

## Vérification

- 10 tests verts sur deux fichiers (`source-primaire`, `source-primaire-route`),
  un test par comportement, dont l'anonymisation d'un incident confirmé mais
  sans source et la détection d'une URL réécrite dans la chaîne.
- 9 tests de la tranche précédente (`publication-decisions` et sa route)
  toujours verts : le journal historique reste rejouable.
- `tsc --noEmit` vert sur `apps/api`.
- Route appelée par `app.inject` : 200, mêmes totaux que la mesure, chaîne
  valide, aucune donnée personnelle exposée.
