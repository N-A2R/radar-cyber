# Rapport — early warning mondial → régional (Nouvelle-Aquitaine)

Branche `ext/chantier-m8`, base `origin/main` (7a3ebe0), 22 novembre 2026.

## La question et la réponse

**Quel est le délai entre une campagne mondiale et son arrivée en
Nouvelle-Aquitaine, mesuré sur 10 campagnes passées ?**

> **180,865 heures (7,54 jours) — médiane sur 10 campagnes passées.**

À titre complémentaire, le délai médian entre le moment où la campagne devient
identifiable (deuxième incident, règle de `analyse/campagnes.ts`) et la première
observation en NA est de **144,545 heures (6,02 jours)**. Extrémités du délai
mondial → NA : 0 h à 258,02 h.

## État réel de départ

La mission citait 1 673 151 organisations, 312 sources et ~28 000 événements.
La base vivante au moment de la mesure contient **1 673 220 organisations,
463 sources, 27 899 événements et 46 campagnes**, dont **exactement 10**
ayant une observation datée en Nouvelle-Aquitaine. Les chiffres de la mission
étaient donc des ordres de grandeur ; toutes les mesures ci-dessous viennent
de la base réelle, sans jeu de test ni donnée synthétique.

## Définition mesurée

- **Départ** : `event.observed_at` du premier incident daté de la campagne,
  où que ce soit dans le monde.
- **Arrivée** : `event.observed_at` du premier incident de la même campagne
  portant `event.regional = true` (rattachement Nouvelle-Aquitaine, 12
  départements).
- **Campagne** : regroupement déterministe par ancre de `analyse/campagnes.ts`
  ; une campagne devient identifiable à son deuxième incident.
- **Périmètre** : Nouvelle-Aquitaine uniquement ; sources publiques et grises
  déjà ingérées par le radar, aucun service payant.
- **Vie privée** : la requête ne projette que quatre colonnes non
  personnelles — identifiant d'événement, date d'observation, identifiant de
  source, drapeau régional. Aucun nom, titre, résumé ou élément de preuve de
  victime ne traverse le calcul, la route HTTP ou le fichier de mesure.

## Les 10 campagnes mesurées

| Campagne | Délai mondial → NA (h) | Préavis au seuil d'identification (h) | Incidents NA |
|---|---:|---:|---:|
| safepay | 167,05 | 0 | 1 |
| lockbit3 | 0 | 0 | 9 |
| hellcat | 171,59 | 0 | 1 |
| krybit | 201,21 | 63,27 | 1 |
| vexy | 118,25 | 118,25 | 3 |
| cactus | 170,84 | 170,84 | 19 |
| bravox | 190,14 | 190,14 | 1 |
| curiousworm | 237,21 | 237,21 | 1 |
| darkproject | 254,43 | 254,43 | 1 |
| incransom | 258,02 | 258,02 | 1 |

`lockbit3` a un délai nul car son premier incident observé est déjà régional ;
le préavis est ramené à zéro quand l'arrivée NA précède le deuxième incident.
Ces cas sont conservés dans la médiane, sans exclusion arbitraire.

## Reproduction

Commande reproductible (lecture seule, moins de 60 s) :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm mesure:global-regional --campaigns=10 \
  --json=bench/results/global-to-regional.json
```

Le résultat complet, avec les dix campagnes et la requête SQL employée, est
versionné dans `bench/results/global-to-regional.json`. Le script échoue
explicitement s'il reste moins de 10 campagnes éligibles, au lieu de publier
une médiane partielle.

La même règle est exposée publiquement par
`GET /api/early-warning/global-to-regional?campaigns=10` (agrégats et horodatages
uniquement). Le diff de `apps/api/src/server.ts` est de **0 ligne** : le
registre de routes existant (`routes/index.ts`) suffit.

## Contrôles

- 16 tests ciblés verts (`global-to-regional.test.ts`,
  `global-to-regional-route.test.ts`, `securite-couverture.test.ts`), un
  comportement par test, base de test jetable, aucune donnée de victime.
- `tsc --noEmit` sur `@radar/api` : 0 erreur.
- Médiane recoupée indépendamment par une requête SQL de fenêtrage sur la base
  réelle : 180,865 h.
- Code et interface en anglais, rapport en français ; aucune commande de
  diagnostic ou de mesure dépassant 60 s.
OBJECTIF : atteint — 10 / 10 campagnes passées mesurées (180,865 h médianes)
