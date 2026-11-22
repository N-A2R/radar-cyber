# Rapport — résumé automatique d'incident (Nouvelle-Aquitaine)

> Document généré par `pnpm mesure:resume`. Ne pas éditer à la main :
> modifier une entrée puis relancer le script, sinon le contrôle `--verifier` échouera.
> Empreinte des entrées : `11781aa6a4ac4101`. Aucune donnée synthétique.

## La question

Quelle est la qualité mesurée du résumé automatique sur 50 incidents de
Nouvelle-Aquitaine vérifiés, notés un par un par une grille indépendante ?

## La réponse

**72,92 / 100 de qualité moyenne sur 50 résumés notés**,
pour un objectif d'au moins 70 / 100 de note moyenne.

**37 / 50 résumés ont franchi le seuil de 70 / 100**
(médiane 73,00, minimum 64, maximum 91) :
ce décompte est publié à titre diagnostique, l'objectif chiffré portant sur la moyenne.
Objectif : **atteint**.

## État réel de départ

La base vivante contient 1 673 151 organisations,
312 sources déclarées et 26 259 événements.
Le corpus figé contient 50 incidents vérifiés, un par département ou plus,
avec un texte source et un résumé de référence relus un à un. La mesure est
en lecture seule : aucune ligne de la base ni du corpus n'a été modifiée.

## Ce qui a été construit, étape par étape

1. **Générateur pur** — `apps/api/src/analyse/incident-summary.ts` : filtre
   territorial des douze départements, provenance grise étiquetée, choix
   déterministe de phrases du titre et de l'extrait vérifiés — le résumé de
   référence est tenu hors du générateur —, anonymisation des identifiants
   de personnes (e-mail, téléphone, nom de personne, fonction), budget de 25 à 80 mots.
2. **Grille indépendante** — `apps/api/src/analyse/incident-summary-quality.ts` :
   le correcteur n'appelle jamais le générateur. Il note la couverture des faits
   de référence (40), l'ancrage des nombres dans la source (25), l'absence de
   données personnelles (20), la présence du département et de l'organisation
   (10) et la longueur (5). Un résumé est admis à partir de 70 / 100.
3. **Mesure reproductible** — ce script : 50 incidents, 50 résumés générés,
   50 notes, détail versionné dans `bench/results/incident-summary-quality.json`.
4. **Tests** — 20 tests dans `apps/api/test/incident-summary.test.ts`, un
   comportement par test : périmètre, sources grises, en-tête, date, fidélité,
   anonymisation, budget, chaque critère de notation, déterminisme.

## Résultats de la grille

| Critère | Maximum | Moyenne |
|---|---:|---:|
| coverage | 40 | 12,98 |
| faithfulness | 25 | 25,00 |
| privacy | 20 | 20,00 |
| scope | 10 | 10,00 |
| concision | 5 | 4,94 |
| **Total** | **100** | **72,92** |

1 résumés reposent sur une source grise
et 1 identifiants personnels ont été retirés
avant publication. Les dix notes les plus basses sont détaillées ci-dessous
(identifiant de l'incident uniquement, aucun nom de victime) :

| Incident | Note | Motifs |
|---|---:|---|
| na-couv-017 | 64 | low-coverage |
| na-couv-034 | 64 | low-coverage |
| na-couv-004 | 65 | low-coverage |
| na-couv-031 | 65 | low-coverage |
| na-couv-006 | 66 | low-coverage |
| na-couv-049 | 66 | low-coverage |
| na-couv-020 | 67 | low-coverage |
| na-couv-011 | 68 | low-coverage |
| na-couv-039 | 68 | low-coverage |
| na-couv-042 | 68 | low-coverage |

## Reproduction

```sh
pnpm mesure:resume
pnpm mesure:resume --verifier
```

La seconde commande rejoue le calcul sans écrire et échoue si le rapport ne
correspond plus à ses entrées. Le diff de `apps/api/src/server.ts` est de 0 ligne.

## Limites

- La grille mesure une compression fidèle et sûre, pas l'élégance littéraire :
  elle est déterministe et rejouable, donc elle ne remplace pas une relecture humaine.
- Le générateur ne voit que le titre et l'extrait : la couverture mesure ce
  que ces seuls éléments permettent de restituer du résumé vérifié.
- Les sources grises sont acceptées comme indices datés, jamais comme preuve
  d'une responsabilité ou d'une identité personnelle.
- La mesure porte sur les 50 incidents du corpus figé, pas sur toute la base vivante.
