# Couverture par la presse régionale — 21 novembre 2026

## Question

Sur les incidents publics de Nouvelle-Aquitaine de nos corpus, combien ont été
**révélés par la presse régionale**, plutôt que par une source nationale, un
flux spécialisé/technique ou un communiqué officiel ? Et avec quel délai entre
l'incident et la publication qui l'a fait connaître ?

Deux corpus coexistent dans le dépôt ; ils sont mesurés tous les deux, parce que
le verdict est le même et que leurs biais sont différents :

| Corpus | Rôle | Incidents |
| --- | --- | ---: |
| `bench/couverture/incidents.jsonl` | corpus de vérification du bench de couverture, dates revérifiées le 21/11 | 20 |
| `bench/fixtures/corpus-reference-na.json` | corpus de référence du produit, rejoué par `scripts/mesure-couverture.mts` | 60 |

## Méthode et définitions

- **Source révélatrice** : le champ `source` du corpus des 20 (`preuve.editeur`
  pour les 60), c'est-à-dire la page retenue après déduplication. Ce n'est pas
  forcément la première à avoir écrit : c'est la source la plus solide
  consultable pour chaque événement (cf. `bench/couverture/README.md`).
- **Catégories** : *presse régionale* (Sud Ouest, France 3 NA, Charente Libre,
  La Dépêche, actu.fr, Ouest-France, ICI Poitou, La Nouvelle République, La
  République des Pyrénées, Le Démocrate de Bergerac, Bouger à Bordeaux,
  Nice-Matin) ; *presse nationale* (franceinfo, RTL, Le Figaro) ; *spécialisée /
  technique* (FrenchBreaches, Cyber Breaches, Cyberattaque.org, Clubic, ZATAZ) ;
  *officiel* (communiqués de victimes, fédérations et collectivités).
- **Délai** : jours calendaires entre `date_incident` et `date_publication`
  (`dateIncident` → `datePublique` pour les 60). `—` signifie que la source ne
  date pas l'incident : aucun délai n'est fabriqué. C'est le **délai de
  publication de la source**, pas la latence de notre collecte : le champ
  `delaiJours` de la mesure de couverture est `null` pour les 60 incidents
  (`docs/couverture-mesuree.md`), le corpus étant rejoué contre le moteur et non
  ingéré.

## Les 20 incidents du corpus de vérification

| ID | Organisation | Source révélatrice | Catégorie | Incident | Publication | Délai (j) |
| --- | --- | --- | --- | --- | --- | ---: |
| na-couv-001 | Ville de Floirac | France 3 Nouvelle-Aquitaine | Presse régionale | 2024-04-18 | 2024-04-19 | 1 |
| na-couv-002 | CCI Béarn et Soule : aéroport Pau-Pyrénées, école de comm… | Sud Ouest | Presse régionale | 2024-05-13 | 2024-05-15 | 2 |
| na-couv-003 | SPSTI 16 — service de prévention et de santé au travail i… | Charente Libre | Presse régionale | 2024-05-10 | 2024-06-14 | 35 |
| na-couv-004 | Théâtre de la Coursive (billetterie Sirius), La Rochelle | ICI / Radio France | Presse régionale | 2024-07-01 | 2024-07-01 | 0 |
| na-couv-005 | Safed — Service d'accompagnement des familles en difficul… | Sud Ouest | Presse régionale | 2024-11-18 | 2024-11-27 | 9 |
| na-couv-006 | Collège privé La Salle de Brive-la-Gaillarde | La Dépêche | Presse régionale | — | 2025-02-14 | — |
| na-couv-007 | Mairie de Berson | actu.fr | Presse régionale | 2025-02-21 | 2025-03-01 | 8 |
| na-couv-008 | Mairie d'Évaux-les-Bains — camping municipal | France 3 Nouvelle-Aquitaine | Presse régionale | — | 2025-07-11 | — |
| na-couv-009 | Ville de Poitiers et communauté urbaine de Grand Poitiers | Ouest-France | Presse régionale | 2025-08-29 | 2025-09-05 | 7 |
| na-couv-010 | Ville de Fumel | France 3 Nouvelle-Aquitaine | Presse régionale | 2025-10-03 | 2025-10-03 | 0 |
| na-couv-011 | Ville de La Rochelle — prestataire Synbird | Sud Ouest | Presse régionale | — | 2025-11-27 | — |
| na-couv-012 | EHPAD Résidence du Parc de Champdeniers | ICI Poitou | Presse régionale | 2025-12-08 | 2025-12-11 | 3 |
| na-couv-013 | Fédération Nationale des Chasseurs — espace adhérents (do… | Fédération Nationale des Chasseurs (communiqué officiel) | Officiel | 2026-01-20 | 2026-01-22 | 2 |
| na-couv-014 | UNSS — outil de gestion OPUSS (intrusion via le rectorat… | UNSS (communiqué officiel) | Officiel | — | 2026-03-02 | — |
| na-couv-015 | Vivaticket France (Chasseneuil-du-Poitou) | La Nouvelle République | Presse régionale | 2026-03-02 | 2026-03-15 | 13 |
| na-couv-016 | Ymed SAS — éditeur de la plateforme SoonCare (Gironde) | Sud Ouest | Presse régionale | 2026-04-06 | 2026-04-09 | 3 |
| na-couv-017 | Ville de Gradignan — police municipale | Sud Ouest | Presse régionale | 2026-05-10 | 2026-05-13 | 3 |
| na-couv-018 | Ville de Limoges — centre de vaccination municipal et cam… | Ville de Limoges (communiqué officiel) | Officiel | — | 2026-06-29 | — |
| na-couv-019 | Ville de Tarnos | Ville de Tarnos (communiqué officiel) | Officiel | 2026-08-28 | 2026-08-28 | 0 |
| na-couv-020 | Bordeaux Sciences Agro | Bordeaux Sciences Agro (communiqué officiel) | Officiel | 2026-09-08 | 2026-09-15 | 7 |

**Part régionale : 15/20 (75 %).** Les 5 autres lignes sont des communiqués
officiels — deux de fédérations nationales (FNC, UNSS) et trois de collectivités
ou d'établissements locaux. **Aucune ligne retenue n'est révélée par un média
national ou un flux technique** : le seul incident de presse nationale du
fichier d'origine (Cerballiance, franceinfo, 2026-03-28) a été remplacé le
21 novembre par Ymed/Sud Ouest (commit `1449cec`). Le README du corpus cite
encore franceinfo/AFP parmi les « sources mobilisées » : c'est une trace de cet
état antérieur, pas une source du fichier actuel.

**Délais** : 15 incidents datés des deux côtés, **médiane 3 jours**, moyenne
6,2 jours. Presse régionale : médiane 3 j sur 12 datés ; officiel : médiane 2 j
sur 3 datés. Cinq lignes n'ont pas de date d'incident dans la source. Deux
publications locales sortent du lot : SPSTI 16 (35 j) et Vivaticket (13 j) —
dans les deux cas la victime a communiqué tardivement.

*Sensibilité de la classification* : ICI / Radio France est rangé ici comme le
réseau local de Radio France (comme ICI Poitou). Si on le traite comme un média
national, la part régionale passe à 14/20 (70 %) — la conclusion ne change pas.

## Les 60 incidents du corpus de référence

| ID | Entité | Source révélatrice | Catégorie | Incident | Publication | Délai (j) |
| --- | --- | --- | --- | --- | --- | ---: |
| na-2026-001 | Ymed (éditeur de la plateforme Sooncare) | Sud Ouest | Presse régionale | 2026-04-06 | 2026-04-09 | 3 |
| na-2026-002 | Mairie de Marennes-Hiers-Brouage | Sud Ouest | Presse régionale | 2026-08-17 | 2026-08-19 | 2 |
| na-2026-003 | Ville de Tarnos | Sud Ouest | Presse régionale | 2026-08-27 | 2026-08-29 | 2 |
| na-2026-004 | Mairie d'Espelette | Sud Ouest | Presse régionale | 2026-09-11 | 2026-09-16 | 5 |
| na-2026-005 | EHPAD Résidence du Parc de Champdeniers | ICI Poitou | Presse régionale | 2025-12-08 | 2025-12-11 | 3 |
| na-2026-006 | Ville de Gradignan — police municipale | Sud Ouest | Presse régionale | 2026-05-10 | 2026-05-13 | 3 |
| na-2026-007 | Mairie de Fumel | France 3 Nouvelle-Aquitaine | Presse régionale | 2025-10-03 | 2025-10-03 | 0 |
| na-2026-008 | Collège privé La Salle de Brive-la-Gaillarde | La Dépêche | Presse régionale | 2025-01-15 | 2025-02-14 | 30 |
| na-2026-009 | Bordeaux Sciences Agro | Bordeaux Sciences Agro | Officiel | 2026-09-08 | 2026-09-15 | 7 |
| na-2026-010 | Vignobles Toutigeac | FrenchBreaches | Spécialisée / technique | 2026-07-16 | 2026-07-16 | 0 |
| na-2026-011 | SICSOE (Solution Vin Logistique) | FrenchBreaches | Spécialisée / technique | 2026-07-23 | 2026-07-23 | 0 |
| na-2026-012 | Intermarché d'Altillac | France 3 Nouvelle-Aquitaine | Presse régionale | 2026-10-12 | 2026-10-13 | 1 |
| na-2026-013 | Magasins de grande distribution touchés en Béarn et Soule… | La République des Pyrénées | Presse régionale | 2026-10-12 | 2026-10-12 | 0 |
| na-2026-014 | Coaxis | Sud Ouest | Presse régionale | 2023-12-07 | 2026-11-10 | 1069 |
| na-2026-015 | Mairie de Sarran | France 3 Nouvelle-Aquitaine | Presse régionale | 2024-09-01 | 2025-06-20 | 292 |
| na-2026-016 | Fédération Nationale des Chasseurs / chasseurs charentais | Fédération Nationale des Chasseurs | Officiel | 2026-01-20 | 2026-01-22 | 2 |
| na-2026-017 | Ville de Poitiers et Grand Poitiers | Ouest-France | Presse régionale | 2025-08-29 | 2025-09-05 | 7 |
| na-2026-018 | Fédération Française de Cyclisme — membres en Nouvelle-Aq… | Fédération Française de Cyclisme | Officiel | 2025-12-09 | 2025-12-10 | 1 |
| na-2026-019 | Delicity — service de livraison de repas disponible à Bor… | Nice-Matin | Presse régionale | — | 2026-09-07 | — |
| na-2026-020 | Euskal Moneta (association support de la monnaie locale E… | Sud Ouest | Presse régionale | 2026-08-17 | 2026-08-28 | 11 |
| na-2026-021 | SDIS des Landes | actu.fr (Actu Landes) | Presse régionale | 2026-07-25 | 2026-07-27 | 2 |
| na-2026-022 | Institut Bergonié | Institut Bergonié | Officiel | 2026-04-06 | 2026-04-09 | 3 |
| na-2026-023 | ERNAT (Études Réalisations Négoce Assistance Technique) | FrenchBreaches | Spécialisée / technique | 2026-08-07 | 2026-08-07 | 0 |
| na-2026-024 | Rectorat de l'académie de Poitiers | UNSA Éducation | Officiel | 2026-08-01 | 2026-08-31 | 30 |
| na-2026-025 | UPPA Alumni — réseau des anciens de l'Université de Pau e… | Cyber Breaches | Spécialisée / technique | 2026-04-08 | 2026-04-10 | 2 |
| na-2026-026 | Réseau Alumni de l'Université de Bordeaux | Cyberattaque.org | Spécialisée / technique | 2026-04-06 | 2026-04-10 | 4 |
| na-2026-027 | UNSS (Union nationale du sport scolaire) — exfiltration O… | UNSS (communiqué officiel du 2 mars 2026) | Officiel | 2025-11-15 | 2026-03-02 | 107 |
| na-2026-028 | Ville de La Rochelle — fuite via le prestataire Synbird | Sud Ouest | Presse régionale | 2025-10-24 | 2025-11-24 | 31 |
| na-2026-029 | Bordeaux Métropole — portail de la taxe de séjour | Cyber Breaches | Spécialisée / technique | 2026-04-27 | 2026-04-27 | 0 |
| na-2026-030 | Ministère de l'Intérieur — intrusion initiale depuis un s… | RTL | Presse nationale | 2025-12-11 | 2025-12-12 | 1 |
| na-2026-031 | Vivaticket France (Chasseneuil-du-Poitou) | La Nouvelle République | Presse régionale | 2026-03-02 | 2026-03-15 | 13 |
| na-2026-032 | Intermarché de Gradignan, Parempuyre, Macau et La Teste-d… | Bouger à Bordeaux | Presse régionale | 2026-10-11 | 2026-10-13 | 2 |
| na-2026-033 | Supermarchés des Deux-Sèvres (Hyper U Parthenay, Intermar… | La Nouvelle République | Presse régionale | 2026-10-11 | 2026-10-12 | 1 |
| na-2026-034 | Cinq Intermarché de Dordogne (Hautefort, Tocane-Saint-Apr… | Le Démocrate de Bergerac | Presse régionale | 2026-10-11 | 2026-10-12 | 1 |
| na-2026-035 | E.Leclerc de Surgères | actu.fr | Presse régionale | 2026-10-11 | 2026-10-12 | 1 |
| na-2026-036 | Magasins de la Vienne (Intermarché Chauvigny et Gençay, S… | La Nouvelle République | Presse régionale | 2026-10-11 | 2026-10-12 | 1 |
| na-2026-037 | Super U de Morcenx-la-Nouvelle et Carrefour Express de Ri… | Sud Ouest | Presse régionale | 2026-10-11 | 2026-10-12 | 1 |
| na-2026-038 | Intermarché et Carrefour Market de Marmande | Sud Ouest | Presse régionale | 2026-10-11 | 2026-10-12 | 1 |
| na-2026-039 | Cerballiance — réseau de laboratoires de biologie médicale | franceinfo | Presse nationale | 2026-03-25 | 2026-03-28 | 3 |
| na-2026-040 | Cegedim Santé — logiciel MonLogicielMedical (MLM) | Cegedim Santé (communiqué officiel) | Officiel | 2025-10-27 | 2026-02-26 | 122 |
| na-2026-041 | Polyclinique Bordeaux Nord Aquitaine | Sud Ouest | Presse régionale | 2026-04-06 | 2026-04-09 | 3 |
| na-2026-042 | Ville de Limoges — centre de vaccination municipal et cam… | Ville de Limoges (communiqué officiel) | Officiel | 2026-06-22 | 2026-06-26 | 4 |
| na-2026-043 | Weda — logiciel médical (cabinets touchés jusqu'en Charen… | Charente Libre | Presse régionale | 2025-11-10 | 2025-11-13 | 3 |
| na-2026-044 | FFRandonnée — fichier adhérents | FFRandonnée (message aux clubs, relayé) | Officiel | 2026-02-05 | 2026-02-05 | 0 |
| na-2026-045 | Association des maires de France (AMF) | Clubic | Spécialisée / technique | 2026-09-04 | 2026-09-04 | 0 |
| na-2026-046 | Office français de la biodiversité — fichier des permis d… | Charente Libre | Presse régionale | 2026-01-28 | 2026-02-22 | 25 |
| na-2026-047 | Université de Pau et des Pays de l'Adour (UPPA) — revendi… | ZATAZ | Spécialisée / technique | 2025-09-29 | 2025-09-29 | 0 |
| na-2026-048 | Ville de Bergerac — QR codes des horodateurs (quishing) | Sud Ouest | Presse régionale | 2025-08-11 | 2025-08-11 | 0 |
| na-2026-049 | Mairie de Berson | Sud Ouest | Presse régionale | 2025-02-21 | 2025-02-28 | 7 |
| na-2026-050 | Fédération française de tir (FFTir) — retombées en Haute-… | France 3 Nouvelle-Aquitaine | Presse régionale | 2025-10-18 | 2025-10-23 | 5 |
| na-2026-051 | Arsoé de Soual — plateforme Synel d'identification des bo… | France 3 Nouvelle-Aquitaine | Presse régionale | 2024-12-15 | 2024-12-31 | 16 |
| na-2026-052 | Camping municipal d'Évaux-les-Bains | France 3 Nouvelle-Aquitaine | Presse régionale | 2025-06-20 | 2025-07-11 | 21 |
| na-2026-053 | GoCap (Mostiglass) — Hinx | Sud Ouest | Presse régionale | 2022-01-01 | 2025-02-20 | 1146 |
| na-2026-054 | Artiga — atelier de linge basque à Magescq | France 3 Nouvelle-Aquitaine | Presse régionale | 2025-08-26 | 2025-10-06 | 41 |
| na-2026-055 | Université de Limoges — vol de données personnelles par u… | France 3 Nouvelle-Aquitaine | Presse régionale | 2023-09-01 | 2025-06-27 | 665 |
| na-2026-056 | Aéroport Pau-Pyrénées et écoles Eklore (CCI Pau Béarn) | Sud Ouest | Presse régionale | 2024-05-13 | 2024-05-15 | 2 |
| na-2026-057 | Sites internet des villes de Bordeaux et Pau et du départ… | France 3 Nouvelle-Aquitaine | Presse régionale | 2024-12-31 | 2025-01-02 | 2 |
| na-2026-058 | SPSTI 16 — service de prévention et de santé au travail i… | Charente Libre | Presse régionale | 2024-05-10 | 2024-06-14 | 35 |
| na-2026-059 | Centre hospitalier de Girac (Angoulême) | Charente Libre | Presse régionale | 2025-07-24 | 2025-09-09 | 47 |
| na-2026-060 | Cdiscount — extraction frauduleuse de données clients (Ce… | Le Figaro | Presse nationale | 2020-12-01 | 2025-12-09 | 1834 |

**Part régionale : 40/60 (66,7 %)**, contre 9 communiqués officiels (15 %),
8 sources spécialisées/techniques (13,3 %) et 3 médias nationaux (5 %).
Dans la fenêtre de mesure du produit (42 incidents), la part régionale tombe à
**23/42 (54,8 %)** ; sur les 27 incidents « vus » du dernier résultat publié
(`bench/results/couverture-2026-11-15.json`), elle est de **16/27 (59,3 %)**, le
reste venant de communiqués officiels (7) et de sources spécialisées (4) —
**aucun média national ne figure parmi les incidents vus**.

**Délais** : médiane **3 jours** sur les 59 incidents datés des deux côtés ;
3 j pour la presse régionale (39 datés), 0 j pour le spécialisé/technique
(8), 4 j pour l'officiel (9), 3 j pour le national (3). La moyenne (95 j) n'a
aucune signification : quatre entrées anciennes (na-2026-014, -053, -055,
-060) portent une date d'incident des années 2020-2023 et gonflent le chiffre ;
elles sont conservées dans le tableau, pas dans la lecture. Nice-Matin est
rangé en presse régionale bien que hors Nouvelle-Aquitaine ; le traiter en
national ramènerait la part à 39/60 (65 %).

## Ce que ça dit de la dépendance du produit à la presse locale

1. **La presse locale est l'infrastructure de vérité du produit.** Elle révèle
   trois incidents sur quatre dans le corpus vérifié, deux sur trois dans le
   corpus de référence, et encore ~60 % de ceux que le moteur reconnaît
   effectivement. Retirer ses flux ne réduirait pas la couverture de quelques
   points : cela supprimerait la majorité des cas sur lesquels la couverture
   est mesurée.
2. **Les relais nationaux et techniques ne compensent pas.** Un média national
   sur 60 dans le corpus de référence, zéro dans le corpus vérifié, zéro parmi
   les incidents vus. Les sources spécialisées sont rapides (délai médian
   0 jour) mais ne couvrent que 8 cas sur 60, souvent des revendications non
   confirmées ; les communiqués officiels, eux, arrivent en médiane à 4 jours
   et parfois bien plus tard (107 j pour l'UNSS, 122 j pour Cegedim).
3. **Le chiffre de couverture est en partie circulaire.** Les corpus sont
   constitués à partir d'articles de presse régionale, puis rejoués contre le
   moteur : le 66,7 % de `docs/couverture-mesuree.md` mesure notre capacité à
   *reconnaître ce que la presse locale a déjà publié*, pas notre capacité à
   détecter un incident avant elle ni l'exhaustivité des incidents réels. Un
   incident non médiatisé, traité en interne ou derrière un paywall restera
   invisible des deux côtés.
4. **Conséquence concrète** : les flux de presse régionale doivent être traités
   comme critiques (surveillance de leur état, de leur cadence et de leur
   accessibilité), et la diversification vers les communiqués officiels et les
   sources techniques est un objectif de résilience — pas un moyen de remplacer
   la presse locale à court terme.

## Limites

- « Source révélatrice » est la source retenue après déduplication, pas
  nécessairement le premier signal chronologique. Une enquête locale peut être
  citée dans le résumé d'un communiqué officiel (na-couv-014 : Sud Ouest
  établit le point d'entrée via le rectorat de Bordeaux) sans être la ligne
  `source`.
- Le délai est celui de la **publication**, pas de la collecte ni de la
  détection : `docs/couverture-mesuree.md` interdit expressément de confondre
  les deux. La mesure de latence réelle reste `scripts/mesure-delai.mts`.
- Les catégories sont des jugements éditoriaux documentés ci-dessus ; deux cas
  limitrophes (ICI / Radio France, Nice-Matin) ont une sensibilité chiffrée.
- Le corpus des 20 est un échantillon vérifié, pas un inventaire ; sa part de
  75 % ne doit pas être lue comme la part de marché de la presse régionale.

## Reproductible

```bash
jq -r '.source' bench/couverture/incidents.jsonl | sort | uniq -c | sort -rn
jq -r '[.id,.date_incident//"—",.date_publication,.source] | @tsv' bench/couverture/incidents.jsonl
jq -r '.incidents[] | [.id,(.preuve.editeur//"—"),(.dateIncident//"—"),.datePublique] | @tsv' \
  bench/fixtures/corpus-reference-na.json
```
