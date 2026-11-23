# Rapport — Disponibilité des services publics de Nouvelle-Aquitaine

Date de mesure : 23 novembre 2026 (UTC). Branche : `ext/rattrapage-rapport-disponibilite-services-publics`.

## Question

Quelle est la disponibilité réelle de 500 services publics de Nouvelle-Aquitaine
sur une fenêtre de sept jours ?

## Périmètre

Le périmètre est construit à partir du corpus institutionnel versionné
`bench/corpus/institutions-complet.jsonl` (1 442 établissements publics dont
l'adresse a été vérifiée par une requête HTTP dans le cadre de l'annuaire
`education.gouv.fr`). La sélection est deterministic : tri par empreinte SHA-256
de l'identifiant opaque, puis prise des 500 premiers. Elle ne dépend ni du nom
de l'établissement, ni de l'ordre du fichier, ni d'un service payant.

Les douze départements de Nouvelle-Aquitaine sont les seuls admis (16, 17, 19,
23, 24, 33, 40, 47, 64, 79, 86, 87). Aucun identifiant de victime, aucun nom de
personne et aucun champ libre n'entre dans la mesure : seuls l'identifiant
opaque, le type d'établissement, le département et l'URL publique sont conservés.
Les sources grises resteraient admises si elles fournissaient une observation ;
aucune n'est nécessaire ici.

L'état de départ est celui de la base réelle : 1 673 151 organisations,
312 sources, 26 259 événements (`bench/results/NA-global-search.json`,
`bench/gold/manifest.json`).

## Méthode

1. **Observation historique réelle** : chaque ligne du corpus porte une date de
   vérification HTTP (`preuve.verifie_le`) et le code obtenu. Ces observations
   sont importées telles quelles, sans extrapolation (500 services, 21 novembre).
2. **Observation live bornée** : `services:collect` interroge les 500 URL avec
   `fetch`, un timeout par requête, une concurrence bornée et un délai global
   inférieur à une minute. Deux collectes réelles ont versé des observations :
   le 22 novembre (concurrence 50, 420 sondes) et le 23 novembre (concurrence
   100, 500 sondes). Seuls le code HTTP, le temps de réponse, le jour UTC
   et un code d'échec générique sont conservés ; aucun corps de réponse n'est lu.
3. **Rejeu** : `services:measure` recombine les observations, garde une ligne par
   couple (service, jour) — succès prioritaire, puis observation la plus
   ancienne — et calcule la disponibilité sur les sept jours calendaires UTC se
   terminant à la date d'ancrage. Le rejeu est hors réseau, hors base et
   déterministe.

Un « service-jour » est un service observé un jour UTC de la fenêtre. La
disponibilité publiée est la part des service-jours observés ayant répondu en
HTTP 2xx ou 3xx. La couverture est publiée à côté : elle empêche de confondre
absence d'observation et panne de service.

## Chiffre obtenu

**500 services publics NA suivis ; 1 420 service-jours réellement observés sur les
3 500 attendus ; 1 005 service-jours disponibles, soit une disponibilité mesurée
de 70,77 % sur la fenêtre du 17 au 23 novembre 2026.**

| Indicateur | Valeur mesurée |
|---|---:|
| Services du périmètre | 500 |
| Service-jours attendus (500 × 7) | 3 500 |
| Service-jours observés | 1 420 |
| Couverture de la fenêtre | 40,57 % |
| Service-jours disponibles | 1 005 |
| **Disponibilité observée** | **70,77 %** |
| Services avec sept jours complets | 0 |

Détail par jour :

| Jour | Observés | Disponibles | Disponibilité |
|---|---:|---:|---:|
| 17 novembre | 0 | 0 | — |
| 18 novembre | 0 | 0 | — |
| 19 novembre | 0 | 0 | — |
| 20 novembre | 0 | 0 | — |
| 21 novembre | 500 | 500 | 100 % |
| 22 novembre | 420 | 5 | 1,19 % |
| 23 novembre | 500 | 500 | 100 % |

Résultat versionné le 23 novembre : `bench/results/service-availability-na-2026-11-23.json`
(le résultat initial du 22 novembre reste dans
`bench/results/service-availability-na-2026-11-22.json`).
Observations versionnées : `bench/results/service-availability-observations.jsonl`
(1 420 lignes).

## Ce que ce chiffre mesure, et ce qu'il ne mesure pas

- Il mesure une **disponibilité observée**, pas une disponibilité continue : les
  jours sans observation ne sont pas comptés comme disponibles ni comme en
  panne. La couverture de 40,57 % est donc aussi importante que le pourcentage.
- La journée du 21 novembre vient d'une vérification HTTP réelle déjà versée au
  corpus ; les journées des 22 et 23 novembre viennent de sondes locales. Les
  protocoles ne sont pas identiques (la sonde locale impose un timeout court).
- Le 22 novembre, 413 des 420 sondes ont expiré et deux ont échoué avant
  connexion : ce résultat reflète surtout les limites de sortie réseau du bac à
  sable, où la même URL répond en 0,2 s avec `curl` et dépasse le timeout avec
  `fetch`. Il ne doit pas être lu comme un taux de panne réel des établissements.
- Le 23 novembre, une seconde collecte avec concurrence 100 a couvert les 500
  services en 26 s ; un contrôle du 24 novembre a remplacé le seul timeout par
  une réponse HTTP 200 réelle, portant la journée à 500 disponibles sur 500.
  C'était la première journée locale où le périmètre entier était observé.
- **L'objectif « sur 7 jours » n'est pas tenu** : quatre jours de la fenêtre
  (17 au 20 novembre) n'ont aucune observation, soit 2 000 service-jours
  manquants. Une recherche exhaustive n'a trouvé aucune observation réelle pour
  ces dates : ni dans l'arbre ou l'historique Git, ni dans la base PostgreSQL
  (`source_verification`, `warc_proof` : premiers relevés les 21 et 22 novembre),
  ni dans les sources grises testées (Wayback CDX : 0 capture sur la fenêtre
  pour les URL du périmètre ; Common Crawl : index le plus récent arrêté au
  19 novembre, requêtes en échec). Les compléter reviendrait à inventer des
  observations. Le pipeline reste en place pour les collectes quotidiennes.
- **Nouvelle vérification du 24 novembre (UTC 23 novembre 23 h 26)** : une
  collecte bornée relancée avec `--anchor=2026-11-24` a sondé 500 services en
  29 s (492 disponibles) mais n'a apporté aucun nouveau jour : le collecteur
  date les sondes du jour UTC courant, encore 23 novembre, et la fusion
  quotidienne les a dédupliquées (un seul service, précédemment en timeout,
  a vu son observation remplacée par une réponse 200 réelle). Le rejeu de la
  base PostgreSQL confirme l'absence de relevés avant le 21 novembre
  (`source_verification` et `warc_proof` : 7 236 et 167 lignes, toutes au
  21 novembre). Aucun jour manquant ne peut donc être observé rétroactivement
  sans inventer une date.

## Reproduire

```bash
# Rejeu du chiffre publié (hors réseau, < 1 s)
pnpm services:measure -- --anchor=2026-11-23

# Collectes bornées réellement exécutées (< 60 s chacune)
pnpm services:collect -- --anchor=2026-11-22
pnpm services:collect -- --anchor=2026-11-23 --concurrency=100 --deadline-ms=50000

# Statut de l'objectif, calculé depuis le résultat versionné (hors réseau)
pnpm services:verify -- --anchor=2026-11-23
```

La commande de rejeu réécrit `bench/results/service-availability-na-<date>.json`
et affiche le nombre de services, le nombre de service-jours observés et la
disponibilité. Les observations ne sont jamais modifiées par le rejeu.

## Contrôles

- 15 tests de comportement (`apps/api/test/service-availability.test.ts`) : un
  test par comportement, tous hors réseau et hors base.
- `tsc --noEmit -p apps/api/tsconfig.json` : aucune erreur.
- Périmètre Nouvelle-Aquitaine uniquement ; sources grises autorisées ; aucune
  donnée personnelle de victime ; aucun service payant ; aucune modification de
  `server.ts` ; aucune commande de mesure supérieure à 60 secondes.

OBJECTIF : partiel — 3 / 7 jours de la fenêtre réellement observés (1 420 / 3 500 service-jours), manque 4 jours d'observation (17 au 20 novembre, 2 000 service-jours) ; rejoué le 23/11/2026 avec `apps/api/node_modules/.bin/tsx scripts/measure-service-availability.mts --anchor=2026-11-23` (code 0) : `services=500 window=2026-11-17..2026-11-23 observed_service_days=1420/3500 available=1005 availability=70,77 %`, résultat versionné `bench/results/service-availability-na-2026-11-23.json` ; statut reproductible `pnpm services:verify -- --anchor=2026-11-23` (code 0) : `OBJECTIF : partiel — 3 / 7 jours (1420 / 3500 service-jours), manque 4 (2026-11-17,2026-11-18,2026-11-19,2026-11-20), 2080 service-jours`.
