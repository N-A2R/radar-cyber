# Anticipation — ce que le radar savait à J-21, incident par incident

> Corpus : 60 incidents (`bench/fixtures/corpus-reference-na.json`), instantané
> `bench/anticipation/J-21.jsonl` produit par `scripts/anticipation.mts`.
> Ce document remplace la mesure « 3 faits / 2 signaux (67 %) » qui figurait ici :
> elle venait d'une série de démonstration semée hors dépôt et ne mesure pas le terrain.

## La question posée

Pour chaque incident, une seule question : **qu'est-ce qui, dans les données dont
le radar disposait 21 jours avant le fait, l'aurait annoncé ?** La réponse est
« rien » aussi souvent que nécessaire : un « rien » documenté est une
information, pas un échec à masquer.

## Définition de « signal » utilisée ici

Un signal est un élément **antérieur à J-21** qui, sans connaître l'incident,
aurait pu désigner l'entité concernée ou son périmètre :

- un événement qui nomme l'entité, son établissement ou sa commune ;
- un indicateur technique (`technical_indicator`) la visant ;
- une revendication antérieure (`third_party_claim`) ;
- une alerte déjà émise sur le sujet.

Ne comptent **pas** comme signaux : les CVE génériques, les articles de
veille internationale, les publications de fuites concernant d'autres
victimes, et les rattachements d'organisation obtenus par correspondance
approximative. Un mot générique partagé (« police », « service », « office »)
n'est pas une preuve : le seul recoupement de ce type (`Modesto Police
Department` pour la police municipale de Gradignan) a été écarté.

## Ce qui était effectivement disponible à J-21

| Mesure | Valeur |
|---|---|
| Incidents examinés | 60 |
| Événements dans les 60 fenêtres | 2 257 (de 0 à 141 par incident) |
| Familles présentes | `vuln` 1 106 · `cti` 657 · `cert` 283 · `leaks` 135 · `cert_fr` 74 · `ransomware` 2 |
| Assertions présentes | `ambient_signal` 1 458 · `confirmed_incident` 799 — **aucun** `technical_indicator`, **aucun** `third_party_claim`, aucune alerte |
| Sources actives par incident | 4 à 20 (20 sources distinctes : CISA KEV, CERT NL/AT/PL/FR, HIBP, DDoSecrets, Telegram CTI, etc.) |
| Fenêtre vide | 1 incident (`na-2026-060`) |
| Rattachements d'organisation | 13 incidents, tous bruités (voir ci-dessous) |

Limite du snapshot : il détaille les événements de la seule fenêtre
[J-42, J-21]. Les événements plus anciens (20 à 1 920 par incident) ne sont
que comptés dans `evenements_avant_j21`, pas exposés. Le verdict porte donc sur
la tranche inspectable, qui est celle où un signal d'anticipation devrait se
trouver. Les titres d'événements sont tronqués à 200 caractères, et neuf
incidents partagent un même J-21 donc une fenêtre identique : ces deux faits
sont à garder en tête avant de lire le verdict comme une propriété intrinsèque
de chaque entité.

## Verdict, incident par incident

Pour chaque ligne, la colonne « Signal à J-21 » répond à la question posée.

| Incident | Entité | J-21 | Événements de fenêtre | Signal à J-21 |
|---|---|---|---:|---|
| na-2026-001 | Ymed (éditeur de la plateforme Sooncare) | 2026-03-16 | cert 5, cert_fr 1, cti 2, vuln 14 | **rien** |
| na-2026-002 | Mairie de Marennes-Hiers-Brouage | 2026-07-27 | cert 4, cert_fr 3, cti 6, vuln 32 | **rien** |
| na-2026-003 | Ville de Tarnos | 2026-08-06 | cert 8, cert_fr 2, cti 11, vuln 25 | **rien** |
| na-2026-004 | Mairie d'Espelette | 2026-08-21 | cert 8, cti 3, vuln 22 | **rien** — rattachement bruité à *OPEN SOURCE* (faux positif) |
| na-2026-005 | EHPAD Résidence du Parc de Champdeniers | 2025-11-17 | leaks 1, vuln 11 | **rien** |
| na-2026-006 | Ville de Gradignan — police municipale | 2026-04-19 | cert 5, cert_fr 1, cti 5, leaks 6, vuln 14 | **rien** |
| na-2026-007 | Mairie de Fumel | 2025-09-12 | cert 1, cert_fr 1, leaks 1, ransomware 1, vuln 11 | **rien** |
| na-2026-008 | Collège privé La Salle de Brive-la-Gaillarde | 2024-12-25 | cert 2, cti 3, vuln 8 | **rien** |
| na-2026-009 | Bordeaux Sciences Agro | 2026-08-18 | cert 8, cti 7, vuln 24 | **rien** — rattachement bruité à *OPEN SOURCE* (faux positif) |
| na-2026-010 | Vignobles Toutigeac | 2026-06-25 | cert 5, cti 2, vuln 26 | **rien** |
| na-2026-011 | SICSOE (Solution Vin Logistique) | 2026-07-02 | cert 3, cti 3, vuln 27 | **rien** |
| na-2026-012 | Intermarché d'Altillac | 2026-09-21 | cert 14, cert_fr 4, cti 63, leaks 14, vuln 46 | **rien** — rattachement bruité à *lyon.co.uk* (faux positif) |
| na-2026-013 | Magasins de grande distribution touchés en Béarn et Soule (dont Intermarché Pau et Monein) | 2026-09-21 | cert 14, cert_fr 4, cti 63, leaks 14, vuln 46 | **rien** — rattachement bruité à *lyon.co.uk* (faux positif) |
| na-2026-014 | Coaxis | 2023-11-16 | cert 2, cti 1, vuln 13 | **rien** |
| na-2026-015 | Mairie de Sarran | 2024-08-11 | cert 1, cert_fr 1, cti 1, vuln 7 | **rien** |
| na-2026-016 | Fédération Nationale des Chasseurs / chasseurs charentais | 2025-12-30 | cert 2, cti 1, vuln 6 | **rien** |
| na-2026-017 | Ville de Poitiers et Grand Poitiers | 2025-08-08 | cert 3, cert_fr 2, cti 1, leaks 2, vuln 10 | **rien** — rattachement bruité à *PARTIE SON* (faux positif) |
| na-2026-018 | Fédération Française de Cyclisme — membres en Nouvelle-Aquitaine | 2025-11-18 | leaks 1, vuln 10 | **rien** |
| na-2026-019 | Delicity — service de livraison de repas disponible à Bordeaux, Pau et Limoges | 2026-08-17 | cert 8, cti 7, vuln 20 | **rien** |
| na-2026-020 | Euskal Moneta (association support de la monnaie locale Eusko) | 2026-07-27 | cert 4, cert_fr 3, cti 6, vuln 32 | **rien** |
| na-2026-021 | SDIS des Landes | 2026-07-04 | cert 3, cti 3, vuln 26 | **rien** |
| na-2026-022 | Institut Bergonié | 2026-03-16 | cert 5, cert_fr 1, cti 2, vuln 14 | **rien** |
| na-2026-023 | ERNAT (Études Réalisations Négoce Assistance Technique) | 2026-07-17 | cert 2, cert_fr 1, cti 2, vuln 29 | **rien** |
| na-2026-024 | Rectorat de l'académie de Poitiers | 2026-07-11 | cert 2, cti 2, vuln 28 | **rien** |
| na-2026-025 | UPPA Alumni — réseau des anciens de l'Université de Pau et des Pays de l'Adour | 2026-03-18 | cert 5, cti 2, vuln 13 | **rien** |
| na-2026-026 | Réseau Alumni de l'Université de Bordeaux | 2026-03-16 | cert 5, cert_fr 1, cti 2, vuln 14 | **rien** |
| na-2026-027 | UNSS (Union nationale du sport scolaire) — exfiltration OPUSS | 2025-10-25 | cert 4, cti 3, vuln 15 | **rien** |
| na-2026-028 | Ville de La Rochelle — fuite via le prestataire Synbird | 2025-10-03 | cert 1, cert_fr 1, cti 3, vuln 8 | **rien** |
| na-2026-029 | Bordeaux Métropole — portail de la taxe de séjour | 2026-04-06 | cert 2, cert_fr 2, cti 8, leaks 4, vuln 11 | **rien** |
| na-2026-030 | Ministère de l'Intérieur — intrusion initiale depuis un service local de Charente-Maritime | 2025-11-20 | leaks 1, vuln 8 | **rien** |
| na-2026-031 | Vivaticket France (Chasseneuil-du-Poitou) | 2026-02-09 | cert 3, cert_fr 1, cti 3, vuln 14 | **rien** |
| na-2026-032 | Intermarché de Gradignan, Parempuyre, Macau et La Teste-de-Buch | 2026-09-20 | cert 14, cert_fr 4, cti 57, leaks 12, vuln 47 | **rien** — rattachement bruité à *lyon.co.uk* (faux positif) |
| na-2026-033 | Supermarchés des Deux-Sèvres (Hyper U Parthenay, Intermarché Saint-Varent et Saint-Maixent-l'École, Super U Champdeniers, Celles-sur-Belle, Leclerc Thouars-Sainte-Verge) | 2026-09-20 | cert 14, cert_fr 4, cti 57, leaks 12, vuln 47 | **rien** — rattachement bruité à *lyon.co.uk* (faux positif) |
| na-2026-034 | Cinq Intermarché de Dordogne (Hautefort, Tocane-Saint-Apre, Port-Sainte-Foy-et-Ponchapt, Trélissac, Saint-Médard-de-Mussidan) | 2026-09-20 | cert 14, cert_fr 4, cti 57, leaks 12, vuln 47 | **rien** — rattachement bruité à *lyon.co.uk* (faux positif) |
| na-2026-035 | E.Leclerc de Surgères | 2026-09-20 | cert 14, cert_fr 4, cti 57, leaks 12, vuln 47 | **rien** — rattachement bruité à *lyon.co.uk* (faux positif) |
| na-2026-036 | Magasins de la Vienne (Intermarché Chauvigny et Gençay, Super U Vouillé, Leclerc Poitiers, Auchan Saint-Genest-d'Ambière) | 2026-09-20 | cert 14, cert_fr 4, cti 57, leaks 12, vuln 47 | **rien** — rattachement bruité à *lyon.co.uk* (faux positif) |
| na-2026-037 | Super U de Morcenx-la-Nouvelle et Carrefour Express de Rion-des-Landes | 2026-09-20 | cert 14, cert_fr 4, cti 57, leaks 12, vuln 47 | **rien** — rattachement bruité à *lyon.co.uk* (faux positif) |
| na-2026-038 | Intermarché et Carrefour Market de Marmande | 2026-09-20 | cert 14, cert_fr 4, cti 57, leaks 12, vuln 47 | **rien** — rattachement bruité à *lyon.co.uk* (faux positif) |
| na-2026-039 | Cerballiance — réseau de laboratoires de biologie médicale | 2026-03-04 | cert 3, cert_fr 1, cti 3, vuln 12 | **rien** |
| na-2026-040 | Cegedim Santé — logiciel MonLogicielMedical (MLM) | 2025-10-06 | cert 2, cert_fr 1, cti 3, vuln 14 | **rien** |
| na-2026-041 | Polyclinique Bordeaux Nord Aquitaine | 2026-03-16 | cert 5, cert_fr 1, cti 2, vuln 14 | **rien** |
| na-2026-042 | Ville de Limoges — centre de vaccination municipal et campagne HPV | 2026-06-01 | cert 4, cert_fr 1, cti 3, leaks 1, vuln 15 | **rien** |
| na-2026-043 | Weda — logiciel médical (cabinets touchés jusqu'en Charente) | 2025-10-20 | cert 3, cti 3, vuln 16 | **rien** |
| na-2026-044 | FFRandonnée — fichier adhérents | 2026-01-15 | cert 2, leaks 1, vuln 3 | **rien** |
| na-2026-045 | Association des maires de France (AMF) | 2026-08-14 | cert 8, cti 8, vuln 22 | **rien** |
| na-2026-046 | Office français de la biodiversité — fichier des permis de chasser | 2026-01-07 | cert 2, vuln 3 | **rien** |
| na-2026-047 | Université de Pau et des Pays de l'Adour (UPPA) — revendication Nova | 2025-09-08 | cert 1, cert_fr 1, leaks 1, ransomware 1, vuln 10 | **rien** |
| na-2026-048 | Ville de Bergerac — QR codes des horodateurs (quishing) | 2025-07-21 | cert 2, cert_fr 2, cti 2, vuln 4 | **rien** |
| na-2026-049 | Mairie de Berson | 2025-01-31 | cert 2, cert_fr 1, vuln 8 | **rien** |
| na-2026-050 | Fédération française de tir (FFTir) — retombées en Haute-Vienne | 2025-09-27 | cert 1, cert_fr 1, cti 1, vuln 3 | **rien** |
| na-2026-051 | Arsoé de Soual — plateforme Synel d'identification des bovins et ovins | 2024-11-24 | cert 3, cert_fr 1, leaks 1, vuln 12 | **rien** |
| na-2026-052 | Camping municipal d'Évaux-les-Bains | 2025-05-30 | cert 1, cert_fr 2, cti 1, leaks 1, vuln 11 | **rien** |
| na-2026-053 | GoCap (Mostiglass) — Hinx | 2021-12-11 | cert 1, vuln 14 | **rien** |
| na-2026-054 | Artiga — atelier de linge basque à Magescq | 2025-08-05 | cert 3, cert_fr 2, cti 1, leaks 1, vuln 11 | **rien** — rattachement bruité à *PARTIE SON* (faux positif) |
| na-2026-055 | Université de Limoges — vol de données personnelles par un agent | 2023-08-11 | cti 9, vuln 4 | **rien** |
| na-2026-056 | Aéroport Pau-Pyrénées et écoles Eklore (CCI Pau Béarn) | 2024-04-22 | cert 4, cert_fr 1, cti 1, vuln 2 | **rien** |
| na-2026-057 | Sites internet des villes de Bordeaux et Pau et du département des Landes (DDoS) | 2024-12-10 | cert 2, cti 1, leaks 1, vuln 6 | **rien** |
| na-2026-058 | SPSTI 16 — service de prévention et de santé au travail interentreprises de la Charente | 2024-04-19 | cert 4, cert_fr 1, cti 1, vuln 2 | **rien** |
| na-2026-059 | Centre hospitalier de Girac (Angoulême) | 2025-07-03 | cert 3, cert_fr 1, cti 4, vuln 7 | **rien** |
| na-2026-060 | Cdiscount — extraction frauduleuse de données clients (Cestas) | 2020-11-10 | 0 (fenêtre vide) | **rien** — aucun événement enregistré |

## Comptage

- **Incidents avec au moins un signal à J-21 : 0 / 60.**
- **Incidents sans signal : 60 / 60** (dont 1 fenêtre vide et 13 rattachements
  d'organisation écartés comme faux positifs).

Aucune avance médiane n'est calculable : il n'y a pas de signal à dater. Le
chiffre n'est pas « 0 % de capacité prédictive » — c'est « aucun signal
observable dans les données que le radar avait ».

## Pourquoi ce zéro

1. **Couverture.** Les incidents sont révélés par la presse locale et
   régionale : Sud Ouest (15), France 3 Nouvelle-Aquitaine (9), Charente Libre
   (4), La Nouvelle République (3), puis des communiqués d'établissements. Le
   radar ingère des flux CISA/CERT/CVE/CTI/leaks internationaux : **aucune de
   ces sources locales n'est branchée**. À J-21, l'information qui aurait
   pu alerter n'était donc pas dans le système.
2. **Nature des données.** Le snapshot ne contient que des `ambient_signal` et
   des `confirmed_incident`. Les natures les plus proches d'une alerte —
   indicateur technique, revendication, alerte — sont absentes des 2 257
   événements examinés.
3. **Le rattachement automatique ne compense pas.** Les 13 organisations
   « citées » viennent de trois faux positifs : « OPEN SOURCE » d'un avis
   CERT-NL sur GeoTools, « lyon.co.uk » d'une publication HIBP sur Questel,
   « PARTIE SON » d'un avis CERT-FR sur SonicWall. Aucun ne désigne une entité
   du corpus. Compter ces rattachements comme des signaux ferait passer le
   taux de 0 % à 22 % avec du bruit pur.

## Ce que ça implique pour la valeur du produit

- **Ne pas vendre d'anticipation.** Sur ce corpus, le produit n'a aucun
  précédent mesurable de détection avant le fait. Toute affirmation du type
  « nous avons vu venir X » serait fausse. La promesse défendable aujourd'hui
  porte sur le **constat et l'explication après coup** : cartographie des
  incidents, qualification, mesure de couverture, constitution d'une mémoire.
- **Le défaut est de couverture, pas de modèle.** Ajouter un score ou un agent
  de rupture maintenant reviendrait à classer du bruit : il n'existe pas de
  signal d'entrée à classer. La vague « précision » précédente a déjà montré
  que le rattachement automatique produit majoritairement des faux positifs.
- **Condition pour changer le chiffre.** Brancher les sources locales et
  régionales françaises, extraire les entités et les alias pour les rattacher
  aux événements, capter les revendications et indicateurs techniques, puis
  rejouer `scripts/anticipation.mts` et `scripts/mesure-anticipation.mts`.
  Tant que cette mesure n'a pas été refaite, le taux à publier est 0/60.
- **La mesure reste publiable.** Un zéro franc, avec son périmètre et ses
  limites, a plus de valeur commerciale qu'un pourcentage issu d'une série
  de démonstration : il dit précisément quel travail reste à faire pour que
  l'anticipation devienne un argument de vente.

## Ce que ce document ne dit pas

- Il ne dit pas qu'aucun signal n'existait dans le monde réel : il dit qu'il
  n'y en avait aucun **dans les données du radar à J-21**.
- Il ne mesure pas la capacité d'un hypothétique futur modèle, seulement
  l'état d'un système existant face à un corpus réel.
- Il ne couvre pas les événements antérieurs à la fenêtre, non détaillés par
  le snapshot.
