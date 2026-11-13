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
Couverture : 15/42 (35,7 %)
  non admis              0
  non rattachés         27
    dont 23 organisations absentes du référentiel
    dont 4 présentes mais non reconnues par le moteur
Référentiel entreprises : 0 ligne en agroalimentaire, industrie, BTP, commerce

Rappel par secteur (33 incidents sectorisés)
  collectivite   5/6   (83 %)  · réserve : n = 6
  enseignement   2/4   (50 %)  · réserve : n = 4
  sante          3/7   (43 %)  · réserve : n = 7
  entreprise     2/16  (13 %)  · réserve : n = 16
  autre          0/9   · pas de taux (aucun rattachement par secteur d'activité)
```

Le corpus élargi ne fait pas bouger le taux global — il le rend lisible. La
collectivité reste reconnue presque systématiquement ; l'entreprise s'effondre à
13 %, et ce n'est pas une surprise : sur les 16 faits « entreprise » de la
fenêtre, 14 sont des enseignes ou des PME absentes du référentiel (grande
distribution, billetterie, éditeurs de logiciels métiers, laboratoires).

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

Le goulot n'est **pas** le moteur de rattachement : sur les collectivités, il
reconnaît 5 cas sur 6, et ses refus sont motivés.

Le goulot est **le référentiel** : 13 332 entreprises, dont 13 035 en numérique,
et **zéro** en agroalimentaire, industrie, construction et commerce — les
secteurs les plus rançonnés de la région. Tant que ce trou existe, tout taux de
couverture est flatteur par construction : le radar ne peut pas manquer ce dont
il ignore l'existence. Le taux de 13 % en entreprise n'est pas une contre-
performance du moteur, c'est le prix du trou.

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
