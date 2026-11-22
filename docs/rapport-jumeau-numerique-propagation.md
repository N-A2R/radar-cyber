# Rapport — Jumeau numérique de la région : propagation d’une attaque

## Prévol

Aucune PR ni aucun commit ne traitait de la simulation d’attaque ou de la
propagation sur le graphe (`gh pr list --state all --search ...` et
`git log --oneline --all | grep -i ...`). Le travail a donc été implémenté sur
`ext/chantier-r1`, créée depuis `origin/main`.

## État réel de départ

Mesuré sur la base régionale avant simulation :

- 1 673 151 organisations ;
- 312 sources ;
- 26 259 événements ;
- 27 557 entités et 81 171 relations dans le graphe temporel projeté.

Le graphe ne contient que 44 organisations rattachées à un événement : c’est
le sous-ensemble observable du jumeau numérique, pas les 1,67 million
d’organisations du référentiel. Le relevé vérifie
`organizationsOutsideNouvelleAquitaine = 0`.

## Ce qui a été livré

- `apps/api/src/attack-propagation.ts` : simulation en six étapes pures et
  testables (filtre temporel, adjacency typée, choix de la cible, expansion
  d’un saut, parcours en largeur borné, résumé statistique et export blanchi).
- `scripts/measure-attack-propagation.mts` : mesure reproductible en lecture
  seule sur la base réelle.
- `apps/api/test/attack-propagation.test.ts` : dix tests, un par comportement
  observable.
- `package.json` : une commande `measure:attack-propagation`.
- `bench/results/attack-propagation.json` : relevé daté, identifiants et
  comptages uniquement.
- `apps/api/src/server.ts` : **aucune modification** (0 ligne).

## Modèle de propagation

L’attaque démarre sur l’organisation la plus exposée, celle qui compte le plus
de relations `targeted_by` valides à la date d’observation ; en cas d’égalité,
l’identifiant le plus petit gagne. Ici : `org:482872` (5 événements).

La propagation suit les liens de corrélation du graphe dans les deux sens,
car ce sont des liens de preuve et non des flux d’attaque : `targeted_by`,
`claims`, `attributed_to`, `mentions_product`, `produced_by`, `reported_by`,
`published_on`, `owns_domain`, `dns_link`, `resolves_to`. Les liens de
taxonomie `contains` et `located_in` sont exclus : appartenir à une famille
d’événements ou à un département n’est pas un chemin d’exposition observé.
Les sources grises sont autorisées et servent de pivots via `reported_by` et
`published_on`. Seules les organisations sont comptées comme impactées ; les
événements, groupes, produits, domaines et sources sont des pivots.

La date d’observation est la date maximale `valid_from` du graphe
(2026-11-21T16:33:01Z) ; les relations closes à cette date sont écartées.
La profondeur maximale par défaut est de 4 sauts.

## Commande de mesure reproductible

```bash
pnpm measure:attack-propagation
# ou, avec l'URL explicite :
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-attack-propagation.mts \
  --max-hops=4
```

La commande échoue si une organisation hors Nouvelle-Aquitaine apparaît dans
le graphe. Elle n’écrit aucun fait en base et ne sélectionne aucun libellé,
titre ou texte libre.

## Chiffre obtenu

**Une attaque simulée sur `org:482872` atteint 5 organisations en 4 sauts**
(la cible initiale plus 4 organisations secondaires), en traversant 362
relations ; les types de liens utilisés sont `targeted_by`, `reported_by` et
`published_on`.

En répétant la simulation sur les 44 organisations du graphe :

| Indicateur | Valeur mesurée |
| --- | ---: |
| Organisations atteintes, moyenne | **12,045** |
| Médiane | 6 |
| Minimum | 1 |
| Maximum | 21 |
| organisations cibles | 44 |

La propagation dépend fortement du pivot gris : sans `reported_by`, la cible
de référence n’atteint aucune autre organisation. Le chiffre mesure donc une
exposition corrélée observable, et non une compromission avérée.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : 0 organisation hors région dans le
  graphe, contrôle intégré à la commande de mesure.
- **Sources grises autorisées** : utilisées comme pivots de corrélation,
  jamais comme victimes.
- **Aucune donnée personnelle de victime** : ni libellé, ni titre, ni texte
  libre n’est lu ou exporté ; un test échoue si un nom de victime apparaît
  dans le relevé.
- **Aucun service payant** : PostgreSQL local uniquement.
- **Code et interface en anglais**, rapport en français.
- **Diff de `server.ts` ≤ 10 lignes** : 0 ligne modifiée.
- **Aucune commande > 60 s** : mesure en 9,7 s avec `pnpm`, suite de 10 tests
  en 3,1 s, typecheck en 13,1 s.

## Vérification

`tsx test/run.ts test/attack-propagation.test.ts` sur une base éphémère :
10 tests réussis. `tsc --noEmit -p apps/api/tsconfig.json` : sans erreur.
`pnpm measure:attack-propagation` : relevé écrit dans
`bench/results/attack-propagation.json`.
