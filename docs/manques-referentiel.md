# Le trou du référentiel, en liste de courses

> Chantier 13. `tsx scripts/manques-referentiel.mts --json=bench/results/manques-referentiel-2026-11-13.json`
> régénère la liste. Le chargement des entreprises reste bloqué côté externe
> (pas d'accès à l'API recherche-entreprises depuis ce poste) ; ce qui change
> ici, c'est qu'on sait **quoi** charger.

## Ce que la mesure de couverture avait laissé

`docs/mesure-couverture.md` a établi que le goulot n'est pas le moteur de
rattachement mais le référentiel : sur 15 incidents réels de la fenêtre, 9
organisations sont absentes d'un référentiel de 34 330 lignes. On connaissait
même leurs noms — Intermarché, Toutigeac, SICSOE, Euskal Moneta, la FNC, la FFC.

Manquait la liste : combien d'entités, lesquelles, par quelle source, et par
quelle voie les charger. La revue de quarantaine savait déjà dire « organisation
française probable absente du référentiel » — mais cette phrase restait dans une
ligne de file.

## Ce que la liste contient, sur la base de développement

```
411 entités nommées, absentes du référentiel
   8  en France      — vrais manques, mesurables
 294  sans indice   — ni manque prouvé, ni hors-sujet prouvé
 109  hors zone     — pays déclaré par la source, pas des manques
```

**La ligne du milieu est la plus importante.** 294 entités ne sont pas
classables : la source ne déclare pas de pays, le nom ne porte aucun indice
français, aucune ville de la région n'est citée. Les compter comme des trous de
couverture serait une faute de mesure ; les écarter serait une faute inverse. On
les publie comme ce qu'elles sont : inconnues.

Les 109 hors zone ne sont pas un manque du référentiel — une entreprise
américaine revendiquée par un groupe international n'a pas à y figurer. Elles
restent dans le fichier JSON, marquées, pour être auditées si besoin.

## Deux heuristiques mesurées, une seule retenue

Deviner la zone d'une entité sans pays déclaré est tentant et **se trompe
beaucoup**. Mesuré sur les 500 indices de la base :

| Heuristique | Entités classées « France » | Dont à l'étranger |
|---|---|---|
| large (`clinique`, `collège`, `université`, `commune`…) | 22 | ≥ 10 — un collège tanzanien, une commune belge, trois colleges américains |
| ville du référentiel citée | 5 | 4 — « Gan » (mot de 3 lettres) attrape tout |
| **`.fr` seul** | **3** | **0** |

D'où la règle retenue : un pays déclaré tranche ; sinon `.fr` ; sinon une ville
du référentiel **de plus de cinq lettres**. Tout le reste est « inconnu ». Une
liste de courses qui contient de fausses lignes est pire qu'une liste courte.

La même prudence s'applique au champ pays des titres structurés
(`domaine\montant\pays\volume`) : la première version lisait le **domaine**
comme un pays et classait les entités françaises hors zone — diagnostic
inversé, silencieux.

## Déduplication

Les revendications reviennent : la même entreprise est publiée une fois avec
« <1% DISCLOSED » et une fois avec « 100% DISCLOSED ». La clé de regroupement
porte donc sur l'entité (domaine ou nom), pas sur le titre — sans quoi la liste
doublerait et la corroboration deviendrait fausse. Le `nomLisible` fait de même :
on cherche à charger « adveo.com », pas
« adveo.com$740.7MFrance1.1TB<1% DISCLOSED ».

## Voie de chargement

Sept entités relèvent de Sirene (sociétés), deux de l'annuaire administratif
(collectivités), le reste de la main : associations, fédérations sportives,
monnaies locales. C'est une aide au tri, pas une décision — elle ne fait que
classer une liste à relire.

## Ce que ce chantier ne fait pas

Il **ne charge rien**. La voie Sirene suppose un accès réseau à
`recherche-entreprises.api.gouv.fr`, fermé depuis ce poste ; la voie manuelle
suppose une saisie humaine. Le trou reste donc ouvert, et il est publié : c'est
exactement ce que le cadrage demandait — assumer le trou plutôt que le masquer.

Ce que le chantier change, c'est qu'une question vague (« le référentiel est
incomplet ») devient une liste finie, triée, avec sa provenance et sa zone.
