# Mesure de couverture

La seule question qui justifie le projet :

> Sur les incidents publics de Nouvelle-Aquitaine des douze derniers mois,
> quelle part le radar a-t-il vue ?

Mesure du **13 novembre 2026**, fenêtre `2025-11-01 → 2026-10-31`, corpus de
**23 incidents** publics vérifiés sur pièces — dont trois ajoutés ce jour
(SDIS des Landes, Institut Bergonié, ERNAT), chacun avec un extrait verbatim
de sa source et sa date de consultation.

## Le résultat, sans arrangement

```
Couverture : 7/18 (38,9 %)
  non admis              0
  non rattachés         11
    dont 10 organisations absentes du référentiel
    dont 1 présente mais non reconnue par le moteur
Référentiel entreprises : 0 ligne en agroalimentaire, industrie, BTP, commerce
```

Ce que le radar voit — sept organisations, dont deux gagnées ce jour : le
SDIS des Landes grâce à la correction des particules (« SDIS **des** Landes »
ne frappait pas l'alias « SDIS LANDES »), et l'Institut Bergonié par son nom
exact. La mesure ne bouge pas par hasard : chaque point gagné a une cause
écrite dans le code.

| Incident | Organisation trouvée |
| --- | --- |
| Mairie de Marennes-Hiers-Brouage | Commune de Marennes-Hiers-Brouage |
| Ville de Tarnos | Commune de Tarnos |
| Mairie d'Espelette | Commune de Espelette |
| EHPAD Résidence du Parc de Champdeniers | EHPAD RESIDENCE DU PARC |
| SDIS des Landes | SDIS LANDES |
| Institut Bergonié | INSTITUT BERGONIE |
| Ville de Gradignan — police municipale | Commune de Gradignan |

## Ce qu'il ne voit pas, et pourquoi

**Neuf organisations ne sont pas au référentiel.** Ce n'est pas un défaut du
moteur, c'est un trou de données :

| Incident | Pourquoi elle manque |
| --- | --- |
| Intermarché d'Altillac, magasins de Béarn | grande distribution, absente du bloc 2 |
| Vignobles Toutigeac, SICSOE | viticulture et logistique viticole, non collectées |
| Bordeaux Sciences Agro | école d'ingénieurs publique, hors annuaire scolaire |
| Fédération Nationale des Chasseurs, FFC | associations nationales |
| Delicity | start-up de livraison, hors périmètre numérique |
| Euskal Moneta | association de monnaie locale |

**Une organisation est présente mais non reconnue** : `YMED` est en base
(entreprise de numérique, Gironde), mais son nom tient en un seul mot. Le
gazetteer refuse de trancher sur un alias mono-jeton — règle posée parce qu'un
mot seul est un lieu ou une marque, pas une preuve. « Ymed » relève donc de la
revue, pas du rattachement automatique.

## Ce que la mesure change dans la feuille de route

Le goulot n'est **pas** le moteur de rattachement. Il est à 0 faux positif et
ne rate qu'un cas sur dix pour une raison assumée.

Le goulot est **le référentiel** : 13 332 entreprises, dont 13 035 en numérique,
et **zéro** en agroalimentaire, industrie, construction et commerce — les
secteurs les plus rançonnés de la région. Tant que ce trou existe, tout taux de
couverture est flatteur par construction : le radar ne peut pas manquer ce dont
il ignore l'existence.

## Méthode

- Chaque incident du corpus est transformé en événement normalisé et passé à la
  **porte d'admission du contrat** (`contract/admit.ts`), la même que
  l'ingestion.
- Le texte traverse le **gazetteer réel** sur les 34 330 organisations.
- Aucun refus n'est une case vide : tout est motivé (`pas_admis`,
  `pas_rattache`, `absent_du_referentiel`, `au_referentiel_mais_non_reconnu`).

**Limite assumée** : la mesure évalue la capacité à reconnaître un incident
publié, pas le délai réel de collecte. Une source publiée avec trois jours de
retard sur l'événement n'est pas pénalisée ici.

## Reproductible

```bash
pnpm tsx scripts/mesure-couverture.mts                        # affiche
pnpm tsx scripts/mesure-couverture.mts --json=out.json        # publie
```

Corpus : `bench/fixtures/corpus-reference-na.json` (versionné).
Résultat : `bench/results/couverture-2026-11-13.json` (publié).

---

## Le délai : un zéro qui n'en était pas un

La mesure publiait un « délai médian » calculé sur une simulation et multiplié
par zéro — `joursEntre(...) * 0`. Il valait **0 jour**, toujours, et s'affichait
comme une mesure. Le corpus est rejoué contre le moteur : il n'est pas ingéré,
donc il n'a pas de délai.

Le délai réel se mesure sur le flux collecté (`scripts/mesure-delai.mts`),
entre la date du fait (`observed_at`) et son écriture en base (`created_at`) :

| | |
| --- | --- |
| Événements datés | 19 050 |
| Dont bulletins de vulnérabilités (date = date du CVE) | 18 117 |
| **Délai médian de veille** | **1,9 jour** (sur 933 faits) |
| Premier quartile | 0,0 j |
| Troisième quartile | 10,1 j |
| Délais aberrants | 0 |

Les 18 117 bulletins sont exclus du calcul et publiés à part : un CVE de 2022
entré dans KEV en 2026 affiche un « délai » de 1 325 jours. Ce n'est pas notre
latence, c'est l'âge du CVE. Les confondre aurait donné une moyenne absurde.

**1,9 jour** est donc le premier chiffre honnête du quatrième nombre de la
phrase de clôture du programme.
