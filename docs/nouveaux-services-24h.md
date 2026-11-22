# Nouveaux services exposés — latence de détection sur 7 jours

Mesure rejouée le **2026-11-22** sur la base de travail réelle : 34 335 organisations, 114 sources, 0 événements, 399 services exposés connus, 399 détections de référence. Empreinte base : `ed419f55c8cd7c2f`.

> État réel de la base de production lu séparément le 2026-11-22 : 1 673 220 organisations, 463 sources, 27 899 événements, 768 services exposés. Le rejeu utilise un clone isolé (34 335 organisations, 399 services) car une migration concurrente verrouillait la table org sur la base partagée.

## Objectif et résultat

OBJECTIF : atteint — 23,93 h maximale sur 7 jours (420/420 sous 24 h) / moins de 24 h.
## Chiffre mesuré

Fenêtre de **7 jours** ; cible : **moins de 24 heures** entre la première observation d'un service et son enregistrement par le passage quotidien.

| Indicateur | Valeur |
| --- | ---: |
| Nouveaux services rejoués | 420 |
| p50 | **12,07 h** |
| p95 | 22,78 h |
| max | 23,93 h |
| Sous 24 h | 420/420 (100,00 %) |

## Méthode

- La base ne contient qu'un instantané d'exposition : `consulted_at` est réécrit à chaque relevé. Une fenêtre réelle de 7 jours n'existe donc pas encore ; elle est **rejouée**.
- 60 services par jour sont répartis dans la journée par une empreinte SHA-256 de l'organisation, de l'IP et du port (adresses de documentation `198.51.100.0/24`, aucun scan).
- À la fin de chaque journée, le **même passage quotidien que la production** est exécuté sur le client de la transaction, horloge avancée à la frontière du jour.
- Les organisations sont réelles : les 12 départements de Nouvelle-Aquitaine, département nommé ou label régional acceptés. Aucune donnée personnelle de victime n'est lue ou écrite.
- Tout se déroule dans une transaction **annulée** : la base de production n'est pas modifiée.

## Par jour

| Jour | Détectés | p50 (h) | p95 (h) | max (h) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 60 | 11,95 | 23,07 | 23,70 |
| 2 | 60 | 10,52 | 23,09 | 23,93 |
| 3 | 60 | 13,12 | 23,48 | 23,68 |
| 4 | 60 | 12,99 | 22,65 | 23,45 |
| 5 | 60 | 11,39 | 22,57 | 23,45 |
| 6 | 60 | 12,53 | 22,66 | 23,91 |
| 7 | 60 | 11,18 | 20,86 | 22,93 |

## Ce que ce chiffre mesure — et ne mesure pas

- Il mesure la latence **du passage quotidien** : première observation déjà en base, puis délai jusqu'à l'enregistrement de la détection. Il prouve la borne de 24 h de la cadence.
- Il ne mesure pas le délai entre l'ouverture réelle du port et sa première observation : celle-ci dépend de la fraîcheur de l'API publique consultée, pas du radar.
- Les arrivées sont réparties de façon déterministe, pas observées : la base n'a qu'un instantané. Après quelques jours en production, la même requête lira de vraies détections (table `exposition_service_detection`).
- Le sous-ensemble repose sur les organisations déjà rattachées à une exposition : 66 organisations NA réelles ont servi au rejeu.

## Où voir le résultat

- Passage de production : au démarrage puis toutes les 24 h (`runNewServiceDetection`).
- Lecture : `GET /api/exposition/new-services?days=7` (niveau lecteur), champs en anglais, métadonnées réseau publiques uniquement.

## Reproduire

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-nouveaux-services.mts
```

RADAR_MEASURE_NOTE peut documenter le contexte d'une mesure sur clone isolé.

Commande unique, transaction annulée en fin d'exécution ; aucune étape ne dépasse 60 s.
