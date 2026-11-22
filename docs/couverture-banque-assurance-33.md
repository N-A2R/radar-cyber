# Couverture « banque-assurance » — Gironde (33)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `banque-assurance` / département `33`.

## Résultat

- **27 sources intégrées** (`bench/corpus/sources-banque-assurance-33.jsonl`, une ligne JSON par source).
- **75 URL uniques contrôlées** : sites, pages d'actualités, flux RSS et articles cyber — **75 réponses HTTP 200**, aucune 403/404 retenue.
- **27 lignes `source`** et **27 lignes `source_verification`** (`code_http = 200`, `etat = 'ok200'`) créées en base par `db/migrate-093-sources-banque-assurance-33.sql`. Toutes portent `department = '33'` et `region = 'Nouvelle-Aquitaine'`.
- Ventilation : 18 sources `cti` et 9 sources `presse`.
- Preuve HTTP détaillée : `bench/results/verification-banque-assurance-33.json`.

OBJECTIF : atteint — 27 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CMA Nouvelle-Aquitaine — délégation de la Gironde | chambre consulaire (CMA) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| CPAM de la Gironde (Assurance Maladie) | organisme de protection sociale | https://www.assurance-maladie.ameli.fr/actualites-et-publications/actualites/nouvelle-aquitaine | — |
| Carsat Aquitaine | caisse d'assurance retraite | https://www.carsat-aquitaine.fr/home/actif/actualites-actif.html | — |
| MSA Gironde | caisse de mutualité sociale agricole | https://gironde.msa.fr/lfp/actualites-particulier | — |
| Mutualité Française Nouvelle-Aquitaine | union régionale de mutuelles | https://nouvelle-aquitaine.mutualite.fr/actualites/ | https://nouvelle-aquitaine.mutualite.fr/actualites/feed/ |
| Crédit Agricole Aquitaine | banque régionale (caisse régionale de Bordeaux) | https://www.credit-agricole.fr/ca-aquitaine/particulier/conseils/magazine/tout-un-mag.html | — |
| Banque Populaire Aquitaine Centre Atlantique (réseau Bordeaux) | banque régionale | https://www.banquepopulaire.fr/votre-banque/actualites/ | — |
| France Assureurs | fédération professionnelle de l'assurance | https://www.franceassureurs.fr/actualites/ | https://www.franceassureurs.fr/feed/ |
| Fédération Bancaire Française (FBF) | fédération professionnelle bancaire | https://fbf.fr/fr/rubrique-newsroom/actualites/ | — |
| ORIAS — Registre unique des intermédiaires en assurance, banque et finance | registre professionnel | https://www.orias.fr/home/communications | — |
| Mutualité Française (fédération nationale) | fédération nationale de mutuelles | https://www.mutualite.fr/actualites/nos-actualites/ | — |
| ACPR — Autorité de contrôle prudentiel et de résolution | autorité de régulation bancaire et assurantielle | https://acpr.banque-france.fr/fr/actualites | — |
| Crédit Agricole (réseau national) | réseau bancaire mutualiste | https://www.credit-agricole.fr/particulier/cybersecurite/alertes.html | — |
| Caisse d'Épargne (réseau national) | réseau bancaire mutualiste | https://www.caisse-epargne.fr/conseils/ | — |
| Banque Populaire (réseau national) | réseau bancaire mutualiste | https://www.banquepopulaire.fr/conseils/ | — |
| Groupama (réseau national) | compagnie d'assurance mutualiste | https://www.groupama.fr/assurance/conseils/ | — |
| MAIF | compagnie d'assurance mutualiste | https://entreprise.maif.fr/actualites | — |
| SMACL Assurances | compagnie d'assurance mutualiste (secteur public) | https://www.smacl.fr/actus-et-conseils/ | — |
| ICI Gironde | radio locale | https://www.ici.fr/radio/gironde/actu | https://www.ici.fr/rss/gironde/rubrique/infos.xml |
| BFM Bordeaux | média local | https://www.bfmtv.com/bordeaux/page2/ | https://www.bfmtv.com/rss/tech/ |
| actu.fr Gironde | presse locale | https://actu.fr/nouvelle-aquitaine/gironde_33 | https://actu.fr/nouvelle-aquitaine/gironde_33/rss.xml |
| actu.fr Bordeaux | presse locale | https://actu.fr/nouvelle-aquitaine/bordeaux_33063 | — |
| actu.fr Arcachon | presse locale | https://actu.fr/nouvelle-aquitaine/arcachon_33004 | — |
| actu.fr Libourne | presse locale | https://actu.fr/nouvelle-aquitaine/libourne_33243 | — |
| France 3 Nouvelle-Aquitaine — Bordeaux | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde | — |
| France 3 Nouvelle-Aquitaine | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde | — |
| 20 Minutes Bordeaux | presse locale | https://www.20minutes.fr/bordeaux/ | https://www.20minutes.fr/feeds/rss-une.xml |

## Exemples cyber vérifiés

- CMA Nouvelle-Aquitaine — délégation de la Gironde : « Les artisans, des cibles de choix pour les cybercriminels » (200) — https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites/les-artisans-des-cibles-de-choix-pour-les-cybercriminels
- CPAM de la Gironde (Assurance Maladie) : « La lutte contre les fraudes à l'Assurance Maladie se renforce, et ses résultats sont en hausse » (200) — https://www.assurance-maladie.ameli.fr/construire-le-systeme-de-sante-de-demain/nous-luttons-contre-les-fraudes-pour-proteger-le-systeme-de-sante
- Carsat Aquitaine : « Courriels, SMS, sites et appels frauduleux : vigilance ! » (200) — https://www.carsat-aquitaine.fr/home/actif/actualites-actif/toutes%20les%20actualites/courriels-appels-frauduleux.details-actualite.html
- MSA Gironde : « Fraude sur internet ou par téléphone » (200) — https://gironde.msa.fr/lfp/fraude-internet-telephone
- Mutualité Française Nouvelle-Aquitaine : « Cyberattaques : un impact sur la prise en charge des patients » (200) — https://www.mutualite.fr/actualites/cyberattaques-un-impact-sur-la-prise-en-charge-des-patients/
- Crédit Agricole Aquitaine : « Fraudes à la carte de paiement : des conditions de remboursement plus favorables » (200) — https://www.credit-agricole.fr/ca-aquitaine/particulier/conseils/magazine/tout-un-mag/fraudes-a-la-carte-bancaire-en-2018-des-conditions-de-remboursement-plus-favorables.html
- Banque Populaire Aquitaine Centre Atlantique (réseau Bordeaux) : « Pass Cyberplus - double authentification » (200) — https://www.banquepopulaire.fr/votre-banque/securite/pass-cyberplus/
- France Assureurs : « 8e cartographie prospective des risques de l'assurance : cyberattaques en tête des risques » (200) — https://www.franceassureurs.fr/espace-presse/8e-cartographie-prospective-des-risques-assurance-dereglement-climatique-cyberattaques/
- Fédération Bancaire Française (FBF) : « Fraude aux moyens de paiement : un appel aux acteurs du numérique à se mobiliser » (200) — https://fbf.fr/fr/communique_de_presse/fraude-aux-moyens-de-paiements-un-appel-aux-acteurs-du-numerique-a-se-mobiliser/
- ORIAS — Registre unique des intermédiaires en assurance, banque et finance : « Fraude aux moyens de paiement (FBF) » (200) — https://fbf.fr/fr/communique_de_presse/fraude-aux-moyens-de-paiements-un-appel-aux-acteurs-du-numerique-a-se-mobiliser/
- Mutualité Française (fédération nationale) : « La lutte contre la fraude sociale : 13 milliards d’euros » (200) — https://www.mutualite.fr/actualites/la-lutte-contre-la-fraude-sociale/
- ACPR — Autorité de contrôle prudentiel et de résolution : « Escroqueries : l’ACPR met en garde le public contre les propositions frauduleuses de crédits, de livrets d’épargne, de services de paiement et d’assurances » (200) — https://acpr.banque-france.fr/fr/communiques-de-presse/escroqueries-lacpr-met-en-garde-le-public-contre-les-propositions-frauduleuses-de-credits-de-livrets
- Crédit Agricole (réseau national) : « Alertes phishing e-mail » (200) — https://www.credit-agricole.fr/particulier/cybersecurite/alertes-phishing-email.html
- Caisse d'Épargne (réseau national) : « Phishing - arnaque Internet » (200) — https://www.caisse-epargne.fr/votre-banque/securite/le-phishing/
- Banque Populaire (réseau national) : « Phishing - mail frauduleux » (200) — https://www.banquepopulaire.fr/votre-banque/securite/le-phishing/
- Groupama (réseau national) : « Comment prévenir le risque cyber en entreprise ? » (200) — https://www.groupama.fr/assurance-professionnels/conseils/prevention-risque-cyber-entreprise/
- MAIF : « Comment sécuriser sa boîte email ? » (200) — https://www.maif.fr/conseils-prevention/les-risques-numeriques/securiser-sa-messagerie
- SMACL Assurances : « Prévention des cyberattaques à Castelnau-le-Lez » (200) — https://www.smacl.fr/actus-et-conseils/prevention-cyberattaques-castelnau-le-lez
- ICI Gironde : « La Cybersécurité au Campus Efrei Bordeaux » (200) — https://www.ici.fr/emissions/ici-gironde-ca-marche-avec-isabelle-wagner/la-cybersecurite-au-campus-efrei-bordeaux-9258319
- BFM Bordeaux : « "Aucune donnée de paiement, comme des numéros de cartes bancaires, n'a été affectée" : la banque JPMorgan, Visa et Mastercard victimes d'une fuite de données après le piratage d'un sous-traitant » (200) — https://www.bfmtv.com/tech/cybersecurite/aucune-donnee-de-paiement-comme-des-numeros-de-cartes-bancaires-n-a-ete-affectee-les-banques-jp-morgan-visa-et-mastercard-victimes-d-une-fuite-de-donnees-apres-le-piratage-d-un-sous-traitant_AD-202611200422.html
- actu.fr Gironde : « Voiture disparue, escroquerie : ils dénoncent une arnaque dans un parking près de l’aéroport de Bordeaux » (200) — https://actu.fr/nouvelle-aquitaine/merignac_33281/voiture-disparue-escroquerie-ils-denoncent-une-arnaque-dans-un-parking-pres-de-l-aeroport-de-bordeaux_63054901.html
- actu.fr Bordeaux : « Voiture disparue, escroquerie : ils dénoncent une arnaque dans un parking près de l’aéroport de Bordeaux » (200) — https://actu.fr/nouvelle-aquitaine/merignac_33281/voiture-disparue-escroquerie-ils-denoncent-une-arnaque-dans-un-parking-pres-de-l-aeroport-de-bordeaux_63054901.html
- actu.fr Arcachon : « Voiture disparue, escroquerie : ils dénoncent une arnaque dans un parking près de l’aéroport de Bordeaux » (200) — https://actu.fr/nouvelle-aquitaine/merignac_33281/voiture-disparue-escroquerie-ils-denoncent-une-arnaque-dans-un-parking-pres-de-l-aeroport-de-bordeaux_63054901.html
- actu.fr Libourne : « Voiture disparue, escroquerie : ils dénoncent une arnaque dans un parking près de l’aéroport de Bordeaux » (200) — https://actu.fr/nouvelle-aquitaine/merignac_33281/voiture-disparue-escroquerie-ils-denoncent-une-arnaque-dans-un-parking-pres-de-l-aeroport-de-bordeaux_63054901.html
- France 3 Nouvelle-Aquitaine — Bordeaux : « Les données personnelles et médicales de 250 000 personnes ciblées par une cyberattaque d'ampleur » (200) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/les-donnees-personnelles-et-medicales-de-250-000-personnes-ciblees-par-une-cyberattaque-d-ampleur-3331361.html
- France 3 Nouvelle-Aquitaine : « Les données personnelles et médicales de 250 000 personnes ciblées par une cyberattaque d'ampleur » (200) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/les-donnees-personnelles-et-medicales-de-250-000-personnes-ciblees-par-une-cyberattaque-d-ampleur-3331361.html
- 20 Minutes Bordeaux : « Victime d’une fraude au Kbis, cette architecte a perdu son entreprise du jour au lendemain » (200) — https://www.20minutes.fr/faits_divers/4244574-20260911-victime-fraude-kbis-architecte-perdu-entreprise-jour-lendemain

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, fédérations, sites d'organismes et presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur et suivi des redirections (25 s maximum). Seules les sources dont toutes les URLs ont répondu 200 ont été intégrées au corpus et à la base.
