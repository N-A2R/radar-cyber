# Corroboration deux sources — mesure du 22 novembre 2026

## Objectif

Augmenter le pourcentage d'incidents corroborés par au moins deux sources
indépendantes. La mesure publiée par la tranche précédente
(`bench/results/confidence-scores-2026-11-21.json`) était de **0 incident
corroboré sur 1 739** (0 %, tous territoires).

## Méthode

`apps/api/src/analyse/incident-corroboration.ts` regroupe les événements par
**victime + revendicataire**, sans fusionner d'événement et sans écrire en base :

- victime : domaine annoncé dans `evidence.org_hint`, sinon domaine du titre,
  sinon identifiant d'organisation ;
- revendicataire : `evidence.group`, sinon le groupe lu dans le titre ;
- fenêtre : 72 heures autour de la date de revendication
  (`evidence.claimed_at`, sinon `observed_at`) ;
- indépendance : deux **hébergeurs éditeurs** différents, calculés depuis
  l'URL de la source. Deux flux du même éditeur (par exemple `ransomlook` et
  `leak:ransomlook:recent-api`) comptent pour une seule source ;
- périmètre : Nouvelle-Aquitaine uniquement (`event.regional = true`, ou
  rattachement à un département NA lu sur `org.dept` par le chargeur). Un signal
  de presse d'un second éditeur peut corroborer une revendication, mais il ne
  crée pas d'incident à lui seul ;
- vie privée : le rapport ne contient aucun titre, résumé ou donnée personnelle
  de victime — seulement des empreintes SHA-256 tronquées, des identifiants
  d'événement et des noms d'éditeurs publics.

Sources grises autorisées, aucun service payant, aucun appel réseau.

## Commande reproductible

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-incident-corroboration.mts \
  --json=bench/results/incident-corroboration-2026-11-22.json
```

Équivalent : `pnpm mesure:corroboration`. La commande lit la base en lecture
seule et s'achève en environ deux secondes.

## Résultat mesuré

État réel lu en base : **1 678 195 organisations** (`org_alias`), **543
sources**, **27 899 événements**.

**2 incidents corroborés sur 56 incidents de Nouvelle-Aquitaine, soit 3,57 %.**

Les deux paires proviennent de `ransomlook.io` et `ransomware.live` : deux
revendications de rançongiciel déjà présentes dans la base, publiées à la même
heure par deux éditeurs distincts, et jusqu'ici comptées comme deux faits
isolés. Les deux flux du même éditeur RansomLook ne sont pas comptés comme une
corroboration.

Tranche suivante : le chargeur lit désormais `org.dept` (chaîne vide normalize
en `null`), ce qui porte le périmètre de 36 à 56 incidents NA sans inventer de
source. `server.ts` n'est pas modifié (0 ligne de diff). Les comportements sont
fixés par `apps/api/test/incident-corroboration.test.ts` (10 tests verts).

Preuve : `bench/results/incident-corroboration-2026-11-22.json` — SHA-256
`46f60173ab78d074d787a75c5eae6912b946bf942fc09a270f1ade1667e62350`.
