# Motifs d'absence — incidents non vus

Corpus `bench/fixtures/corpus-reference-na.json` — 60 incidents — SHA-256 `a6634b37f84e896f2c3395e21004aea8d289e6b6362f3908a64bdcd017cdd995`.
Base : 312 sources, 7695 exécutions, 26688 événements, 4710 archivés — empreinte `c915887087579628505f26db91237d6592dc247af772e60561478bc50e6c6ae1`.
Historique de collecte en base : 2026-11-13 → 2026-11-21 ; en dehors de cette fenêtre, « pas collecté » signifie « aucune preuve de collecte ce jour-là ».

0 vus, 60 non vus : pas_collecte 60, pas_juge_cyber 0, pas_rattache 0, indetermine 0.
Sur ces non vus : 40 sources déclarées, 0 collectées le jour de publication, 0 événements sans org, 6 refus du filtre cyber.

Classement : la source est-elle déclarée et collectée le jour de publication ; un événement existe-t-il sans `org_id` ; le filtre cyber renvoie-t-il `presse`. Priorité : événement rattaché → événement sans org → filtre refusé (si collecté) → absence de collecte → indéterminé.

| Incident | Entité | Publication | Motif | Source collectée ce jour | Événement sans org | Filtre cyber | Preuve |
| --- | --- | --- | --- | --- | --- | --- | --- |
| na-2026-001 | Ymed (éditeur de la plateforme Sooncare) | 2026-04-09 | pas collecté | non | non | non (cti) | aucune collecte le 2026-04-09 (0 exécution(s)) |
| na-2026-002 | Mairie de Marennes-Hiers-Brouage | 2026-08-19 | pas collecté | non | non | non (cti) | aucune collecte le 2026-08-19 (0 exécution(s)) |
| na-2026-003 | Ville de Tarnos | 2026-08-29 | pas collecté | non | non | non (cti) | aucune collecte le 2026-08-29 (0 exécution(s)) |
| na-2026-004 | Mairie d'Espelette | 2026-09-16 | pas collecté | non | non | non (cti) | aucune collecte le 2026-09-16 (0 exécution(s)) |
| na-2026-005 | EHPAD Résidence du Parc de Champdeniers | 2025-12-11 | pas collecté | non | non | non (cti) | aucune collecte le 2025-12-11 (0 exécution(s)) |
| na-2026-006 | Ville de Gradignan — police municipale | 2026-05-13 | pas collecté | non | non | non (cti) | aucune collecte le 2026-05-13 (0 exécution(s)) |
| na-2026-007 | Mairie de Fumel | 2025-10-03 | pas collecté | non | non | non (cti) | aucune collecte le 2025-10-03 (0 exécution(s)) |
| na-2026-008 | Collège privé La Salle de Brive-la-Gaillarde | 2025-02-14 | pas collecté | non | non | non (cti) | aucune collecte le 2025-02-14 (0 exécution(s)) |
| na-2026-009 | Bordeaux Sciences Agro | 2026-09-15 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-010 | Vignobles Toutigeac | 2026-07-16 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-011 | SICSOE (Solution Vin Logistique) | 2026-07-23 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-012 | Intermarché d'Altillac | 2026-10-13 | pas collecté | non | non | non (cti) | aucune collecte le 2026-10-13 (0 exécution(s)) |
| na-2026-013 | Magasins de grande distribution touchés en Béarn et Soule (dont Intermarché Pau et Monein) | 2026-10-12 | pas collecté | non | non | non (cti) | aucune collecte le 2026-10-12 (0 exécution(s)) |
| na-2026-014 | Coaxis | 2026-11-10 | pas collecté | non | non | non (cti) | aucune collecte le 2026-11-10 (0 exécution(s)) |
| na-2026-015 | Mairie de Sarran | 2025-06-20 | pas collecté | non | non | non (cti) | aucune collecte le 2025-06-20 (0 exécution(s)) |
| na-2026-016 | Fédération Nationale des Chasseurs / chasseurs charentais | 2026-01-22 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-017 | Ville de Poitiers et Grand Poitiers | 2025-09-05 | pas collecté | non | non | oui (presse → presse) | aucune collecte le 2025-09-05 (0 exécution(s)) |
| na-2026-018 | Fédération Française de Cyclisme — membres en Nouvelle-Aquitaine | 2025-12-10 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-019 | Delicity — service de livraison de repas disponible à Bordeaux, Pau et Limoges | 2026-09-07 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-020 | Euskal Moneta (association support de la monnaie locale Eusko) | 2026-08-28 | pas collecté | non | non | non (cti) | aucune collecte le 2026-08-28 (0 exécution(s)) |
| na-2026-021 | SDIS des Landes | 2026-07-27 | pas collecté | non | non | non (cti) | aucune collecte le 2026-07-27 (0 exécution(s)) |
| na-2026-022 | Institut Bergonié | 2026-04-09 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-023 | ERNAT (Études Réalisations Négoce Assistance Technique) | 2026-08-07 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-024 | Rectorat de l'académie de Poitiers | 2026-08-31 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-025 | UPPA Alumni — réseau des anciens de l'Université de Pau et des Pays de l'Adour | 2026-04-10 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-026 | Réseau Alumni de l'Université de Bordeaux | 2026-04-10 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-027 | UNSS (Union nationale du sport scolaire) — exfiltration OPUSS | 2026-03-02 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-028 | Ville de La Rochelle — fuite via le prestataire Synbird | 2025-11-24 | pas collecté | non | non | non (cti) | aucune collecte le 2025-11-24 (0 exécution(s)) |
| na-2026-029 | Bordeaux Métropole — portail de la taxe de séjour | 2026-04-27 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-030 | Ministère de l'Intérieur — intrusion initiale depuis un service local de Charente-Maritime | 2025-12-12 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-031 | Vivaticket France (Chasseneuil-du-Poitou) | 2026-03-15 | pas collecté | non | non | non (cti) | aucune collecte le 2026-03-15 (0 exécution(s)) |
| na-2026-032 | Intermarché de Gradignan, Parempuyre, Macau et La Teste-de-Buch | 2026-10-13 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-033 | Supermarchés des Deux-Sèvres (Hyper U Parthenay, Intermarché Saint-Varent et Saint-Maixent-l'École, Super U Champdeniers, Celles-sur-Belle, Leclerc Thouars-Sainte-Verge) | 2026-10-12 | pas collecté | non | non | non (cti) | aucune collecte le 2026-10-12 (0 exécution(s)) |
| na-2026-034 | Cinq Intermarché de Dordogne (Hautefort, Tocane-Saint-Apre, Port-Sainte-Foy-et-Ponchapt, Trélissac, Saint-Médard-de-Mussidan) | 2026-10-12 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-035 | E.Leclerc de Surgères | 2026-10-12 | pas collecté | non | non | non (cti) | aucune collecte le 2026-10-12 (0 exécution(s)) |
| na-2026-036 | Magasins de la Vienne (Intermarché Chauvigny et Gençay, Super U Vouillé, Leclerc Poitiers, Auchan Saint-Genest-d'Ambière) | 2026-10-12 | pas collecté | non | non | non (cti) | aucune collecte le 2026-10-12 (0 exécution(s)) |
| na-2026-037 | Super U de Morcenx-la-Nouvelle et Carrefour Express de Rion-des-Landes | 2026-10-12 | pas collecté | non | non | non (cti) | aucune collecte le 2026-10-12 (0 exécution(s)) |
| na-2026-038 | Intermarché et Carrefour Market de Marmande | 2026-10-12 | pas collecté | non | non | non (cti) | aucune collecte le 2026-10-12 (0 exécution(s)) |
| na-2026-039 | Cerballiance — réseau de laboratoires de biologie médicale | 2026-03-28 | pas collecté | non | non | non (cti) | aucune collecte le 2026-03-28 (0 exécution(s)) |
| na-2026-040 | Cegedim Santé — logiciel MonLogicielMedical (MLM) | 2026-02-26 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-041 | Polyclinique Bordeaux Nord Aquitaine | 2026-04-09 | pas collecté | non | non | non (cti) | aucune collecte le 2026-04-09 (0 exécution(s)) |
| na-2026-042 | Ville de Limoges — centre de vaccination municipal et campagne HPV | 2026-06-26 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-043 | Weda — logiciel médical (cabinets touchés jusqu'en Charente) | 2025-11-13 | pas collecté | non | non | non (cti) | aucune collecte le 2025-11-13 (0 exécution(s)) |
| na-2026-044 | FFRandonnée — fichier adhérents | 2026-02-05 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-045 | Association des maires de France (AMF) | 2026-09-04 | pas collecté | source non déclarée | non | — | média absent de la table source |
| na-2026-046 | Office français de la biodiversité — fichier des permis de chasser | 2026-02-22 | pas collecté | non | non | non (cti) | aucune collecte le 2026-02-22 (0 exécution(s)) |
| na-2026-047 | Université de Pau et des Pays de l'Adour (UPPA) — revendication Nova | 2025-09-29 | pas collecté | non | non | oui (presse → presse) | aucune collecte le 2025-09-29 (0 exécution(s)) |
| na-2026-048 | Ville de Bergerac — QR codes des horodateurs (quishing) | 2025-08-11 | pas collecté | non | non | oui (cti → presse) | aucune collecte le 2025-08-11 (0 exécution(s)) |
| na-2026-049 | Mairie de Berson | 2025-02-28 | pas collecté | non | non | non (cti) | aucune collecte le 2025-02-28 (0 exécution(s)) |
| na-2026-050 | Fédération française de tir (FFTir) — retombées en Haute-Vienne | 2025-10-23 | pas collecté | non | non | non (cti) | aucune collecte le 2025-10-23 (0 exécution(s)) |
| na-2026-051 | Arsoé de Soual — plateforme Synel d'identification des bovins et ovins | 2024-12-31 | pas collecté | non | non | non (cti) | aucune collecte le 2024-12-31 (0 exécution(s)) |
| na-2026-052 | Camping municipal d'Évaux-les-Bains | 2025-07-11 | pas collecté | non | non | non (cti) | aucune collecte le 2025-07-11 (0 exécution(s)) |
| na-2026-053 | GoCap (Mostiglass) — Hinx | 2025-02-20 | pas collecté | non | non | oui (cti → presse) | aucune collecte le 2025-02-20 (0 exécution(s)) |
| na-2026-054 | Artiga — atelier de linge basque à Magescq | 2025-10-06 | pas collecté | non | non | oui (cti → presse) | aucune collecte le 2025-10-06 (0 exécution(s)) |
| na-2026-055 | Université de Limoges — vol de données personnelles par un agent | 2025-06-27 | pas collecté | non | non | non (cti) | aucune collecte le 2025-06-27 (0 exécution(s)) |
| na-2026-056 | Aéroport Pau-Pyrénées et écoles Eklore (CCI Pau Béarn) | 2024-05-15 | pas collecté | non | non | non (cti) | aucune collecte le 2024-05-15 (0 exécution(s)) |
| na-2026-057 | Sites internet des villes de Bordeaux et Pau et du département des Landes (DDoS) | 2025-01-02 | pas collecté | non | non | non (cti) | aucune collecte le 2025-01-02 (0 exécution(s)) |
| na-2026-058 | SPSTI 16 — service de prévention et de santé au travail interentreprises de la Charente | 2024-06-14 | pas collecté | non | non | non (cti) | aucune collecte le 2024-06-14 (0 exécution(s)) |
| na-2026-059 | Centre hospitalier de Girac (Angoulême) | 2025-09-09 | pas collecté | non | non | non (cti) | aucune collecte le 2025-09-09 (0 exécution(s)) |
| na-2026-060 | Cdiscount — extraction frauduleuse de données clients (Cestas) | 2025-12-09 | pas collecté | non | non | oui (presse → presse) | aucune collecte le 2025-12-09 (0 exécution(s)) |
