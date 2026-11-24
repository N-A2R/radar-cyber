# Rapport — Disponibilité des services publics de Nouvelle-Aquitaine

Date de mesure : 24 novembre 2026 (UTC). Branche : `ext/rattrapage-rapport-disponibilite-services-publics`.

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
   inférieur à une minute. Trois collectes réelles ont versé des observations :
   le 22 novembre (concurrence 50, 420 sondes), le 23 novembre (concurrence
   100, 500 sondes) et le 24 novembre à 00 h 00 UTC (concurrence 100,
   500 sondes, 50 s de délai global). Seuls le code HTTP, le temps de réponse,
   le jour UTC et un code d'échec générique sont conservés ; aucun corps de
   réponse n'est lu.
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

**500 services publics NA suivis ; 1 920 service-jours réellement observés sur les
3 500 attendus ; 1 334 service-jours disponibles, soit une disponibilité mesurée
de 69,48 % sur la fenêtre du 18 au 24 novembre 2026.**

| Indicateur | Valeur mesurée |
|---|---:|
| Services du périmètre | 500 |
| Service-jours attendus (500 × 7) | 3 500 |
| Service-jours observés | 1 920 |
| Couverture de la fenêtre | 54,86 % |
| Service-jours disponibles | 1 334 |
| **Disponibilité observée** | **69,48 %** |
| Services avec sept jours complets | 0 |

Détail par jour :

| Jour | Observés | Disponibles | Disponibilité |
|---|---:|---:|---:|
| 18 novembre | 0 | 0 | — |
| 19 novembre | 0 | 0 | — |
| 20 novembre | 0 | 0 | — |
| 21 novembre | 500 | 500 | 100 % |
| 22 novembre | 420 | 5 | 1,19 % |
| 23 novembre | 500 | 500 | 100 % |
| 24 novembre | 500 | 329 | 65,80 % |

Résultat versionné le 24 novembre : `bench/results/service-availability-na-2026-11-24.json`
(les résultats des 22 et 23 novembre restent dans
`bench/results/service-availability-na-2026-11-22.json` et
`bench/results/service-availability-na-2026-11-23.json`).
Observations versionnées : `bench/results/service-availability-observations.jsonl`
(1 920 lignes).

## Ce que ce chiffre mesure, et ce qu'il ne mesure pas

- Il mesure une **disponibilité observée**, pas une disponibilité continue : les
  jours sans observation ne sont pas comptés comme disponibles ni comme en
  panne. La couverture de 54,86 % est donc aussi importante que le pourcentage.
- La journée du 21 novembre vient d'une vérification HTTP réelle déjà versée au
  corpus ; les journées des 22, 23 et 24 novembre viennent de sondes locales.
  Les protocoles ne sont pas identiques (la sonde locale impose un timeout court).
- Le 22 novembre, 413 des 420 sondes ont expiré et deux ont échoué avant
  connexion : ce résultat reflète surtout les limites de sortie réseau du bac à
  sable, où la même URL répond en 0,2 s avec `curl` et dépasse le timeout avec
  `fetch`. Il ne doit pas être lu comme un taux de panne réel des établissements.
- Le 23 novembre, une seconde collecte avec concurrence 100 a couvert les 500
  services en 26 s ; un contrôle avant minuit UTC a remplacé le seul timeout par
  une réponse HTTP 200 réelle, portant la journée à 500 disponibles sur 500.
  C'était la première journée locale où le périmètre entier était observé.
- **L'objectif « sur 7 jours » n'est pas tenu** : trois jours de la fenêtre
  (18 au 20 novembre) n'ont aucune observation, soit 1 500 service-jours
  manquants, auxquels s'ajoutent 80 service-jours non sondés le 22 novembre
  (1 580 au total). Une recherche exhaustive n'a trouvé aucune observation réelle pour
  ces dates : ni dans l'arbre ou l'historique Git, ni dans la base PostgreSQL
  (`source_verification`, `warc_proof` : premiers relevés les 21 et 22 novembre),
  ni dans les sources grises testées (Wayback CDX : 0 capture sur la fenêtre
  pour les URL du périmètre ; Common Crawl : index le plus récent arrêté au
  19 novembre, requêtes en échec). Les compléter reviendrait à inventer des
  observations. Le pipeline reste en place pour les collectes quotidiennes.
- **Contrôle indépendant des sources grises (24 novembre)** : 37 requêtes HTTP bornées vers 8 archives ouvertes, sur 14 URL exactes du périmètre et les 4 jours alors manquants (17 au 20 novembre) : 0 capture sur 56 URL-jours. Wayback CDX renvoie `[]` pour les 14 URL (contrôle sur octobre : 2 captures sur une URL, requête valide) ; `archive.org/wayback/available` ne trouve que des captures antérieures au 17 novembre ; Arquivo.pt 0/2, urlscan.io 0 (même sans filtre de date), Common Crawl (dernier index arrêté le 19 novembre) 504, Memento/BnF et `archive.ph` inaccessibles. Aucune observation rétroactive n'est donc disponible sans inventer une date.
- **Collecte réelle du 24 novembre** : lancée à 00 h 00 min 08 s UTC avec
  `--anchor=2026-11-24 --concurrency=100 --deadline-ms=50000`, elle a sondé
  500 services dans la borne de 50 s : 329 disponibles et 171 timeouts. Elle
  apporte un quatrième jour de couverture (1 920 / 3 500 service-jours). Une
  tentative antérieure à 23 h 26 UTC n'avait pas changé de jour : le
  collecteur date les sondes du jour UTC courant, encore 23 novembre.
- **Absence de relevés antérieurs confirmée** : le rejeu de la base PostgreSQL
  (`source_verification` et `warc_proof` : 7 236 et 167 lignes, toutes au
  21 novembre) et les archives publiques consultées ci-dessus ne fournissent
  aucune observation pour le 18, le 19 ou le 20 novembre. Aucun jour manquant
  ne peut être observé rétroactivement sans inventer une date.

## Reproduire

```bash
# Rejeu du chiffre publié (hors réseau, < 1 s)
pnpm services:measure -- --anchor=2026-11-24

# Collectes bornées réellement exécutées (< 60 s chacune)
pnpm services:collect -- --anchor=2026-11-22
pnpm services:collect -- --anchor=2026-11-23 --concurrency=100 --deadline-ms=50000
# À exécuter après 00 h 00 UTC :
pnpm services:collect -- --anchor=2026-11-24 --concurrency=100 --deadline-ms=50000

# Statut de l'objectif, calculé depuis le résultat versionné (hors réseau)
pnpm services:verify -- --anchor=2026-11-24
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

OBJECTIF : partiel — 4 / 7 jours de la fenêtre réellement observés (1 920 / 3 500 service-jours), manque 3 jours d'observation (18 au 20 novembre, 1 500 service-jours, soit 1 580 service-jours manquants au total avec les 80 sondes absentes du 22 novembre) ; rejoué le 24/11/2026 avec `apps/api/node_modules/.bin/tsx scripts/measure-service-availability.mts --anchor=2026-11-24` (code 0) : `services=500 window=2026-11-18..2026-11-24 observed_service_days=1920/3500 available=1334 availability=69,48 %`, résultat versionné `bench/results/service-availability-na-2026-11-24.json` ; statut reproductible `pnpm services:verify -- --anchor=2026-11-24` (code 0) : `OBJECTIF : partiel — 4 / 7 jours (1920 / 3500 service-jours), manque 3 (2026-11-18,2026-11-19,2026-11-20), 1580 service-jours`.
