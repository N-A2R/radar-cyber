# Couverture — sources industrie, Pyrénées-Atlantiques (64)

Mesure du 2026-11-22. Objectif : au moins **5 sources vérifiées en HTTP 200** pour le couple secteur `industrie` / département `64`.

## Résultat

OBJECTIF : atteint — 12 / 5

- **12 sources intégrées** (`bench/corpus/sources-industrie-64.jsonl`, une ligne JSON par source, champs `nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber`).
- **36 contrôles HTTP GET** (site, page d'actualités, flux), soit **31 URL uniques** : **36 réponses HTTP 200**, aucune URL retenue en échec.
- 12 lignes `source` et 31 lignes `source_verification` créées en base par `db/migrate-132-sources-industrie-64.sql`, toutes avec `department = '64'` et `region = 'Nouvelle-Aquitaine'`.
- Preuve HTTP détaillée : `bench/results/verification-industrie-64.json`.

## Sources vérifiées

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CCI Pau Béarn | chambre consulaire | https://pau.cci.fr/?post_type=post | https://pau.cci.fr/feed/ (10 items) |
| CMA Nouvelle-Aquitaine — antenne 64 | chambre consulaire (artisanat) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | Google Actualités « CMA Nouvelle-Aquitaine Pyrénées-Atlantiques artisanat » (15 items) |
| UIMM — La Fabrique de l'avenir | fédération métallurgie | https://uimm.lafabriquedelavenir.fr/actualites/ | https://uimm.lafabriquedelavenir.fr/feed/ (10 items) |
| France Industrie | fédération interprofessionnelle | https://www.franceindustrie.org/category/actualites/ | https://www.franceindustrie.org/feed/ (10 items) |
| MEDEF — réseau territorial 64 | syndicat patronal | https://www.medef.com/newsroom | Google Actualités « MEDEF Pyrénées-Atlantiques entreprise » (10 items) |
| Aerospace Valley (site de Pau) | pôle de compétitivité aéronautique | https://www.aerospace-valley.com/actualites | Google Actualités « Aerospace Valley Pau industrie aéronautique » (10 items) |
| La Semaine des Pyrénées | presse locale | https://www.lasemainedespyrenees.fr/ | https://www.lasemainedespyrenees.fr/feed/ (10 items) |
| actu.fr — Pau | presse locale | https://actu.fr/nouvelle-aquitaine/pau_64483/ | Google Actualités « actu.fr Pau industrie Pyrénées-Atlantiques » (11 items) |
| ici Béarn Bigorre | radio locale | https://www.ici.fr/radio/bearn | https://www.ici.fr/rss/bearn/rubrique/infos.xml (20 items) |
| ici Pays Basque | radio locale | https://www.ici.fr/radio/pays-basque | https://www.ici.fr/rss/pays-basque/rubrique/infos.xml (20 items) |
| France 3 — Pyrénées-Atlantiques | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques | Google Actualités « France 3 Pyrénées-Atlantiques industrie » (76 items) |
| Mediabask | presse locale | https://www.mediabask.eus/eu/info | Google Actualités « Mediabask Pays Basque industrie » (10 items) |

## Exemples de contenu cyber observés

- Mourenx : « les industriels et administrations sensibilisés face à la cybercriminalité » (2026-11-20), et relais Sud Ouest sur la hausse de 37,4 % des infractions numériques dans les Pyrénées-Atlantiques (2026-11-21).
- CCI Pau Béarn : « La CCI Pau Béarn accompagne les PME face au défi de la souveraineté numérique » (2026-06-04).
- UIMM : « Cybersécurité, compétitivité, productivité : des formations à l'intelligence artificielle proposées aux industriels par l'UIMM » (2026-09-23).
- France Industrie : « Egide victime d'une cyberattaque : son usine de Bollène partiellement à l'arrêt » (2026-10-11).
- ici Béarn Bigorre : « En Béarn, au moins trois supermarchés touchés par la cyberattaque » (2026-10-12).
- ici Pays Basque : « L'eusko, la monnaie locale basque victime d'une tentative de piratage de ses données » (2026-08-27).
- actu.fr : « Cyberattaque du SDIS 64 : il s'agirait d'un rançongiciel » (2023-10-14).

Aucun incident cyber direct n'a été observé sur le flux d'Aerospace Valley ; le champ `exemple_cyber` le dit explicitement plutôt que d'inventer un titre.

## Candidats écartés (preuve HTTP)

- `https://www.bayonne.cci.fr/` et `https://nouvelle-aquitaine.cci.fr/` : HTTP 403 avec User-Agent navigateur (protection anti-bot) ; non retenus faute de preuve 200.
- `https://fr.kompass.com/a/pyrenees-atlantiques-64/` : HTTP 403 ; annuaire non vérifiable en GET direct.
- `https://www.aerospace-valley.com/feed/` : HTTP 404 ; remplacé par une requête Google Actualités ciblée, vérifiée 200 avec 10 items.
- `https://www.sudouest.fr/pau/` : boucle de redirections (curl `Maximum (50) redirects followed`) ; non retenu.
- `https://www.cci-bayonne-paysbasque.fr/`, `https://www.medef64.fr/`, `https://www.uimm-na.fr/`, `https://www.industrie-nouvelle-aquitaine.fr/` : NXDOMAIN.

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, fédérations, pôles de compétitivité, presse et radios locales), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur et suivi des redirections (25 s maximum). Seules les sources dont les trois URL ont répondu 200 ont été intégrées au corpus et à la base. Les flux Google Actualités sont des requêtes ciblées « organisation + 64 + industrie » : leur contenu est agrégé, les pages d'actualités restent les sources primaires.
