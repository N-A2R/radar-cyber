# Anticipation — état des données à J-21 et recherche de signes précurseurs
> Document généré par `scripts/rapport-anticipation.mts` à partir du corpus de référence et de
> l'instantané `bench/anticipation/J-21.jsonl`. **Ne pas éditer à la main** : modifier une entrée
> puis relancer le script, sinon le contrôle `--verifier` échouera.
> Empreintes sha256 des entrées : corpus `a6634b37f84e896f2c3395e21004aea8d289e6b6362f3908a64bdcd017cdd995` · instantané `6c4fcaef5164902634185329128e9fab7143db59479ca72b4826207d10940909`.
> Dernière date d'incident du corpus : 2026-10-12. Aucune donnée postérieure à chaque J-21 n'entre dans l'analyse.

## 1. La question posée

Pour chaque incident : **qu'est-ce qui, dans les données dont le radar disposait 21 jours avant,
aurait pu l'annoncer ?** La réponse « rien » est un résultat à part entière, publié tel quel.
Ce document ne mesure pas une capacité prédictive hypothétique ; il décrit un état de fait.

## 2. Méthode et définitions

- **Instantané** : pour chaque incident, la fenêtre [J-21 − 20 j, J-21] incluse, construite sur la
  date d'incident (ou la date de publication quand la première manque, signalé dans le dossier).
- **Événements** : tous ceux de la fenêtre, avec leur nature (`ambient_signal`, `confirmed_incident`, `technical_indicator`, `third_party_claim`).
- **Sources actives** : sources ayant produit au moins un événement avant J-21, et encore activées.
  Une source qui répond mais ne produit rien n'est pas une source active au sens de cette mesure.
- **Organisations citées** : organisations rattachées à un événement de la fenêtre. Un rattachement
  n'est un signal que si son nom ou le titre de l'événement recoupe l'entité ; sinon c'est un bruit.
- **Ruptures détectées** : dérives calculées sur les seuls événements qui concernent l'entité
  (`rafale` : 3 événements d'une même famille en 7 jours ; `changement-nature` : 2 familles au moins).
  Le détecteur `nouvelle-organisation` n'est pas calculable ici : l'instantané ne porte pas la date
  de première apparition de l'organisation. Il n'est pas compté pour zéro, il est signalé
  comme non calculable. Aucune alerte n'est présente dans l'instantané ; une alerte créée après
  J-21 ne peut en aucun cas compter comme signe antérieur.
- **Signal retenu** : mention nominative (au moins deux jetons distincts, ou un jeton et un
  rattachement recoupé), indicateur technique ou revendication désignant l'entité.
- **Candidat à examiner** : jeton unique, commune seule, ou élément intrinsèquement intéressant
  sans cible nominative. Un candidat n'est jamais publié comme une anticipation avérée.
- **Exclusions** : CVE génériques, veille internationale, fuites concernant d'autres victimes,
  mots partagés (« police », « service », « source », …) et rattachements approximatifs.

## 3. Ce qui était effectivement disponible à J-21

| Mesure | Valeur |
|---|---|
| Incidents examinés | 60 |
| Événements dans les fenêtres | 2257 (de 0 à 141 par incident) |
| Sources actives distinctes | 20 (de 4 à 20 par incident) |
| Incidents avec organisation citée | 13 |
| Rattachements bruités écartés | 22 |
| Incidents avec rupture détectée sur l'entité | 0 |
| Fenêtres vides | 1 |
| Incidents avec signal retenu | 0 / 60 |
| Incidents sans signal | 60 / 60 |

Répartition des natures d'événements (chaque événement compte une fois) :

| Nature | Nombre |
|---|---:|
| `ambient_signal` | 1458 |
| `confirmed_incident` | 799 |

| Famille | Nombre |
|---|---:|
| `vuln` | 1106 |
| `cti` | 657 |
| `cert` | 283 |
| `leaks` | 135 |
| `cert_fr` | 74 |
| `ransomware` | 2 |

Synthèse agrégée au sens du module `analyse/anticipation.ts` (signaux retenus seulement) :

- faits : 60 ; avec signal : 0 (0 %) ;
- avance médiane : non calculable (aucun signal) ;
- par nature : indicateur 0 · revendication 0 · ambiance 0 · alerte 0 ;
- mesure indicative (moins de 10 faits) : non.

## 4. Verdict par incident

| Incident | Entité | J-21 | Événements | Sources | Organisations | Ruptures | Signal à J-21 |
|---|---|---|---:|---:|---:|---:|---|

| `na-2026-001` | Ymed (éditeur de la plateforme Sooncare) | 2026-03-16 | 22 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-002` | Mairie de Marennes-Hiers-Brouage | 2026-07-27 | 45 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-003` | Ville de Tarnos | 2026-08-06 | 46 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-004` | Mairie d'Espelette | 2026-08-21 | 33 | 12 | 1 | 0 | **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-005` | EHPAD Résidence du Parc de Champdeniers | 2025-11-17 | 12 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-006` | Ville de Gradignan — police municipale | 2026-04-19 | 31 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-007` | Mairie de Fumel | 2025-09-12 | 15 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-008` | Collège privé La Salle de Brive-la-Gaillarde | 2024-12-25 | 13 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-009` | Bordeaux Sciences Agro | 2026-08-18 | 39 | 12 | 1 | 0 | **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-010` | Vignobles Toutigeac | 2026-06-25 | 33 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-011` | SICSOE (Solution Vin Logistique) | 2026-07-02 | 33 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-012` | Intermarché d'Altillac | 2026-09-21 | 141 | 20 | 1 | 0 | **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-013` | Magasins de grande distribution touchés en Béarn et Soule (dont Intermarché Pau et Monein) | 2026-09-21 | 141 | 20 | 1 | 0 | **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-014` | Coaxis | 2023-11-16 | 16 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-015` | Mairie de Sarran | 2024-08-11 | 10 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-016` | Fédération Nationale des Chasseurs / chasseurs charentais | 2025-12-30 | 9 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-017` | Ville de Poitiers et Grand Poitiers | 2025-08-08 | 18 | 11 | 1 | 0 | **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-018` | Fédération Française de Cyclisme — membres en Nouvelle-Aquitaine | 2025-11-18 | 11 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-019` | Delicity — service de livraison de repas disponible à Bordeaux, Pau et Limoges | 2026-08-17 | 35 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-020` | Euskal Moneta (association support de la monnaie locale Eusko) | 2026-07-27 | 45 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-021` | SDIS des Landes | 2026-07-04 | 32 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-022` | Institut Bergonié | 2026-03-16 | 22 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-023` | ERNAT (Études Réalisations Négoce Assistance Technique) | 2026-07-17 | 34 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-024` | Rectorat de l'académie de Poitiers | 2026-07-11 | 32 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-025` | UPPA Alumni — réseau des anciens de l'Université de Pau et des Pays de l'Adour | 2026-03-18 | 20 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-026` | Réseau Alumni de l'Université de Bordeaux | 2026-03-16 | 22 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-027` | UNSS (Union nationale du sport scolaire) — exfiltration OPUSS | 2025-10-25 | 22 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-028` | Ville de La Rochelle — fuite via le prestataire Synbird | 2025-10-03 | 13 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-029` | Bordeaux Métropole — portail de la taxe de séjour | 2026-04-06 | 27 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-030` | Ministère de l'Intérieur — intrusion initiale depuis un service local de Charente-Maritime | 2025-11-20 | 9 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-031` | Vivaticket France (Chasseneuil-du-Poitou) | 2026-02-09 | 21 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-032` | Intermarché de Gradignan, Parempuyre, Macau et La Teste-de-Buch | 2026-09-20 | 134 | 20 | 1 | 0 | **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-033` | Supermarchés des Deux-Sèvres (Hyper U Parthenay, Intermarché Saint-Varent et Saint-Maixent-l'École, Super U Champdeniers, Celles-sur-Belle, Leclerc Thouars-Sainte-Verge) | 2026-09-20 | 134 | 20 | 1 | 0 | **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-034` | Cinq Intermarché de Dordogne (Hautefort, Tocane-Saint-Apre, Port-Sainte-Foy-et-Ponchapt, Trélissac, Saint-Médard-de-Mussidan) | 2026-09-20 | 134 | 20 | 1 | 0 | **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-035` | E.Leclerc de Surgères | 2026-09-20 | 134 | 20 | 1 | 0 | **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-036` | Magasins de la Vienne (Intermarché Chauvigny et Gençay, Super U Vouillé, Leclerc Poitiers, Auchan Saint-Genest-d'Ambière) | 2026-09-20 | 134 | 20 | 1 | 0 | **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-037` | Super U de Morcenx-la-Nouvelle et Carrefour Express de Rion-des-Landes | 2026-09-20 | 134 | 20 | 1 | 0 | **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-038` | Intermarché et Carrefour Market de Marmande | 2026-09-20 | 134 | 20 | 1 | 0 | **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-039` | Cerballiance — réseau de laboratoires de biologie médicale | 2026-03-04 | 19 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-040` | Cegedim Santé — logiciel MonLogicielMedical (MLM) | 2025-10-06 | 20 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-041` | Polyclinique Bordeaux Nord Aquitaine | 2026-03-16 | 22 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-042` | Ville de Limoges — centre de vaccination municipal et campagne HPV | 2026-06-01 | 24 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-043` | Weda — logiciel médical (cabinets touchés jusqu'en Charente) | 2025-10-20 | 22 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-044` | FFRandonnée — fichier adhérents | 2026-01-15 | 6 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-045` | Association des maires de France (AMF) | 2026-08-14 | 38 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-046` | Office français de la biodiversité — fichier des permis de chasser | 2026-01-07 | 5 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-047` | Université de Pau et des Pays de l'Adour (UPPA) — revendication Nova | 2025-09-08 | 14 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-048` | Ville de Bergerac — QR codes des horodateurs (quishing) | 2025-07-21 | 10 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-049` | Mairie de Berson | 2025-01-31 | 11 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-050` | Fédération française de tir (FFTir) — retombées en Haute-Vienne | 2025-09-27 | 6 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-051` | Arsoé de Soual — plateforme Synel d'identification des bovins et ovins | 2024-11-24 | 17 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-052` | Camping municipal d'Évaux-les-Bains | 2025-05-30 | 16 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-053` | GoCap (Mostiglass) — Hinx | 2021-12-11 | 15 | 6 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-054` | Artiga — atelier de linge basque à Magescq | 2025-08-05 | 18 | 11 | 1 | 0 | **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-2026-055` | Université de Limoges — vol de données personnelles par un agent | 2023-08-11 | 13 | 10 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-056` | Aéroport Pau-Pyrénées et écoles Eklore (CCI Pau Béarn) | 2024-04-22 | 8 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-057` | Sites internet des villes de Bordeaux et Pau et du département des Landes (DDoS) | 2024-12-10 | 10 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-058` | SPSTI 16 — service de prévention et de santé au travail interentreprises de la Charente | 2024-04-19 | 8 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-059` | Centre hospitalier de Girac (Angoulême) | 2025-07-03 | 15 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-2026-060` | Cdiscount — extraction frauduleuse de données clients (Cestas) | 2020-11-10 | 0 | 4 | 0 | 0 | **rien** — fenêtre vide, aucun événement enregistré à J-21 |

## 5. Dossiers détaillés

Chaque dossier donne l'état brut à J-21 puis la recherche effectuée. Quand la réponse est « rien »,
le dossier dit ce qui a été cherché et pourquoi aucun élément n'a été retenu.

### `na-2026-001` — Ymed (éditeur de la plateforme Sooncare)
- **Fait** : fuite, 2026-04-06 · Bègles (33).
- **Instantané** : J-21 = 2026-03-16 ; fenêtre [2026-02-24, 2026-03-16] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 22 (1510 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · cert 5 · cti 2 · cert_fr 1.
  - Natures : confirmed_incident 14 · ambient_signal 8.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité ymed, editeur, plateforme, sooncare ; jetons de lieu begles ; 22 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-002` — Mairie de Marennes-Hiers-Brouage
- **Fait** : compromission, 2026-08-17 · Marennes-Hiers-Brouage (17).
- **Instantané** : J-21 = 2026-07-27 ; fenêtre [2026-07-07, 2026-07-27] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 45 (1698 événements plus anciens comptés, non détaillés).
  - Familles : vuln 32 · cti 6 · cert 4 · cert_fr 3.
  - Natures : ambient_signal 27 · confirmed_incident 18.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité marennes, hiers, brouage ; jetons de lieu marennes, hiers, brouage ; 45 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-003` — Ville de Tarnos
- **Fait** : ransomware, 2026-08-27 · Tarnos (40).
- **Instantané** : J-21 = 2026-08-06 ; fenêtre [2026-07-17, 2026-08-06] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 46 (1720 événements plus anciens comptés, non détaillés).
  - Familles : vuln 25 · cti 11 · cert 8 · cert_fr 2.
  - Natures : ambient_signal 35 · confirmed_incident 11.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité tarnos ; jetons de lieu tarnos ; 46 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-004` — Mairie d'Espelette
- **Fait** : phishing, 2026-09-11 · Espelette (64).
- **Instantané** : J-21 = 2026-08-21 ; fenêtre [2026-08-01, 2026-08-21] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 33 (1747 événements plus anciens comptés, non détaillés).
  - Familles : vuln 22 · cert 8 · cti 3.
  - Natures : ambient_signal 20 · confirmed_incident 13.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (1) : OPEN SOURCE (#482872).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité espelette ; jetons de lieu espelette ; 33 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 1 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Kritieke SQL-injectie in GeoTools open source Java-bibliotheek: update onmiddellijk — rattachement à « OPEN SOURCE » sans recoupement avec l'entité.
- **Verdict** : **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-005` — EHPAD Résidence du Parc de Champdeniers
- **Fait** : ransomware, 2025-12-08 · Champdeniers (79).
- **Instantané** : J-21 = 2025-11-17 ; fenêtre [2025-10-28, 2025-11-17] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 12 (1426 événements plus anciens comptés, non détaillés).
  - Familles : vuln 11 · leaks 1.
  - Natures : confirmed_incident 11 · ambient_signal 1.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité ehpad, residence, parc, champdeniers ; jetons de lieu champdeniers ; 12 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-006` — Ville de Gradignan — police municipale
- **Fait** : fuite, 2026-05-10 · Gradignan (33).
- **Instantané** : J-21 = 2026-04-19 ; fenêtre [2026-03-30, 2026-04-19] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 31 (1556 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · leaks 6 · cert 5 · cti 5 · cert_fr 1.
  - Natures : ambient_signal 17 · confirmed_incident 14.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité gradignan, police, municipale ; jetons de lieu gradignan ; 31 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-007` — Mairie de Fumel
- **Fait** : ransomware, 2025-10-03 · Fumel (47).
- **Instantané** : J-21 = 2025-09-12 ; fenêtre [2025-08-23, 2025-09-12] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 15 (1379 événements plus anciens comptés, non détaillés).
  - Familles : vuln 11 · cert 1 · cert_fr 1 · leaks 1 · ransomware 1.
  - Natures : confirmed_incident 11 · ambient_signal 4.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité fumel ; jetons de lieu fumel ; 15 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : TITRE_TRONQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-008` — Collège privé La Salle de Brive-la-Gaillarde
- **Fait** : ransomware, 2025-01-15 · Brive-la-Gaillarde (19).
- **Instantané** : J-21 = 2024-12-25 ; fenêtre [2024-12-05, 2024-12-25] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 13 (1197 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · cti 3 · cert 2.
  - Natures : confirmed_incident 8 · ambient_signal 5.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité college, prive, salle, brive, gaillarde ; jetons de lieu brive, gaillarde ; 13 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-009` — Bordeaux Sciences Agro
- **Fait** : fuite, 2026-09-08 · Gradignan (33).
- **Instantané** : J-21 = 2026-08-18 ; fenêtre [2026-07-29, 2026-08-18] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 39 (1740 événements plus anciens comptés, non détaillés).
  - Familles : vuln 24 · cert 8 · cti 7.
  - Natures : ambient_signal 28 · confirmed_incident 11.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (1) : OPEN SOURCE (#482872).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité bordeaux, sciences, agro ; jetons de lieu gradignan ; 39 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 1 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Kritieke SQL-injectie in GeoTools open source Java-bibliotheek: update onmiddellijk — rattachement à « OPEN SOURCE » sans recoupement avec l'entité.
- **Verdict** : **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-010` — Vignobles Toutigeac
- **Fait** : ransomware, 2026-07-16 · Targon (33).
- **Instantané** : J-21 = 2026-06-25 ; fenêtre [2026-06-05, 2026-06-25] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 33 (1640 événements plus anciens comptés, non détaillés).
  - Familles : vuln 26 · cert 5 · cti 2.
  - Natures : ambient_signal 17 · confirmed_incident 16.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité vignobles, toutigeac ; jetons de lieu targon ; 33 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-011` — SICSOE (Solution Vin Logistique)
- **Fait** : ransomware, 2026-07-23 · Bordeaux (33).
- **Instantané** : J-21 = 2026-07-02 ; fenêtre [2026-06-12, 2026-07-02] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 33 (1652 événements plus anciens comptés, non détaillés).
  - Familles : vuln 27 · cert 3 · cti 3.
  - Natures : ambient_signal 22 · confirmed_incident 11.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité sicsoe, solution, vin, logistique ; jetons de lieu bordeaux ; 33 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-012` — Intermarché d'Altillac
- **Fait** : autre, 2026-10-12 · Altillac (19).
- **Instantané** : J-21 = 2026-09-21 ; fenêtre [2026-09-01, 2026-09-21] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 141 (1920 événements plus anciens comptés, non détaillés).
  - Familles : cti 63 · vuln 46 · cert 14 · leaks 14 · cert_fr 4.
  - Natures : ambient_signal 111 · confirmed_incident 30.
- **Sources actives** (20) : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev … (+8).
- **Organisations citées** (1) : lyon.co.uk (#2423931).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité intermarche, altillac ; jetons de lieu altillac ; 141 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 2 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
- **Verdict** : **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-013` — Magasins de grande distribution touchés en Béarn et Soule (dont Intermarché Pau et Monein)
- **Fait** : autre, 2026-10-12 · Pau (64).
- **Instantané** : J-21 = 2026-09-21 ; fenêtre [2026-09-01, 2026-09-21] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 141 (1920 événements plus anciens comptés, non détaillés).
  - Familles : cti 63 · vuln 46 · cert 14 · leaks 14 · cert_fr 4.
  - Natures : ambient_signal 111 · confirmed_incident 30.
- **Sources actives** (20) : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev … (+8).
- **Organisations citées** (1) : lyon.co.uk (#2423931).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité magasins, grande, distribution, touches, bearn, soule, intermarche, pau, monein ; jetons de lieu pau ; 141 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 2 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
- **Verdict** : **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-014` — Coaxis
- **Fait** : ransomware, 2023-12-07 · Marmande (47).
- **Instantané** : J-21 = 2023-11-16 ; fenêtre [2023-10-27, 2023-11-16] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 16 (924 événements plus anciens comptés, non détaillés).
  - Familles : vuln 13 · cert 2 · cti 1.
  - Natures : confirmed_incident 13 · ambient_signal 3.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité coaxis ; jetons de lieu marmande ; 16 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-015` — Mairie de Sarran
- **Fait** : phishing, 2024-09-01 · Sarran (19).
- **Instantané** : J-21 = 2024-08-11 ; fenêtre [2024-07-22, 2024-08-11] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 10 (1103 événements plus anciens comptés, non détaillés).
  - Familles : vuln 7 · cert 1 · cert_fr 1 · cti 1.
  - Natures : confirmed_incident 7 · ambient_signal 3.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité sarran ; jetons de lieu sarran ; 10 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-016` — Fédération Nationale des Chasseurs / chasseurs charentais
- **Fait** : fuite, 2026-01-20 · Angoulême (16).
- **Instantané** : J-21 = 2025-12-30 ; fenêtre [2025-12-10, 2025-12-30] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 9 (1443 événements plus anciens comptés, non détaillés).
  - Familles : vuln 6 · cert 2 · cti 1.
  - Natures : confirmed_incident 6 · ambient_signal 3.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité nationale, chasseurs, chasseurs, charentais ; jetons de lieu angouleme ; 9 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-017` — Ville de Poitiers et Grand Poitiers
- **Fait** : ransomware, 2025-08-29 · Poitiers (86).
- **Instantané** : J-21 = 2025-08-08 ; fenêtre [2025-07-19, 2025-08-08] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 18 (1359 événements plus anciens comptés, non détaillés).
  - Familles : vuln 10 · cert 3 · cert_fr 2 · leaks 2 · cti 1.
  - Natures : confirmed_incident 10 · ambient_signal 8.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (1) : PARTIE SON (#378660).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité poitiers, grand, poitiers ; jetons de lieu poitiers ; 18 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 1 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Incidents de sécurité dans les pare-feux SonicWall (05 août 2025) — rattachement à « PARTIE SON » sans recoupement avec l'entité.
- **Verdict** : **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-018` — Fédération Française de Cyclisme — membres en Nouvelle-Aquitaine
- **Fait** : compromission, 2025-12-09 · Bordeaux (33).
- **Instantané** : J-21 = 2025-11-18 ; fenêtre [2025-10-29, 2025-11-18] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 11 (1427 événements plus anciens comptés, non détaillés).
  - Familles : vuln 10 · leaks 1.
  - Natures : confirmed_incident 10 · ambient_signal 1.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité francaise, cyclisme, membres, nouvelle, aquitaine ; jetons de lieu bordeaux ; 11 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-019` — Delicity — service de livraison de repas disponible à Bordeaux, Pau et Limoges
- **Fait** : fuite, 2026-09-07 · Bordeaux (33).
- **Instantané** : J-21 = 2026-08-17 ; fenêtre [2026-07-28, 2026-08-17] (21 j) ; référence = datePublique.
- **Événements à J-21** : 35 (1733 événements plus anciens comptés, non détaillés).
  - Familles : vuln 20 · cert 8 · cti 7.
  - Natures : ambient_signal 28 · confirmed_incident 7.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité delicity, livraison, repas, disponible, bordeaux, pau, limoges ; jetons de lieu bordeaux ; 35 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-020` — Euskal Moneta (association support de la monnaie locale Eusko)
- **Fait** : compromission, 2026-08-17 · Bayonne (64).
- **Instantané** : J-21 = 2026-07-27 ; fenêtre [2026-07-07, 2026-07-27] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 45 (1698 événements plus anciens comptés, non détaillés).
  - Familles : vuln 32 · cti 6 · cert 4 · cert_fr 3.
  - Natures : ambient_signal 27 · confirmed_incident 18.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité euskal, moneta, support, monnaie, locale, eusko ; jetons de lieu bayonne ; 45 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-021` — SDIS des Landes
- **Fait** : compromission, 2026-07-25 · Mont-de-Marsan (40).
- **Instantané** : J-21 = 2026-07-04 ; fenêtre [2026-06-14, 2026-07-04] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 32 (1652 événements plus anciens comptés, non détaillés).
  - Familles : vuln 26 · cert 3 · cti 3.
  - Natures : ambient_signal 21 · confirmed_incident 11.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité sdis, landes ; jetons de lieu mont, marsan ; 32 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-022` — Institut Bergonié
- **Fait** : fuite, 2026-04-06 · Bordeaux (33).
- **Instantané** : J-21 = 2026-03-16 ; fenêtre [2026-02-24, 2026-03-16] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 22 (1510 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · cert 5 · cti 2 · cert_fr 1.
  - Natures : confirmed_incident 14 · ambient_signal 8.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité institut, bergonie ; jetons de lieu bordeaux ; 22 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-023` — ERNAT (Études Réalisations Négoce Assistance Technique)
- **Fait** : ransomware, 2026-08-07 · Orthez (64).
- **Instantané** : J-21 = 2026-07-17 ; fenêtre [2026-06-27, 2026-07-17] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 34 (1674 événements plus anciens comptés, non détaillés).
  - Familles : vuln 29 · cert 2 · cti 2 · cert_fr 1.
  - Natures : ambient_signal 21 · confirmed_incident 13.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité ernat, etudes, realisations, negoce, assistance, technique ; jetons de lieu orthez ; 34 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-024` — Rectorat de l'académie de Poitiers
- **Fait** : compromission, 2026-08-01 · Poitiers (86).
- **Instantané** : J-21 = 2026-07-11 ; fenêtre [2026-06-21, 2026-07-11] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 32 (1662 événements plus anciens comptés, non détaillés).
  - Familles : vuln 28 · cert 2 · cti 2.
  - Natures : ambient_signal 19 · confirmed_incident 13.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité rectorat, academie, poitiers ; jetons de lieu poitiers ; 32 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-025` — UPPA Alumni — réseau des anciens de l'Université de Pau et des Pays de l'Adour
- **Fait** : fuite, 2026-04-08 · Pau (64).
- **Instantané** : J-21 = 2026-03-18 ; fenêtre [2026-02-26, 2026-03-18] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 20 (1511 événements plus anciens comptés, non détaillés).
  - Familles : vuln 13 · cert 5 · cti 2.
  - Natures : confirmed_incident 13 · ambient_signal 7.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité uppa, alumni, reseau, anciens, universite, pau, pays, adour ; jetons de lieu pau ; 20 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-026` — Réseau Alumni de l'Université de Bordeaux
- **Fait** : fuite, 2026-04-06 · Bordeaux (33).
- **Instantané** : J-21 = 2026-03-16 ; fenêtre [2026-02-24, 2026-03-16] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 22 (1510 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · cert 5 · cti 2 · cert_fr 1.
  - Natures : confirmed_incident 14 · ambient_signal 8.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité reseau, alumni, universite, bordeaux ; jetons de lieu bordeaux ; 22 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-027` — UNSS (Union nationale du sport scolaire) — exfiltration OPUSS
- **Fait** : fuite, 2025-11-15 · Bordeaux (33).
- **Instantané** : J-21 = 2025-10-25 ; fenêtre [2025-10-05, 2025-10-25] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 22 (1414 événements plus anciens comptés, non détaillés).
  - Familles : vuln 15 · cert 4 · cti 3.
  - Natures : confirmed_incident 15 · ambient_signal 7.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité unss, nationale, sport, scolaire, exfiltration, opuss ; jetons de lieu bordeaux ; 22 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-028` — Ville de La Rochelle — fuite via le prestataire Synbird
- **Fait** : fuite, 2025-10-24 · La Rochelle (17).
- **Instantané** : J-21 = 2025-10-03 ; fenêtre [2025-09-13, 2025-10-03] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 13 (1392 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · cti 3 · cert 1 · cert_fr 1.
  - Natures : confirmed_incident 8 · ambient_signal 5.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité rochelle, fuite, via, prestataire, synbird ; jetons de lieu rochelle ; 13 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-029` — Bordeaux Métropole — portail de la taxe de séjour
- **Fait** : fuite, 2026-04-27 · Bordeaux (33).
- **Instantané** : J-21 = 2026-04-06 ; fenêtre [2026-03-17, 2026-04-06] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 27 (1537 événements plus anciens comptés, non détaillés).
  - Familles : vuln 11 · cti 8 · leaks 4 · cert 2 · cert_fr 2.
  - Natures : ambient_signal 16 · confirmed_incident 11.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité bordeaux, metropole, portail, taxe, sejour ; jetons de lieu bordeaux ; 27 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-030` — Ministère de l'Intérieur — intrusion initiale depuis un service local de Charente-Maritime
- **Fait** : compromission, 2025-12-11 (17).
- **Instantané** : J-21 = 2025-11-20 ; fenêtre [2025-10-31, 2025-11-20] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 9 (1427 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · leaks 1.
  - Natures : confirmed_incident 8 · ambient_signal 1.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité ministere, interieur, intrusion, initiale, depuis, local, charente, maritime ; jetons de lieu aucune ; 9 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-031` — Vivaticket France (Chasseneuil-du-Poitou)
- **Fait** : ransomware, 2026-03-02 · Chasseneuil-du-Poitou (86).
- **Instantané** : J-21 = 2026-02-09 ; fenêtre [2026-01-20, 2026-02-09] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 21 (1471 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · cert 3 · cti 3 · cert_fr 1.
  - Natures : confirmed_incident 14 · ambient_signal 7.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité vivaticket, france, chasseneuil, poitou ; jetons de lieu chasseneuil, poitou ; 21 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-032` — Intermarché de Gradignan, Parempuyre, Macau et La Teste-de-Buch
- **Fait** : autre, 2026-10-11 · La Teste-de-Buch (33).
- **Instantané** : J-21 = 2026-09-20 ; fenêtre [2026-08-31, 2026-09-20] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 134 (1910 événements plus anciens comptés, non détaillés).
  - Familles : cti 57 · vuln 47 · cert 14 · leaks 12 · cert_fr 4.
  - Natures : ambient_signal 103 · confirmed_incident 31.
- **Sources actives** (20) : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev … (+8).
- **Organisations citées** (1) : lyon.co.uk (#2423931).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité intermarche, gradignan, parempuyre, macau, teste, buch ; jetons de lieu teste, buch ; 134 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 2 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
- **Verdict** : **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-033` — Supermarchés des Deux-Sèvres (Hyper U Parthenay, Intermarché Saint-Varent et Saint-Maixent-l'École, Super U Champdeniers, Celles-sur-Belle, Leclerc Thouars-Sainte-Verge)
- **Fait** : autre, 2026-10-11 · Parthenay (79).
- **Instantané** : J-21 = 2026-09-20 ; fenêtre [2026-08-31, 2026-09-20] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 134 (1910 événements plus anciens comptés, non détaillés).
  - Familles : cti 57 · vuln 47 · cert 14 · leaks 12 · cert_fr 4.
  - Natures : ambient_signal 103 · confirmed_incident 31.
- **Sources actives** (20) : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev … (+8).
- **Organisations citées** (1) : lyon.co.uk (#2423931).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité supermarches, deux, sevres, hyper, parthenay, intermarche, saint, varent, saint, maixent, ecole, super … (+7) ; jetons de lieu parthenay ; 134 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 2 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
- **Verdict** : **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-034` — Cinq Intermarché de Dordogne (Hautefort, Tocane-Saint-Apre, Port-Sainte-Foy-et-Ponchapt, Trélissac, Saint-Médard-de-Mussidan)
- **Fait** : autre, 2026-10-11 · Hautefort (24).
- **Instantané** : J-21 = 2026-09-20 ; fenêtre [2026-08-31, 2026-09-20] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 134 (1910 événements plus anciens comptés, non détaillés).
  - Familles : cti 57 · vuln 47 · cert 14 · leaks 12 · cert_fr 4.
  - Natures : ambient_signal 103 · confirmed_incident 31.
- **Sources actives** (20) : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev … (+8).
- **Organisations citées** (1) : lyon.co.uk (#2423931).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité cinq, intermarche, dordogne, hautefort, tocane, saint, apre, port, sainte, foy, ponchapt, trelissac … (+3) ; jetons de lieu hautefort ; 134 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 2 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
- **Verdict** : **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-035` — E.Leclerc de Surgères
- **Fait** : autre, 2026-10-11 · Surgères (17).
- **Instantané** : J-21 = 2026-09-20 ; fenêtre [2026-08-31, 2026-09-20] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 134 (1910 événements plus anciens comptés, non détaillés).
  - Familles : cti 57 · vuln 47 · cert 14 · leaks 12 · cert_fr 4.
  - Natures : ambient_signal 103 · confirmed_incident 31.
- **Sources actives** (20) : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev … (+8).
- **Organisations citées** (1) : lyon.co.uk (#2423931).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité leclerc, surgeres ; jetons de lieu surgeres ; 134 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 2 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
- **Verdict** : **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-036` — Magasins de la Vienne (Intermarché Chauvigny et Gençay, Super U Vouillé, Leclerc Poitiers, Auchan Saint-Genest-d'Ambière)
- **Fait** : autre, 2026-10-11 · Poitiers (86).
- **Instantané** : J-21 = 2026-09-20 ; fenêtre [2026-08-31, 2026-09-20] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 134 (1910 événements plus anciens comptés, non détaillés).
  - Familles : cti 57 · vuln 47 · cert 14 · leaks 12 · cert_fr 4.
  - Natures : ambient_signal 103 · confirmed_incident 31.
- **Sources actives** (20) : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev … (+8).
- **Organisations citées** (1) : lyon.co.uk (#2423931).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité magasins, vienne, intermarche, chauvigny, gencay, super, vouille, leclerc, poitiers, auchan, saint, genest … (+1) ; jetons de lieu poitiers ; 134 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 2 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
- **Verdict** : **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-037` — Super U de Morcenx-la-Nouvelle et Carrefour Express de Rion-des-Landes
- **Fait** : autre, 2026-10-11 · Morcenx-la-Nouvelle (40).
- **Instantané** : J-21 = 2026-09-20 ; fenêtre [2026-08-31, 2026-09-20] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 134 (1910 événements plus anciens comptés, non détaillés).
  - Familles : cti 57 · vuln 47 · cert 14 · leaks 12 · cert_fr 4.
  - Natures : ambient_signal 103 · confirmed_incident 31.
- **Sources actives** (20) : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev … (+8).
- **Organisations citées** (1) : lyon.co.uk (#2423931).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité super, morcenx, nouvelle, carrefour, express, rion, landes ; jetons de lieu morcenx, nouvelle ; 134 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 2 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
- **Verdict** : **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-038` — Intermarché et Carrefour Market de Marmande
- **Fait** : autre, 2026-10-11 · Marmande (47).
- **Instantané** : J-21 = 2026-09-20 ; fenêtre [2026-08-31, 2026-09-20] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 134 (1910 événements plus anciens comptés, non détaillés).
  - Familles : cti 57 · vuln 47 · cert 14 · leaks 12 · cert_fr 4.
  - Natures : ambient_signal 103 · confirmed_incident 31.
- **Sources actives** (20) : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev … (+8).
- **Organisations citées** (1) : lyon.co.uk (#2423931).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité intermarche, carrefour, market, marmande ; jetons de lieu marmande ; 134 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 2 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
- **Verdict** : **rien** — 2 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-039` — Cerballiance — réseau de laboratoires de biologie médicale
- **Fait** : fuite, 2026-03-25 (33).
- **Instantané** : J-21 = 2026-03-04 ; fenêtre [2026-02-12, 2026-03-04] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 19 (1495 événements plus anciens comptés, non détaillés).
  - Familles : vuln 12 · cert 3 · cti 3 · cert_fr 1.
  - Natures : confirmed_incident 12 · ambient_signal 7.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité cerballiance, reseau, laboratoires, biologie, medicale ; jetons de lieu aucune ; 19 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-040` — Cegedim Santé — logiciel MonLogicielMedical (MLM)
- **Fait** : fuite, 2025-10-27 (33).
- **Instantané** : J-21 = 2025-10-06 ; fenêtre [2025-09-16, 2025-10-06] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 20 (1399 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · cti 3 · cert 2 · cert_fr 1.
  - Natures : confirmed_incident 14 · ambient_signal 6.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité cegedim, sante, logiciel, monlogicielmedical, mlm ; jetons de lieu aucune ; 20 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-041` — Polyclinique Bordeaux Nord Aquitaine
- **Fait** : fuite, 2026-04-06 · Bordeaux (33).
- **Instantané** : J-21 = 2026-03-16 ; fenêtre [2026-02-24, 2026-03-16] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 22 (1510 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · cert 5 · cti 2 · cert_fr 1.
  - Natures : confirmed_incident 14 · ambient_signal 8.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité polyclinique, bordeaux, nord, aquitaine ; jetons de lieu bordeaux ; 22 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-042` — Ville de Limoges — centre de vaccination municipal et campagne HPV
- **Fait** : fuite, 2026-06-22 · Limoges (87).
- **Instantané** : J-21 = 2026-06-01 ; fenêtre [2026-05-12, 2026-06-01] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 24 (1603 événements plus anciens comptés, non détaillés).
  - Familles : vuln 15 · cert 4 · cti 3 · cert_fr 1 · leaks 1.
  - Natures : confirmed_incident 15 · ambient_signal 9.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité limoges, vaccination, municipal, campagne, hpv ; jetons de lieu limoges ; 24 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-043` — Weda — logiciel médical (cabinets touchés jusqu'en Charente)
- **Fait** : compromission, 2025-11-10 · Angoulême (16).
- **Instantané** : J-21 = 2025-10-20 ; fenêtre [2025-09-30, 2025-10-20] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 22 (1409 événements plus anciens comptés, non détaillés).
  - Familles : vuln 16 · cert 3 · cti 3.
  - Natures : confirmed_incident 16 · ambient_signal 6.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité weda, logiciel, medical, cabinets, touches, jusqu, charente ; jetons de lieu angouleme ; 22 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-044` — FFRandonnée — fichier adhérents
- **Fait** : fuite, 2026-02-05 · Angoulême (16).
- **Instantané** : J-21 = 2026-01-15 ; fenêtre [2025-12-26, 2026-01-15] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 6 (1449 événements plus anciens comptés, non détaillés).
  - Familles : vuln 3 · cert 2 · leaks 1.
  - Natures : ambient_signal 3 · confirmed_incident 3.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité ffrandonnee, fichier, adherents ; jetons de lieu angouleme ; 6 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-045` — Association des maires de France (AMF)
- **Fait** : fuite, 2026-09-04 (33).
- **Instantané** : J-21 = 2026-08-14 ; fenêtre [2026-07-25, 2026-08-14] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 38 (1731 événements plus anciens comptés, non détaillés).
  - Familles : vuln 22 · cert 8 · cti 8.
  - Natures : ambient_signal 30 · confirmed_incident 8.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité maires, france, amf ; jetons de lieu aucune ; 38 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-046` — Office français de la biodiversité — fichier des permis de chasser
- **Fait** : fuite, 2026-01-28 · Angoulême (16).
- **Instantané** : J-21 = 2026-01-07 ; fenêtre [2025-12-18, 2026-01-07] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 5 (1446 événements plus anciens comptés, non détaillés).
  - Familles : vuln 3 · cert 2.
  - Natures : confirmed_incident 3 · ambient_signal 2.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité francais, biodiversite, fichier, permis, chasser ; jetons de lieu angouleme ; 5 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-047` — Université de Pau et des Pays de l'Adour (UPPA) — revendication Nova
- **Fait** : ransomware, 2025-09-29 · Pau (64).
- **Instantané** : J-21 = 2025-09-08 ; fenêtre [2025-08-19, 2025-09-08] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 14 (1378 événements plus anciens comptés, non détaillés).
  - Familles : vuln 10 · cert 1 · cert_fr 1 · leaks 1 · ransomware 1.
  - Natures : confirmed_incident 10 · ambient_signal 4.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité universite, pau, pays, adour, uppa, revendication, nova ; jetons de lieu pau ; 14 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : TITRE_TRONQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-048` — Ville de Bergerac — QR codes des horodateurs (quishing)
- **Fait** : phishing, 2025-08-11 · Bergerac (24).
- **Instantané** : J-21 = 2025-07-21 ; fenêtre [2025-07-01, 2025-07-21] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 10 (1344 événements plus anciens comptés, non détaillés).
  - Familles : vuln 4 · cert 2 · cert_fr 2 · cti 2.
  - Natures : ambient_signal 6 · confirmed_incident 4.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité bergerac, codes, horodateurs, quishing ; jetons de lieu bergerac ; 10 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-049` — Mairie de Berson
- **Fait** : ransomware, 2025-02-21 · Berson (33).
- **Instantané** : J-21 = 2025-01-31 ; fenêtre [2025-01-11, 2025-01-31] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 11 (1217 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · cert 2 · cert_fr 1.
  - Natures : confirmed_incident 8 · ambient_signal 3.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité berson ; jetons de lieu berson ; 11 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-050` — Fédération française de tir (FFTir) — retombées en Haute-Vienne
- **Fait** : fuite, 2025-10-18 · Limoges (87).
- **Instantané** : J-21 = 2025-09-27 ; fenêtre [2025-09-07, 2025-09-27] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 6 (1384 événements plus anciens comptés, non détaillés).
  - Familles : vuln 3 · cert 1 · cert_fr 1 · cti 1.
  - Natures : ambient_signal 3 · confirmed_incident 3.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité francaise, tir, fftir, retombees, haute, vienne ; jetons de lieu limoges ; 6 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-051` — Arsoé de Soual — plateforme Synel d'identification des bovins et ovins
- **Fait** : ransomware, 2024-12-15 · Limoges (87).
- **Instantané** : J-21 = 2024-11-24 ; fenêtre [2024-11-04, 2024-11-24] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 17 (1182 événements plus anciens comptés, non détaillés).
  - Familles : vuln 12 · cert 3 · cert_fr 1 · leaks 1.
  - Natures : confirmed_incident 12 · ambient_signal 5.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité arsoe, soual, plateforme, synel, identification, bovins, ovins ; jetons de lieu limoges ; 17 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-052` — Camping municipal d'Évaux-les-Bains
- **Fait** : defacement, 2025-06-20 · Évaux-les-Bains (23).
- **Instantané** : J-21 = 2025-05-30 ; fenêtre [2025-05-10, 2025-05-30] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 16 (1311 événements plus anciens comptés, non détaillés).
  - Familles : vuln 11 · cert_fr 2 · cert 1 · cti 1 · leaks 1.
  - Natures : confirmed_incident 11 · ambient_signal 5.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité camping, municipal, evaux, bains ; jetons de lieu evaux, bains ; 16 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-053` — GoCap (Mostiglass) — Hinx
- **Fait** : autre, 2022-01-01 · Hinx (40).
- **Instantané** : J-21 = 2021-12-11 ; fenêtre [2021-11-21, 2021-12-11] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 15 (263 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · cert 1.
  - Natures : confirmed_incident 14 · ambient_signal 1.
- **Sources actives** (6) : cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-marketo-leaks.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité gocap, mostiglass, hinx ; jetons de lieu hinx ; 15 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-054` — Artiga — atelier de linge basque à Magescq
- **Fait** : phishing, 2025-08-26 · Magescq (40).
- **Instantané** : J-21 = 2025-08-05 ; fenêtre [2025-07-16, 2025-08-05] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 18 (1358 événements plus anciens comptés, non détaillés).
  - Familles : vuln 11 · cert 3 · cert_fr 2 · cti 1 · leaks 1.
  - Natures : confirmed_incident 11 · ambient_signal 7.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (1) : PARTIE SON (#378660).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité artiga, atelier, linge, basque, magescq ; jetons de lieu magescq ; 18 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 1 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Incidents de sécurité dans les pare-feux SonicWall (05 août 2025) — rattachement à « PARTIE SON » sans recoupement avec l'entité.
- **Verdict** : **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-2026-055` — Université de Limoges — vol de données personnelles par un agent
- **Fait** : fuite, 2023-09-01 · Limoges (87).
- **Instantané** : J-21 = 2023-08-11 ; fenêtre [2023-07-22, 2023-08-11] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 13 (869 événements plus anciens comptés, non détaillés).
  - Familles : cti 9 · vuln 4.
  - Natures : ambient_signal 9 · confirmed_incident 4.
- **Sources actives** (10) : cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité universite, limoges, vol, donnees, personnelles, par, agent ; jetons de lieu limoges ; 13 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : TITRE_TRONQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-056` — Aéroport Pau-Pyrénées et écoles Eklore (CCI Pau Béarn)
- **Fait** : compromission, 2024-05-13 · Pau (64).
- **Instantané** : J-21 = 2024-04-22 ; fenêtre [2024-04-02, 2024-04-22] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 8 (1040 événements plus anciens comptés, non détaillés).
  - Familles : cert 4 · vuln 2 · cert_fr 1 · cti 1.
  - Natures : ambient_signal 6 · confirmed_incident 2.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité aeroport, pau, pyrenees, ecoles, eklore, cci, pau, bearn ; jetons de lieu pau ; 8 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-057` — Sites internet des villes de Bordeaux et Pau et du département des Landes (DDoS)
- **Fait** : ddos, 2024-12-31 · Bordeaux (33).
- **Instantané** : J-21 = 2024-12-10 ; fenêtre [2024-11-20, 2024-12-10] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 10 (1187 événements plus anciens comptés, non détaillés).
  - Familles : vuln 6 · cert 2 · cti 1 · leaks 1.
  - Natures : confirmed_incident 6 · ambient_signal 4.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité sites, internet, villes, bordeaux, pau, landes, ddos ; jetons de lieu bordeaux ; 10 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-058` — SPSTI 16 — service de prévention et de santé au travail interentreprises de la Charente
- **Fait** : ransomware, 2024-05-10 · Angoulême (16).
- **Instantané** : J-21 = 2024-04-19 ; fenêtre [2024-03-30, 2024-04-19] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 8 (1040 événements plus anciens comptés, non détaillés).
  - Familles : cert 4 · vuln 2 · cert_fr 1 · cti 1.
  - Natures : ambient_signal 6 · confirmed_incident 2.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité spsti, prevention, sante, travail, interentreprises, charente ; jetons de lieu angouleme ; 8 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-059` — Centre hospitalier de Girac (Angoulême)
- **Fait** : compromission, 2025-07-24 · Angoulême (16).
- **Instantané** : J-21 = 2025-07-03 ; fenêtre [2025-06-13, 2025-07-03] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 15 (1337 événements plus anciens comptés, non détaillés).
  - Familles : vuln 7 · cti 4 · cert 3 · cert_fr 1.
  - Natures : ambient_signal 8 · confirmed_incident 7.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité hospitalier, girac, angouleme ; jetons de lieu angouleme ; 15 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-2026-060` — Cdiscount — extraction frauduleuse de données clients (Cestas)
- **Fait** : fuite, 2020-12-01 · Cestas (33).
- **Instantané** : J-21 = 2020-11-10 ; fenêtre [2020-10-21, 2020-11-10] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 0 (20 événements plus anciens comptés, non détaillés).
  - Familles : 0 (fenêtre vide).
  - Natures : 0.
- **Sources actives** (4) : cat-ncsc-nl-news, cert-fr-alerte, leak:ddosecrets:rss, tg-itsecalert.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité cdiscount, extraction, frauduleuse, donnees, clients, cestas ; jetons de lieu cestas ; 0 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — fenêtre vide, aucun événement enregistré à J-21.

## 6. Presque-signaux et faux positifs

Les rattachements d'organisation sont le seul endroit où un signal aurait pu apparaître par erreur.
Ils sont listés ici avec le motif exact du rejet.

| Incident | Organisation(s) | Titre de l'événement | Motif du rejet |
|---|---|---|---|
| `na-2026-004` | OPEN SOURCE | Kritieke SQL-injectie in GeoTools open source Java-bibliotheek: update onmiddellijk | rattachement à « OPEN SOURCE » sans recoupement avec l'entité |
| `na-2026-009` | OPEN SOURCE | Kritieke SQL-injectie in GeoTools open source Java-bibliotheek: update onmiddellijk | rattachement à « OPEN SOURCE » sans recoupement avec l'entité |
| `na-2026-012` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-012` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-013` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-013` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-017` | PARTIE SON | Incidents de sécurité dans les pare-feux SonicWall (05 août 2025) | rattachement à « PARTIE SON » sans recoupement avec l'entité |
| `na-2026-032` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-032` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-033` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-033` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-034` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-034` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-035` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-035` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-036` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-036` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-037` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-037` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-038` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-038` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |
| `na-2026-054` | PARTIE SON | Incidents de sécurité dans les pare-feux SonicWall (05 août 2025) | rattachement à « PARTIE SON » sans recoupement avec l'entité |

Motifs, agrégés :

- 18 × rattachement à « lyon.co.uk » sans recoupement avec l'entité
- 2 × rattachement à « OPEN SOURCE » sans recoupement avec l'entité
- 2 × rattachement à « PARTIE SON » sans recoupement avec l'entité

## 7. Cas d'erreur, états vides et anomalies détectées

Le script distingue les erreurs bloquantes (le document serait faux) des anomalies signalées
(le document reste publiable mais sa limite est explicite).

**Erreurs bloquantes** : corpus illisible ou sans tableau `incidents` ; ligne JSONL illisible ;
identifiant manquant, dupliqué ou inconnu ; instantané manquant pour un incident du corpus ;
date de référence absente ou invalide ; fenêtre J-21 mal formée. Le script s'arrête avec un code
d'erreur explicite au lieu de publier un chiffre partiel.

**États vides pris en charge** : corpus vide (document « mesure vide », pas « 0 % ») ; fenêtre
sans événement (dossier « rien — fenêtre vide ») ; aucune source active ; aucune organisation citée ;
aucun signal, aucun candidat et aucune rupture (listes vides affichées comme telles). Aucune division
par zéro : médiane et pourcentage passent par `resumerAnticipation`, qui les rend `null`/`0`.

**Contrôles appliqués aux entrées** : cohérence des comptes, dates dans la fenêtre, source et
organisation présentes dans les listes, nature d'assertion connue, titre complet ou tronqué.

**9 anomalie(s) signalée(s)** :

| Code | Nombre | Exemples |
|---|---:|---|
| `TITRE_TRONQUE` | 8 | na-2026-007 : événement 129067 : titre tronqué à 200 caractères ; na-2026-047 : événement 129067 : titre tronqué à 200 caractères ; na-2026-055 : événement 129112 : titre tronqué à 200 caractères |
| `DATE_PUBLIQUE` | 1 | na-2026-019 : aucune date d'incident : J-21 calculé depuis la date de publication |

Fenêtres partagées : plusieurs incidents peuvent avoir le même J-21, donc exactement la même
fenêtre d'observation. Leurs verdicts ne sont pas indépendants et ne doivent pas être comptés
comme des confirmations mutuelles.

| J-21 | Incidents |
|---|---|
| 2026-09-20 | `na-2026-032`, `na-2026-033`, `na-2026-034`, `na-2026-035`, `na-2026-036`, `na-2026-037`, `na-2026-038` |
| 2026-03-16 | `na-2026-001`, `na-2026-022`, `na-2026-026`, `na-2026-041` |
| 2026-07-27 | `na-2026-002`, `na-2026-020` |
| 2026-09-21 | `na-2026-012`, `na-2026-013` |

## 8. Pourquoi ce zéro

1. **Couverture.** Les incidents du corpus sont révélés par la presse locale et régionale
   (Sud Ouest, France 3 Nouvelle-Aquitaine, Charente Libre, La Nouvelle République) puis par des
   communiqués d'établissements. Les sources actives des fenêtres sont : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, leak:hibp:breaches-index, leak:hibp:latest-breaches, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews. Aucune n'est un média local de Nouvelle-Aquitaine : l'information qui aurait pu alerter
   n'était pas dans le système à J-21.
2. **Nature des données.** Sur 2257 événements examinés : technical_indicator 0, third_party_claim 0, alerte 0. Les natures les plus proches d'un avertissement sont absentes de l'instantané.
3. **Le rattachement automatique ne compense pas.** 22 rattachements
   sur 13 incidents viennent de trois motifs : « OPEN SOURCE » (avis CERT-NL sur GeoTools), « lyon.co.uk » (publication HIBP sur Questel) et « PARTIE SON »
   (avis CERT-FR sur SonicWall). Aucun ne désigne une entité du corpus. Les compter comme des
   signaux ferait passer le taux de 0/60 à 13/60 avec du bruit pur.

## 9. Limites et conditions de changement

- Les titres de l'instantané sont tronqués à 200 caractères : une mention en fin de titre
  pourrait échapper au crible.
- Les événements antérieurs à la fenêtre sont comptés mais non détaillés : un signal très ancien
  ne peut pas être retrouvé par ce document.
- L'instantané ne contient ni indicateur technique, ni revendication tierce, ni alerte, ni historique
  de première apparition d'organisation : trois des quatre pistes de détection sont donc vides par
  construction, et la quatrième est partielle.
- Une fenêtre partagée réduit le nombre d'observations réellement indépendantes.
- Le défaut est de couverture, pas de modèle : classer du bruit avec un score ne créerait pas de signal.
- Pour faire changer le verdict : brancher des sources locales et régionales, extraire les entités
  et alias, capter indicateurs et revendications, puis régénérer l'instantané et relancer ce script.

## 10. Reproduction

```bash
# régénérer l'instantané depuis PostgreSQL (schéma avec event.valid_at requis) :
apps/api/node_modules/.bin/tsx scripts/anticipation.mts
# produire / vérifier ce document sans base :
apps/api/node_modules/.bin/tsx scripts/rapport-anticipation.mts
apps/api/node_modules/.bin/tsx scripts/rapport-anticipation.mts --verifier
```

Le résultat est déterministe : mêmes entrées (empreintes ci-dessus), même octets en sortie.
