# Communications de crise en Nouvelle-Aquitaine — mesure reproductible

Mesure exécutée le 2026-11-22T03:51:29.829Z.

**17 pages de crise ou communiqués publiés après incident détectés, dont 8 avec un délai calculable (5 jours médians).**

État réel de la base au moment de la mesure : 1 673 151 organisations, 312 sources, 26 259 événements.

## Définition mesurée

Une communication de crise est une page de premier rang (institution publique ou source grise de premier rang : syndicat, ordre professionnel, association) publiée par l'organisation concernée, dont le titre ou l'URL porte un signal d'incident, de cybersécurité, d'alerte ou d'indisponibilité, et dont la date de publication est explicite et postérieure à la date de l'incident. Les articles de presse et les blogs de fuite sont des témoignages tiers : ils ne comptent pas comme communications de la victime.

Le délai est le nombre de jours UTC écoulés entre la date de l'incident et la date de publication de la communication. Il n'est calculé que lorsque les deux dates sont présentes et cohérentes ; une date d'incident inconnue donne un délai `null`, jamais une estimation.

## Résultat

| Compteur | Valeur |
| --- | ---: |
| Incidents datés du corpus analysé | 122 |
| Pages presse ou blogs exclues | 102 |
| Pages hors Nouvelle-Aquitaine exclues | 0 |
| Communications détectées | 17 |
| Délais incident → communication calculés | 8 |
| Délai médian (jours) | 5 |
| Délai minimal / maximal (jours) | 0 / 30 |

## Périmètre et contraintes

- Nouvelle-Aquitaine uniquement : les 12 départements de la région sont acceptés, les autres sont rejetés avant détection.
- Sources grises de premier rang autorisées ; aucun service payant, aucun appel réseau pendant la mesure.
- Aucune donnée personnelle de victime : le JSON publié ne contient ni titre, résumé, nom de victime, ni URL complète ; l'organisation est réduite à un hash SHA-256 tronqué.
- Le corpus est versionné dans `bench/corpus/incidents-*.jsonl` et la mesure est déterministe : deux exécutions donnent le même décompte.

## Objectif vérifié

- pages de crise de premier rang détectées : 17 (attendu >= 17) — OK
- délais incident → communication mesurés : 8 (attendu >= 8) — OK
- pages de presse acceptées à tort : 0 (attendu 0) — OK
- pages hors région acceptées à tort : 0 (attendu 0) — OK

## Reproduction

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/measure-crisis-communications.mts
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/verify-crisis-communications-objective.mts
```
OBJECTIF : atteint — 17 / 17
