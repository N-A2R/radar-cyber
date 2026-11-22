# Rapport — clustering des modes opératoires

Date : 22 novembre 2026. Mesure figée à `2026-11-22T01:05:50.958Z` dans
`bench/results/operating-modes.json`. Branche : `ext/chantier-e7`.

## Résultat chiffré

**6 modes opératoires identifiés** sur les 49 événements régionaux classés.

| Mode (libellé anglais) | Événements | Sources distinctes |
| --- | ---: | ---: |
| Ransomware extortion claim | 22 | 1 |
| Ransomware extortion with data publication | 19 | 1 |
| Vulnerability exposure reported by an advisory | 4 | 4 |
| Data leak publication | 2 | 2 |
| Service disruption | 1 | 1 |
| Vulnerability exposure reported by news | 1 | 1 |

Quatre modes sont récurrents (au moins deux événements) et deux ne sont observés
qu'une seule fois ; ils comptent néanmoins comme identifiés, la mesure déclarée
étant le nombre de signatures distinctes observées, pas le nombre de modes
fréquents.

## État de départ et périmètre

La base réelle au moment de la mesure contient **1 673 151 organisations**,
**312 sources** et **26 394 événements**. Les 26 394 événements sont parcourus ;
seuls les **72 événements de Nouvelle-Aquitaine** (`event.regional = true` :
60 par rattachement, 12 par mention d'un département) alimentent le clustering.
Les 23 événements régionaux sans signature technique exploitable restent
`unclassified` et ne deviennent pas un mode.

Les sources grises (suivi de groupes ransomwares, fuites, Flux Telegram,
paste sites) sont admises au même titre que les sources officielles : aucune
liste de confiance par nom de source n'est appliquée. Aucun appel réseau ni
service payant n'est utilisé, que ce soit dans le clustering ou dans la mesure.

## Définition d'un mode

Un mode est une **signature technique reproductible**, composée d'une technique
et d'une variante issue de champs structurés. Il ne décrit ni un acteur, ni une
victime, ni une campagne : deux incidents d'acteurs différents utilisant la
même méthode relèvent du même mode, et deux revendications d'un même acteur
avec des méthodes différentes relèvent de deux modes. La clé est stable d'une
exécution à l'autre et indépendante de l'ordre des événements.

Règles appliquées dans cet ordre (premier résultat retenu) :

1. famille `ransomware` ou groupe structuré dans `evidence` →
   `ransomware-extortion`, variante `publication` si un pourcentage de
   divulgation apparaît dans le titre, sinon `claim` ;
2. famille `leaks` → `data-leak:publication` ;
3. mots-clés de technique dans le titre (phishing d'identifiants,
   typosquatting, chaîne d'approvisionnement, déni de service,
   défiguration, fuite de données, vulnérabilité) → technique correspondante ;
4. vecteur CVSS présent → variante d'accès (`scope-change`, `local-access`,
   `user-interaction`, `unauthenticated-remote`, `authenticated-remote`) ;
   avis sans vecteur → `advisory`, article sans vecteur → `reported` ;
5. aucun signal → non classé, jamais compté comme mode.

Aucun titre, URL, nom d'organisation, nom de victime ou nom de personne n'est
copié dans un mode : la sortie ne contient que des libellés de technique et des
compteurs. Un test dédié vérifie l'absence de ces données.

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:modes --json=bench/results/operating-modes.json
```

Durée mesurée : **1,1 s** (base locale). Un second passage à `01:06:12 UTC`
a produit exactement le même ensemble de 6 modes. La base étant alimentée en
continu, le fichier JSON committé constitue l'instantané de référence du
chiffre publié.

## Tests

Neuf tests, un par comportement observable (périmètre régional, séparation
revendication/divulgation, comptage des sources, variantes CVSS, techniques par
mot-clé, priorité du signal structuré, non-classification du bruit, absence de
données personnelles, indépendance à l'ordre d'entrée) :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx apps/api/test/run.ts \
  apps/api/test/operating-modes.test.ts
```

Résultat : **9/9 réussis**, typecheck API sans erreur. `apps/api/src/server.ts`
n'a pas été modifié (0 ligne de diff).

## Limites assumées

- Le drapeau `regional` est bruité : 23 des 72 événements régionaux relèvent
  d'une actualité locale sans lien avec une méthode d'attaque. Ils sont comptés
  à part plutôt que forcés dans un mode.
- Les 41 revendications ransomware viennent d'une seule source (`ransomlook`) ;
  le compteur de sources ne doit donc pas être lu comme une corroboration.
- Aucun mode d'exploitation CVSS n'apparaît dans l'échantillon régional : les
  CVE sont enregistrées comme non régionales dans cette base. Les règles CVSS
  sont testées mais ne s'appliquent pas à cette mesure.
- Deux modes reposent sur un seul événement : ils sont publiés avec leur
  effectif réel, sans extrapolation.
