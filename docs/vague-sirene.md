# Vague 1 — le stock SIRENE national dans le référentiel

> 15 novembre 2026. L'objectif de la vague : rendre « toutes les entreprises »
> littéral. L'API `recherche-entreprises` paginée à 25/page ne pouvait jamais
> couvrir les 88 divisions NAF ; le stock national mensuel (data.gouv.fr,
> édition du 1ᵉʳ novembre 2026) les couvre en un passage.

## La méthode

Trois fichiers nationaux, trois passages en streaming sans extraction
(`scripts/import-sirene-stock-na.mts`) :

1. `StockEtablissement` (2,9 Go) — sièges **actifs** des 12 départements NA,
   diffusion `O`, 44,6 M lignes parcourues ;
2. `StockUniteLegale` (985 Mo) — dénomination, dénominations usuelles,
   catégorie juridique, tranche d'effectifs ;
3. `GéolocalisationEtablissement` (1,18 Go) — latitude/longitude WGS84
   (`y_latitude`/`x_longitude`, 99,9 % des sièges retenus).

Filtres assumés : sièges actifs seulement (les sièges fermés — 1 258 905
lignes d'historique depuis 1960 — multiplieraient le référentiel par cinq) ;
diffusion restreinte écartée (des personnes, pas des organisations) ;
catégorie juridique 7xxx écartée (collectivités déjà au référentiel par
l'annuaire administratif) ; associations (92xx) gardées avec leur kind.

## Les chiffres

| | Avant (14 nov.) | Après (15 nov.) |
|---|---|---|
| Organisations en base | 41 801 | **700 320** |
| Dont entreprises | 20 792 | **559 662** (+ associations : 119 649) |
| Sectorisées | 20 495 | **700 277 (99,9 %)** |
| Géolocalisées | ~0 | **688 209 (98 %)** |
| Avec tranche d'effectif | 1 940 | **126 892** |
| Lignes hors numérique (commerce/industrie/BTP/agro) | 5 788 | **103 673** |
| Aliases | 52 520 | **88 856** |

**Couverture du référentiel en salariés (le W % de la phrase de clôture)** :
**87,7 %** — 806 878 salariés (borne basse des tranches SIRENE) couverts sur
919 904 dans le stock régional actif, hors secteur public. Un minorant honnête :
les tranches comptent leur borne basse, et 501 964 personnes physiques
(artisans, auto-entrepreneurs — dénomination vide, nom porté par les champs
`nom/prenom`) restent hors vague 1.

## La régression de couverture, publiée tel quel

**La couverture du corpus baisse : 27/42 (64,3 %) → 24/42 (57,1 %).**

Le mécanisme, vérifié pas à pas : l'alias d'usage « hyper u » touchait une
organisation délibérément créée le 14 novembre (« une enseigne est un réseau de
sociétés locales, pas une personne morale »). Le stock y a ajouté les unités
légales des coopératives U — 49 candidats pour le même alias. Le gazetteer@2
**refuse l'ambiguïté** (doctrine : « on ne devine pas ») et trois incidents
enseigne (na-2026-033, 035, 036) retombent en non rattachés. Le test
d'existence du référentiel les classe « absents » : le nom d'usage
(« E.Leclerc de Surgères ») ne se retrouve intégralement dans aucun nom légal
(c'est la SCA d'exploitation qui existe, pas une entité « E.Leclerc Surgères »).

Et le vrai faux positif, lui aussi vérifié : na-2026-023 (ERNAT, Orthez)
ressort « vu » par le nouvel alias distinctif `pyrenees atlantiques` — d'une
**association colombophile des Pyrénées-Atlantiques** dont le nom contient le
département cité dans le résumé de l'incident. Le taux de 57,1 % contient donc
au moins un rattachement faux, et il est publié avec.

## Ce que la vague a coûté et débloqué

Coût : une régression de matching que le référentiel plus dense rend
inévitable et qui était prévisible — le stock a multiplié les candidats par 17,
les règles produit (deux jetons minimum, refus d'ambiguïté, toponyme nu refusé)
n'ont pas changé.

Débloqué, et ça ne revient pas en arrière : le secteur d'activité est déduit du
NAF pour 99,9 % des organisations (avant : 11 codes importés à la main), la
carte a ses coordonnées, les effectifs donnent enfin un W % publiable, et la
liste de courses du chantier 13 devient un problème d'*usage* (alias,
arbitrage) et non de *données* manquantes.

## Les deux chantiers moteur qui suivent

1. **gazetteer@3 — arbitrage enseigne** : quand un alias d'usage (source
   `annuaire-entreprises`, créé par un humain) coexiste avec des dizaines
   d'unités légales qui portent la même enseigne, l'alias d'usage doit gagner —
   ou l'arbitrage se faire sur la commune du texte. C'est ce qui rendra les
   trois incidents enseigne à nouveau vus, sans casser le refus d'ambiguïté
   pour le reste.
2. **Garde anti-toponyme** : un alias distinctif qui n'est que le nom d'un
   département (ici porté par une association colombophile) ne doit pas
   rattacher un texte qui cite ce département comme lieu. À traiter avec la
   même règle que le toponyme nu.
