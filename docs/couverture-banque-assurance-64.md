# Couverture « banque-assurance » — Pyrénées-Atlantiques (64)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `banque-assurance` / département `64`.

## Résultat

- **21 sources intégrées** (`bench/corpus/sources-banque-assurance-64.jsonl`, une ligne JSON par source).
- **63 contrôles HTTP** (sites, pages d'actualités, flux), soit **56 URL uniques** : **63 réponses HTTP 200**, aucune URL en échec retenue.
- 21 lignes `source` et 56 lignes `source_verification` créées en base par `db/migrate-131-sources-banque-assurance-64.sql`, toutes avec `department = '64'` et `region = 'Nouvelle-Aquitaine'`.
- Preuve HTTP détaillée : `bench/results/verification-banque-assurance-64.json`.

OBJECTIF : atteint — 21 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CCI Pau Béarn | chambre consulaire | https://pau.cci.fr/?post_type=post | https://pau.cci.fr/feed/ |
| Banque de France — succursale de Pau | banque centrale | https://www.banque-france.fr/fr/actualites | Google Actualités « Banque de France Pau » |
| ACPR | autorité de régulation | https://acpr.banque-france.fr/fr/actualites | Google Actualités « ACPR Pyrénées-Atlantiques » |
| ORIAS | registre professionnel | https://www.orias.fr/home/communications | Google Actualités « ORIAS assurance » |
| FBF | fédération bancaire | https://fbf.fr/fr/rubrique-newsroom/actualites/ | Google Actualités « Fédération bancaire française » |
| CPAM des Pyrénées-Atlantiques | assurance maladie | https://www.ameli.fr/assure/actualites | Google Actualités « CPAM Pyrénées-Atlantiques fraude » |
| Carsat Aquitaine | assurance retraite | https://www.carsat-aquitaine.fr/home/actif/actualites-actif.html | Google Actualités « Carsat Aquitaine » |
| MSA | sécurité sociale agricole | https://www.msa.fr/lfp/actualites | Google Actualités « MSA Pyrénées Atlantique » |
| MAIF | assureur mutuel | https://entreprise.maif.fr/actualites/presse | Google Actualités « MAIF Pyrénées-Atlantiques » |
| Groupama | assureur mutualiste | https://www.groupama.fr/actualites/ | Google Actualités « Groupama Pyrénées-Atlantiques » |
| AXA | assureur | https://www.axa.fr/particuliers/qui-sommes-nous/actualites.html | Google Actualités « AXA Pyrénées-Atlantiques assurance » |
| Caisse d'Épargne | banque | https://www.caisse-epargne.fr/conseils/ | Google Actualités « Caisse d'Épargne Pyrénées-Atlantiques » |
| Harmonie Mutuelle | mutuelle santé | https://www.harmonie-mutuelle.fr/actualites | Google Actualités « Harmonie Mutuelle Pyrénées-Atlantiques » |
| AG2R La Mondiale | mutuelle et prévoyance | https://www.ag2rlamondiale.fr/actualites | Google Actualités « AG2R La Mondiale Pyrénées-Atlantiques » |
| SMACL Assurances | assureur des collectivités | https://www.smacl.fr/actus-et-conseils/ | Google Actualités « SMACL Pyrénées-Atlantiques » |
| La Semaine des Pyrénées | presse locale | https://www.lasemainedespyrenees.fr/ | https://www.lasemainedespyrenees.fr/feed/ |
| actu.fr — Pau | presse locale | https://actu.fr/nouvelle-aquitaine/pau_64483/ | Google Actualités « actu.fr Pau banque assurance » |
| ici Pays Basque | radio locale | https://www.ici.fr/radio/pays-basque | https://www.ici.fr/rss/pays-basque/rubrique/infos.xml |
| ici Béarn Bigorre | radio locale | https://www.ici.fr/radio/bearn | https://www.ici.fr/rss/bearn/rubrique/infos.xml |
| France 3 — Pyrénées-Atlantiques | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques | Google Actualités « France 3 Pyrénées-Atlantiques banque » |
| Mediabask | presse locale | https://www.mediabask.eus/ | Google Actualités « Mediabask banque assurance » |

## Exemples de contenu cyber observés

- CCI Pau Béarn : « La CCI Pau Béarn accompagne les PME face au défi de la souveraineté numérique » (2026-06-04).
- FBF : « Divulgation des données FICOBA : la FBF appelle à la vigilance » (2026-02-19).
- CPAM 64 : « Un hacker revendique le piratage du Dossier médical partagé » (2026-06-03).
- Groupama : « Groupama a fait tomber un réseau de 39 noms de domaine frauduleux en .fr ciblant ses clients » (2025-05-12).
- ici Béarn Bigorre : « En Béarn, au moins trois supermarchés touchés par la cyberattaque » (2026-10-12).
- France 3 Pyrénées-Atlantiques : « Arkéa : le président décrit une cyberattaque inédite en termes de sophistication » (2026-11-13).
- Mediabask : « Pays basque : la commune d'Espelette victime d'un piratage » (2026-09-16).

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, fédérations, organismes de protection sociale, presse et radios locales), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur et suivi des redirections (25 s maximum). Seules les sources dont les trois URL ont répondu 200 ont été intégrées au corpus et à la base. Les flux Google Actualités sont des requêtes ciblées « organisation + 64 » : leur contenu est agrégé, les pages d'actualités restent les sources primaires.
