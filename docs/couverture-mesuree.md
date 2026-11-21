# Couverture mesurée — 21 novembre 2026

Ce document retranscrit la sortie de `scripts/mesure-couverture.mts`, rejoué le
**2026-11-21** (`dateMesure`) sur la fenêtre **2025-11-01 → 2026-10-31**. Aucun
chiffre ci-dessous n'est estimé : ils sont tous tirés de la sortie console et du
JSON publiés par le script.

Corpus : **60 incidents**, dont **42 dans la fenêtre** et **18 hors fenêtre**.
La mesure a tourné avec **4 480 organisations en base** (`organisationsEnBase`).

## Résultat global

> **Couverture : 28 / 42 (66,7 %)**

Le dénominateur est le nombre d'incidents dans la fenêtre (42), pas la taille du
corpus (60). Les 18 incidents hors fenêtre sont conservés comme contexte et
exclus du taux.

Le script publie aussi une lecture plus exigeante du même résultat : sur les 28
incidents « vus », le rattachement est **exact 21 fois**, **partiel 5 fois** et
**hors sujet 2 fois**, soit **26 / 42 (61,9 %) de rattachements défendables**.
Les deux rattachements hors sujet comptent dans le taux brut de 66,7 %.

## Répartition des motifs

Sur les 42 incidents de la fenêtre :

| Motif | Incidents | Détail |
| --- | --- | --- |
| `vu` | 28 | 21 exacts, 5 partiels, 2 hors sujet |
| `pas_admis` | 0 | aucune refus à la porte d'admission du contrat |
| `pas_rattache` | 14 | 14 `absent_du_referentiel`, 0 `au_referentiel_mais_non_reconnu` |
| **Total** | **42** | |

Les 18 incidents restants du corpus ont le motif `hors_fenetre` ; ils ne
contribuent ni au numérateur ni au dénominateur du taux.

Le script signale par ailleurs **0 ligne** d'entreprise en agroalimentaire,
industrie, construction et commerce dans le référentiel utilisé.

## Incident par incident

« Vu » porte sur l'appartenance à la fenêtre **et** le rattachement par le
moteur. « Délai (j) » reproduit le champ `delaiJours` de la sortie JSON : il vaut
`null` pour les 60 incidents, noté `—` dans le tableau. « Motif d'absence »
reprend le motif calculé par le script et, pour `pas_rattache`, la cause
diagnostiquée. « Qualité » ne renseigne que les incidents vus.

| Incident | Entité | Publication | Vu | Délai (j) | Motif d'absence | Qualité |
| --- | --- | --- | --- | --- | --- | --- |
| na-2026-001 | Ymed (éditeur de la plateforme Sooncare) | 2026-04-09 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-002 | Mairie de Marennes-Hiers-Brouage | 2026-08-19 | oui | — | — | exacte |
| na-2026-003 | Ville de Tarnos | 2026-08-29 | oui | — | — | exacte |
| na-2026-004 | Mairie d'Espelette | 2026-09-16 | oui | — | — | exacte |
| na-2026-005 | EHPAD Résidence du Parc de Champdeniers | 2025-12-11 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-006 | Ville de Gradignan — police municipale | 2026-05-13 | oui | — | — | exacte |
| na-2026-007 | Mairie de Fumel | 2025-10-03 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-008 | Collège privé La Salle de Brive-la-Gaillarde | 2025-02-14 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-009 | Bordeaux Sciences Agro | 2026-09-15 | oui | — | — | exacte |
| na-2026-010 | Vignobles Toutigeac | 2026-07-16 | oui | — | — | exacte |
| na-2026-011 | SICSOE (Solution Vin Logistique) | 2026-07-23 | oui | — | — | exacte |
| na-2026-012 | Intermarché d'Altillac | 2026-10-13 | oui | — | — | exacte |
| na-2026-013 | Magasins de grande distribution touchés en Béarn et Soule (dont Intermarché Pau et Monein) | 2026-10-12 | oui | — | — | partielle |
| na-2026-014 | Coaxis | 2026-11-10 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-015 | Mairie de Sarran | 2025-06-20 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-016 | Fédération Nationale des Chasseurs / chasseurs charentais | 2026-01-22 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-017 | Ville de Poitiers et Grand Poitiers | 2025-09-05 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-018 | Fédération Française de Cyclisme — membres en Nouvelle-Aquitaine | 2025-12-10 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-019 | Delicity — service de livraison de repas disponible à Bordeaux, Pau et Limoges | 2026-09-07 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-020 | Euskal Moneta (association support de la monnaie locale Eusko) | 2026-08-28 | oui | — | — | exacte |
| na-2026-021 | SDIS des Landes | 2026-07-27 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-022 | Institut Bergonié | 2026-04-09 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-023 | ERNAT (Études Réalisations Négoce Assistance Technique) | 2026-08-07 | oui | — | — | exacte |
| na-2026-024 | Rectorat de l'académie de Poitiers | 2026-08-31 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-025 | UPPA Alumni — réseau des anciens de l'Université de Pau et des Pays de l'Adour | 2026-04-10 | oui | — | — | exacte |
| na-2026-026 | Réseau Alumni de l'Université de Bordeaux | 2026-04-10 | oui | — | — | hors_sujet |
| na-2026-027 | UNSS (Union nationale du sport scolaire) — exfiltration OPUSS | 2026-03-02 | oui | — | — | partielle |
| na-2026-028 | Ville de La Rochelle — fuite via le prestataire Synbird | 2025-11-24 | oui | — | — | exacte |
| na-2026-029 | Bordeaux Métropole — portail de la taxe de séjour | 2026-04-27 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-030 | Ministère de l'Intérieur — intrusion initiale depuis un service local de Charente-Maritime | 2025-12-12 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-031 | Vivaticket France (Chasseneuil-du-Poitou) | 2026-03-15 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-032 | Intermarché de Gradignan, Parempuyre, Macau et La Teste-de-Buch | 2026-10-13 | oui | — | — | exacte |
| na-2026-033 | Supermarchés des Deux-Sèvres (Hyper U Parthenay, Intermarché Saint-Varent et Saint-Maixent-l'École, Super U Champdeniers, Celles-sur-Belle, Leclerc Thouars-Sainte-Verge) | 2026-10-12 | oui | — | — | partielle |
| na-2026-034 | Cinq Intermarché de Dordogne (Hautefort, Tocane-Saint-Apre, Port-Sainte-Foy-et-Ponchapt, Trélissac, Saint-Médard-de-Mussidan) | 2026-10-12 | oui | — | — | partielle |
| na-2026-035 | E.Leclerc de Surgères | 2026-10-12 | oui | — | — | exacte |
| na-2026-036 | Magasins de la Vienne (Intermarché Chauvigny et Gençay, Super U Vouillé, Leclerc Poitiers, Auchan Saint-Genest-d'Ambière) | 2026-10-12 | oui | — | — | partielle |
| na-2026-037 | Super U de Morcenx-la-Nouvelle et Carrefour Express de Rion-des-Landes | 2026-10-12 | oui | — | — | exacte |
| na-2026-038 | Intermarché et Carrefour Market de Marmande | 2026-10-12 | oui | — | — | exacte |
| na-2026-039 | Cerballiance — réseau de laboratoires de biologie médicale | 2026-03-28 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-040 | Cegedim Santé — logiciel MonLogicielMedical (MLM) | 2026-02-26 | non | — | `pas_rattache` · `absent_du_referentiel` | — |
| na-2026-041 | Polyclinique Bordeaux Nord Aquitaine | 2026-04-09 | oui | — | — | exacte |
| na-2026-042 | Ville de Limoges — centre de vaccination municipal et campagne HPV | 2026-06-26 | oui | — | — | exacte |
| na-2026-043 | Weda — logiciel médical (cabinets touchés jusqu'en Charente) | 2025-11-13 | oui | — | — | exacte |
| na-2026-044 | FFRandonnée — fichier adhérents | 2026-02-05 | oui | — | — | hors_sujet |
| na-2026-045 | Association des maires de France (AMF) | 2026-09-04 | oui | — | — | exacte |
| na-2026-046 | Office français de la biodiversité — fichier des permis de chasser | 2026-02-22 | oui | — | — | exacte |
| na-2026-047 | Université de Pau et des Pays de l'Adour (UPPA) — revendication Nova | 2025-09-29 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-048 | Ville de Bergerac — QR codes des horodateurs (quishing) | 2025-08-11 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-049 | Mairie de Berson | 2025-02-28 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-050 | Fédération française de tir (FFTir) — retombées en Haute-Vienne | 2025-10-23 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-051 | Arsoé de Soual — plateforme Synel d'identification des bovins et ovins | 2024-12-31 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-052 | Camping municipal d'Évaux-les-Bains | 2025-07-11 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-053 | GoCap (Mostiglass) — Hinx | 2025-02-20 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-054 | Artiga — atelier de linge basque à Magescq | 2025-10-06 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-055 | Université de Limoges — vol de données personnelles par un agent | 2025-06-27 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-056 | Aéroport Pau-Pyrénées et écoles Eklore (CCI Pau Béarn) | 2024-05-15 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-057 | Sites internet des villes de Bordeaux et Pau et du département des Landes (DDoS) | 2025-01-02 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-058 | SPSTI 16 — service de prévention et de santé au travail interentreprises de la Charente | 2024-06-14 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-059 | Centre hospitalier de Girac (Angoulême) | 2025-09-09 | non | — | `hors_fenetre` (hors dénominateur) | — |
| na-2026-060 | Cdiscount — extraction frauduleuse de données clients (Cestas) | 2025-12-09 | non | — | `pas_rattache` · `absent_du_referentiel` | — |


## Ce que ce chiffre ne dit pas

- **Il ne dit rien du délai.** Le champ `delaiJours` est `null` pour les 60
  incidents : le corpus est rejoué contre le moteur, il n'est pas ingéré. Un
  « délai médian de 0 jour » calculé sur cette simulation serait un chiffre faux.
  Le délai réel de collecte se mesure sur le flux collecté, pas ici.
- **Il ne mesure pas l'exhaustivité des incidents.** Le corpus ne contient que
  des incidents rendus publics et vérifiés sur pièce. Les incidents non
  médiatisés, les tentatives bloquées sans communication et les articles
  payants non lisibles échappent au dénominateur par construction.
- **Il ne mesure pas la qualité de la source.** La porte d'admission est
  rejouée telle quelle ; `pas_admis` vaut 0 ici, ce qui signifie que la nature
  des incidents du corpus ne déclenche aucun refus, pas que toute source réelle
  serait admise.
- **66,7 % n'est pas 61,9 %.** Deux rattachements « vus » sont classés hors
  sujet par le script : le taux brut les compte, le taux défendable les exclut.
  Le premier est une capacité de reconnaissance, le second une capacité à
  désigner la bonne organisation.
- **14 absences sont des absences de référentiel, pas des refus du moteur.**
  Le diagnostic `absent_du_referentiel` vaut pour les 14 incidents non rattachés
  de la fenêtre ; aucun n'est classé `au_referentiel_mais_non_reconnu` dans
  cette mesure. Le travail porterait donc sur les données, pas sur la règle de
  désignation.
- **Il est lié à l'état de la base au moment du re-jeu.** La sortie annonce
  4 480 organisations en base et 0 ligne dans les secteurs agroalimentaire,
  industrie, construction et commerce. Le libellé `34 330 organisations
  réelles` figurant dans le champ `method.moteur` du script est une chaîne
  codée en dur, pas un comptage : c'est le comptage de la sortie qui fait foi,
  et un autre état de base donnerait un autre taux.

## Reproductible

```bash
DATABASE_URL=… apps/api/node_modules/.bin/tsx scripts/mesure-couverture.mts
DATABASE_URL=… apps/api/node_modules/.bin/tsx scripts/mesure-couverture.mts --json=out.json
```

Corpus : `bench/fixtures/corpus-reference-na.json` (versionné). Sortie console
et JSON de cette mesure : `scripts/mesure-couverture.mts`, champs `dateMesure`,
`corpus`, `couverture` et `incidents`.

## API

`GET /api/couverture` sert cette mesure sans recalcul : `dateCalcul` reprend
`dateMesure`, `hashCorpus` est le SHA-256 hexadécimal du fichier de corpus
versionné, et `fenetre` borne la période. Les quatre sections sont `global`
(`vus` / `total` / `taux`), `parMotif` (effectifs et parts), `parDepartement` et
`parSecteur` (vus / total / taux). Les 18 incidents `hors_fenetre` n'entrent
ni dans le taux ni dans les décompositions.
