# Rapport — Disponibilité des services publics de Nouvelle-Aquitaine

Date de mesure : 22 novembre 2026. Branche : `ext/chantier-p5`.

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
   inférieur à une minute. Seuls le code HTTP, le temps de réponse, le jour UTC
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

**500 services publics NA suivis ; 920 service-jours réellement observés sur les
3 500 attendus ; 505 service-jours disponibles, soit une disponibilité mesurée
de 54,89 % sur la fenêtre du 16 au 22 novembre 2026.**

| Indicateur | Valeur mesurée |
|---|---:|
| Services du périmètre | 500 |
| Service-jours attendus (500 × 7) | 3 500 |
| Service-jours observés | 920 |
| Couverture de la fenêtre | 26,29 % |
| Service-jours disponibles | 505 |
| **Disponibilité observée** | **54,89 %** |
| Services avec sept jours complets | 0 |

Détail par jour :

| Jour | Observés | Disponibles | Disponibilité |
|---|---:|---:|---:|
| 16 novembre | 0 | 0 | — |
| 17 novembre | 0 | 0 | — |
| 18 novembre | 0 | 0 | — |
| 19 novembre | 0 | 0 | — |
| 20 novembre | 0 | 0 | — |
| 21 novembre | 500 | 500 | 100 % |
| 22 novembre | 420 | 5 | 1,19 % |

Résultat versionné : `bench/results/service-availability-na-2026-11-22.json`.
Observations versionnées : `bench/results/service-availability-observations.jsonl`.

## Ce que ce chiffre mesure, et ce qu'il ne mesure pas

- Il mesure une **disponibilité observée**, pas une disponibilité continue : les
  jours sans observation ne sont pas comptés comme disponibles ni comme en
  panne. La couverture de 26,29 % est donc aussi importante que le pourcentage.
- La journée du 21 novembre vient d'une vérification HTTP réelle déjà versée au
  corpus ; la journée du 22 novembre vient d'une sonde locale. Les deux protocoles
  ne sont pas identiques (la sonde locale impose un timeout court).
- Sur la journée locale, 413 des 420 sondes ont expiré et deux ont échoué avant
  connexion. Ce résultat reflète en grande partie les limites de sortie réseau
  de l'environnement de mesure, où une même URL répond en 1,9 s avec `curl` et
  dépasse le timeout avec `fetch`. Il ne doit pas être lu comme un taux de panne
  réel des établissements.
- **L'objectif « sur 7 jours » n'est pas tenu** : cinq jours de la fenêtre n'ont
  aucune observation. Une mesure de disponibilité continue sur sept jours
  exige sept collectes quotidiennes réelles ; aucune donnée historique locale
  ne permet de la reconstituer rétroactivement sans inventer des observations.
  Le pipeline est en place pour les jours suivants, mais le chiffre définitif
  ne pourra être publié qu'après la septième collecte.

## Reproduire

```bash
# Rejeu du chiffre publié (hors réseau, < 1 s)
pnpm measure:service-availability -- --anchor=2026-11-22

# Nouvelle collecte bornée (une fois par jour, < 60 s)
pnpm services:collect -- --anchor=YYYY-MM-DD
```

La commande de rejeu réécrit `bench/results/service-availability-na-<date>.json`
et affiche le nombre de services, le nombre de service-jours observés et la
disponibilité. Les observations ne sont jamais modifiées par le rejeu.

## Contrôles

- 14 tests de comportement (`apps/api/test/service-availability.test.ts`) : un
  test par comportement, tous hors réseau et hors base.
- `tsc --noEmit -p apps/api/tsconfig.json` : aucune erreur.
- Périmètre Nouvelle-Aquitaine uniquement ; sources grises autorisées ; aucune
  donnée personnelle de victime ; aucun service payant ; aucune modification de
  `server.ts` ; aucune commande de mesure supérieure à 60 secondes.

OBJECTIF : partiel — 2 / 7 jours de la fenêtre réellement observés (920 / 3 500 service-jours), manque 5 jours d'observation (16 au 20 novembre, 2 580 service-jours) ; rejoué le 22/11/2026 avec `apps/api/node_modules/.bin/tsx scripts/measure-service-availability.mts --anchor=2026-11-22` (code 0) : `services=500 observed_service_days=920/3500 available=505 availability=54,89 %`, résultat versionné inchangé.
