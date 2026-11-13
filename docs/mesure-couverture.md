# Mesure de couverture

La seule question qui justifie le projet :

> Sur les incidents publics de Nouvelle-Aquitaine des douze derniers mois,
> quelle part le radar a-t-il vue ?

Mesure du **14 novembre 2026**, fenêtre `2025-11-01 → 2026-10-31`, corpus de
**60 incidents** publics vérifiés sur pièces — dont **37 ajoutés ce jour**
(élargissement des 13 et 14 novembre), chacun avec un extrait verbatim de sa
source et sa date de consultation. Dix-huit entrées portent sur des incidents
antérieurs à la fenêtre : conservées comme contexte, exclues du dénominateur.

## Le résultat, sans arrangement

```
Couverture : 27/42 (64,3 %)
  non admis              0
  non rattachés         15
    dont 9 organisations absentes du référentiel
    dont 6 présentes mais non reconnues par le moteur
Référentiel entreprises : 2 516 lignes commerce, 1 126 BTP, 951 industrie, 231 agro

Rappel par secteur (33 incidents sectorisés)
  collectivite   5/6   (83 %)  · réserve : n = 6
  enseignement   3/4   (75 %)  · réserve : n = 4
  sante          4/7   (57 %)  · réserve : n = 7
  entreprise     8/16  (50 %)  · réserve : n = 16
  autre          0/9   · pas de taux (aucun rattachement par secteur d'activité)
```

Deux corrections ont fait passer la couverture de 15/42 à 27/42, sans toucher
au moteur :

1. **Import SIRENE hors numérique** (7 codes NAF : supermarchés, hypermarchés,
   supérettes, gros fruits et légumes, transformation de viande, usinage,
   construction de maisons). 7 436 entreprises ajoutées, réparties sur les
   12 départements. Le référentiel passe de 0 à 4 824 lignes hors numérique.
2. **Complément d'usage** (13 entités, 37 alias) pour ce que SIRENE ne peut pas
   donner : une enseigne est un réseau de sociétés locales, pas une personne
   morale. « Intermarché de Marmande » désigne l'enseigne, pas la SARL qui
   l'exploite.

Le rappel entreprise double (13 % → 50 %) et les trois autres secteurs
progressent. Ce qui reste non rattaché n'est plus un trou de référentiel mais
un refus assumé du moteur : six organisations sont en base et ne sont pas
reconnues, dont les cas mono-jeton (« Intermarché » seul, « Ymed ») que la
règle des deux jetons écarte par construction.

| Incident | Organisation trouvée |
| --- | --- |
| Mairie de Marennes-Hiers-Brouage | Commune de Marennes-Hiers-Brouage |
| Ville de Tarnos | Commune de Tarnos |
| Mairie d'Espelette | Commune de Espelette |
| EHPAD Résidence du Parc de Champdeniers | EHPAD RESIDENCE DU PARC |
| Ville de Gradignan — police municipale | Commune de Gradignan |
| Bordeaux Sciences Agro | Bordeaux Sciences Agro |
| Vignobles Toutigeac | Vignobles Toutigeac |
| SICSOE (Solution Vin Logistique) | SICSOE Solution Vin Logistique |
| Fédération Nationale des Chasseurs / chasseurs charentais | Fédération Nationale des Chasseurs |
| Euskal Moneta | Euskal Moneta |
| SDIS des Landes | SDIS Landes |
| Institut Bergonié | Institut Bergonié |
| Rectorat de l'académie de Poitiers | Rectorat de l'académie de Poitiers |
| Ville de La Rochelle — fuite via Synbird | Ville de La Rochelle |
| Ville de Limoges — centre de vaccination | Ville de Limoges |

## Ce qu'il ne voit pas, et pourquoi

**Vingt-trois organisations ne sont pas au référentiel.** Ce n'est pas un défaut
du moteur, c'est un trou de données. Les nouveaux cas ajoutés le 14 novembre
dessinent trois familles :

| Famille | Exemples |
| --- | --- |
| Grande distribution et commerce | Intermarché (Gironde, Dordogne, Deux-Sèvres, Lot-et-Garonne), E.Leclerc Surgères, Super U Morcenx |
| Éditeurs et prestataires numériques | Vivaticket, Weda, Cegedim Santé, Cerballiance, Synbird |
| Établissements et réseaux | UPPA Alumni, réseau Alumni de Bordeaux, Polyclinique Bordeaux Nord, UNSS, AMF, FFRandonnée |

**Quatre organisations sont présentes mais non reconnues**, dont le cas
structurel déjà documenté : `YMED` est en base mais son nom tient en un seul
mot, et le gazetteer refuse de trancher sur un alias mono-jeton. Les trois
autres (Bordeaux Métropole sur la taxe de séjour, ERNAT) relèvent de la même
famille de refus assumé : trop peu de signal dans le libellé pour une décision
automatique.

**Un faux positif a été retiré de la mesure ce jour** : le résumé de l'incident
OFB citait la Fédération nationale des chasseurs, que le moteur a rattachée à sa
place. Le résumé a été reformulé et le taux recalcule sans ce point (16/42
avant correction, 15/42 après). C'est exactement le genre d'erreur que la
mesure doit exposer, pas absorber.

## Ce que la mesure change dans la feuille de route

Le goulot n'était **pas** le moteur de rattachement : sur les collectivités, il
reconnaît 5 cas sur 6, et ses refus sont motivés.

Le goulot était **le référentiel** : 13 332 entreprises, dont 13 035 en
numérique, et **zéro** en agroalimentaire, industrie, construction et commerce.
Le trou est désormais comblé côté données — 7 436 entreprises importées, 4 824
lignes hors numérique — et la couverture passe de 35,7 % à 64,3 %.

Ce que la mesure dit maintenant est différent, et plus utile : **15 incidents
restent non rattachés, dont 6 dont l'organisation est pourtant en base**. Ce
n'est plus un problème d'annuaire mais de désignation. Deux familles :

| Cas | Exemple | Décision |
| --- | --- | --- |
| Alias mono-jeton | « Intermarché » seul, « Ymed » | refus assumé : un mot n'est pas une preuve |
| Entité mal nommée dans le référentiel | « SA ROCOFRID » pour un Intermarché | alias d'enseigne à porter (fait pour 37 alias) |

Le prochain gain ne viendra donc pas d'un import massif mais du traitement des
noms d'usage : c'est un travail de quelques dizaines d'alias, pas de dizaines
de milliers de lignes.

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
