# Rapport — modèle de contagion régionale

Mesure du 22 novembre 2026. Nouvelle-Aquitaine uniquement (13 départements).
Commande de reproduction :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-contagion.mts
```

## Question et réponse

Pour les **20 organisations tombées** avant le 2026-10-08, la liste des organisations
exposées dans les 30 jours suivants (jusqu'au 2026-11-07) contient
**4 organisations**. La précision de cette liste est de
**0,875** : 20 attributions exactes,
2 partielles et 2 sans rapport, sur 24 éléments évalués.
Cible fixée à 0,80 : **atteinte**.

État réel utilisé : 1673220 organisations, 74 revendications
rattachées à une organisation (toutes régions confondues pour le second chiffre).

## Définitions figées

- **Chute** : revendication grise datée (`leak_claim`), rattachée à une organisation
  dont le département est l'un des 13 départements de Nouvelle-Aquitaine.
- **Graines** : les 20 dernières chutes strictement avant la date de coupure.

- **Exposition** : première chute dans la fenêtre `]asOf, asOf + 30 j]`, hors graines
  et hors organisations déjà tombées avant la coupure.
- **Précision** : `(exact + partiel / 2) / total`. Une attribution est *exacte* quand
  le libellé de la revendication et le nom de l'organisation coïncident après
  normalisation ; *partielle* en cas de recouvrement de mots ; *sans rapport* sinon.
  Un libellé sans rapport reste dans le dénominateur : c'est un faux positif de la liste.
- **Score de contagion** : similarité avec les graines validées (parent, domaine,
  secteur, code NAF, groupe sectoriel, ville, département), atténuée par l'âge de la graine.

## Organisations exposées dans les 30 jours

| Organisation | Département | Secteur | Date | Score | Motifs | Attribution |
|---|---:|---|---|---:|---|---|
| GREAT LAKES | 33 | activites-specialisees | 2026-10-13 | 1,000 | shared-department, shared-naf, shared-sector, shared-sector-group | exact |
| SKIN CENTER | 17 | services-personnels | 2026-10-16 | 1,000 | shared-department, shared-sector-group | exact |
| AXE EXPERTS | 87 | activites-specialisees | 2026-11-07 | 1,000 | shared-sector, shared-sector-group | exact |
| MECA PRECIS | 16 | industrie | 2026-10-22 | 0,000 | — | exact |

Couverture du modèle : 3/4
expositions partagent un groupe sectoriel avec au moins une graine validée.

## Organisation des graines (20 dernières chutes)

| # | Organisation | Département | Date | Attribution |
|---:|---|---:|---|---|
| 1 | TDS CONSTRUCTION | 33 | 2026-03-12 | exact |
| 2 | GD FRANCE | 33 | 2026-03-20 | exact |
| 3 | LUCKY LOOK | 79 | 2026-03-30 | exact |
| 4 | DISTRITECH | 17 | 2026-04-06 | exact |
| 5 | YMED | 33 | 2026-04-08 | exact |
| 6 | IT MANAGEMENT | 24 | 2026-04-27 | exact |
| 7 | BCI | 33 | 2026-05-03 | unrelated |
| 8 | MEDIA CONSULTING | 17 | 2026-05-05 | exact |
| 9 | IMEX INTERNATIONAL | 33 | 2026-05-08 | exact |
| 10 | SELECT WINES | 24 | 2026-06-18 | exact |
| 11 | COFAQ GEDIMAT BRICOPRO (L'ISLE-JOURDAIN) | 86 | 2026-06-20 | exact |
| 12 | EARL Vignobles Toutigeac | 33 | 2026-07-16 | partial |
| 13 | TOUTIGEAC | 33 | 2026-07-16 | exact |
| 14 | P.A CONSTRUCTION | 79 | 2026-07-22 | exact |
| 15 | VESTA CONSEIL | 64 | 2026-07-28 | unrelated |
| 16 | DANY CATTIER (TELECOMMUNICATIONS) | 64 | 2026-07-31 | partial |
| 17 | Études Réalisations Négoce Assistance Technique (ERNAT) | 64 | 2026-08-07 | exact |
| 18 | JOHNSON  & JOHNSON | 17 | 2026-08-12 | exact |
| 19 | ZANICHELLI | 17 | 2026-08-16 | exact |
| 20 | BE MEDIA | 33 | 2026-08-20 | exact |

## Sources grises écartées et limites

Les revendications ransomware rattachées à un événement, dans toute la base
(25 rattachements en Nouvelle-Aquitaine), ont une précision d'attribution de
0,020 (2,0 %).
Elles ne sont donc pas intégrées à la liste : ce sont majoritairement des
rattachements erronés à des organisations du référentiel. Aucun texte de
revendication, aucune donnée personnelle de victime et aucune URL de preuve
n'est publié ici : seuls les champs organisationnels non personnels le sont.

Le score classe les expositions observées ; il ne prétend pas prédire quelles
organisations seront frappées. Avec 20 graines et quelques expositions par
fenêtre, la mesure reste indicative et doit être rejouée sur une base à jour.
