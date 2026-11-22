# Sources du secteur « industrie » — Vienne (86)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `industrie` / département `86`.

## Résultat

- **18 sources intégrées** (`bench/corpus/sources-industrie-86.jsonl`, une ligne JSON par source).
- **48 contrôles HTTP** (sites, pages d'actualités et flux), soit **48 URL uniques** : **48 réponses HTTP 200**, aucune URL en échec retenue.
- 18 lignes `source` et 48 lignes `source_verification` créées en base par `db/migrate-187-sources-industrie-86.sql`, toutes avec `department = '86'` et `region = 'Nouvelle-Aquitaine'`.
- Preuve HTTP détaillée : `bench/results/verification-industrie-86.json`.

OBJECTIF : atteint — 18 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CCI de la Vienne | chambre consulaire | https://www.poitiers.cci.fr/actualites/ | https://www.poitiers.cci.fr/actualites/feed/ |
| MEDEF Vienne | fédération patronale | https://www.medef-vienne.fr/actualite-de-lentreprise/ | https://www.medef-vienne.fr/feed/ |
| CPME Vienne (86) | fédération patronale | https://www.cpme.fr/actualites/ | Google Actualités « CPME Vienne actualites » |
| CMA Nouvelle-Aquitaine — CMA Vienne | chambre consulaire | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | Google Actualités « CMA Vienne artisanat industrie » |
| Grand Poitiers — développement économique | agence de développement économique | https://www.grandpoitiers.fr/information-transversale/actualites | https://www.grandpoitiers.fr/information-transversale/actualites/rss |
| Grand Châtellerault — pôle industrie | agence de développement économique | https://www.grand-chatellerault.fr/vivre/actualites | Google Actualités « Grand Chatellerault industrie entreprises » |
| Neoloji Technopole (Poitiers) | technopole / incubateur | https://www.neoloji.fr/actualites | Google Actualités « Neoloji technopole Poitiers » |
| UIMM Nouvelle-Aquitaine — Vienne | syndicat professionnel métallurgie | https://www.uimmnouvelleaquitaine.com/actualite/presse.html | Google Actualités « UIMM Nouvelle-Aquitaine metallurgie » |
| EIT Sud Vienne | cluster économie circulaire | https://eit-sudvienne.fr/category/actualites/ | https://eit-sudvienne.fr/feed/ |
| ISAE-ENSMA (Poitiers) | école d'ingénieurs industrie/aéronautique | https://www.ensma.fr/actualites/ | https://www.ensma.fr/feed/ |
| FTM-CGT Métallurgie | syndicat professionnel métallurgie | https://ftm-cgt.fr/actualites/ | https://ftm-cgt.fr/feed/ |
| Societe.com — entreprises de la Vienne (86) | annuaire professionnel | https://www.societe.com/entreprises/vienne-86 | Google Actualités « societe.com entreprises Vienne 86 industrie » |
| La Nouvelle République — Vienne | presse locale | https://www.lanouvellerepublique.fr/vienne | https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c |
| La Nouvelle République — Économie Vienne | presse économique locale | https://www.lanouvellerepublique.fr/vienne/economie | https://www.lanouvellerepublique.fr/api/v1/rss/6705263824a8a983658b456c |
| ICI Poitou | radio locale / média public | https://www.ici.fr/nouvelle-aquitaine/vienne-86 | https://www.ici.fr/rss/poitou/a-la-une.xml |
| France 3 Nouvelle-Aquitaine — Vienne | télévision locale / média public | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss |
| web86.info | presse locale | https://web86.info/ | https://web86.info/feed/ |
| Entreprises en Vienne | revue économique départementale | https://entreprisesenvienne.fr/ | Google Actualités « Entreprises en Vienne industrie » |

## Exemples cyber observés

- Cybersécurité : PME/TPE, agissez pour ne pas subir ! — CCI de la Vienne, 08/04/2024 ; atelier « Digital Expresso – introduction à la cybersécurité, un enjeu sous-estimé chez les PME », 05/03/2024.
- Cybersécurité : rappel des bonnes pratiques — MEDEF, 06/10/2022.
- Facturation électronique : une nouvelle étape pour les artisans — CMA Nouvelle-Aquitaine, 24/06/2026.
- Forum Industrie & Innovation : la cybersécurité au programme — Neoloji Technopole, 12/04/2022.
- Cyberattaque : les systèmes de supervision mis en danger — FTM-CGT Métallurgie, 16/10/2026 (cas Danfoss).
- Un Café IA pour éclairer les entreprises — Le7.info, item du flux Societe.com, 2026.
- Poitiers : Vivaticket, prestataire de billetterie, victime d'une cyberattaque — La Nouvelle République, 2026.
- Cyberattaque de frigos de la grande distribution : des enseignes touchées dans le Poitou — ici.fr, 2026.
- La mairie de Poitiers victime d'une cyberattaque avec rançon — BFM, via Google Actualités.

## Méthode et candidats écartés

Recherche web (annuaires professionnels, chambres consulaires, fédérations patronales et syndicales, clusters, technopoles, écoles d'ingénieurs, presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec un User-Agent navigateur, suivi des redirections et délai maximal de 25 s. Seules les sources dont les trois URL ont répondu 200 ont été intégrées. Le nombre d'items est relevé dans les flux RSS.

Écartés après vérification HTTP : `cpme86.fr` (connexion refusée), `cma-vienne.fr` (expiration du délai), `uimm-pc.fr` (connexion refusée), `institutpprime.fr` (connexion refusée), `dreets.gouv.fr` (nom d'hôte non résolu), `lepopulaire.fr/rss.xml` et `le7.info/rss` (404), `ville-chatellerault.fr/rss.xml` (404), ` Industrie Explorer / departement-86` (URL en réalité rattachée à la Vendée, champ `departement` erroné), `L'industrie recrute` (site en 202), ainsi que les URL de flux mortes en 404 (`cpme.fr/espace-presse`, `cma-nouvelleaquitaine.fr/.../actualites/feed`, `grandpoitiers.fr/.../actualites/feed`, `grand-chatellerault.fr/vivre/actualites/feed`, `uimmnouvelleaquitaine.com/feed`). Les flux Google Actualités sont des requêtes ciblées « organisation + Vienne/industrie » : leur contenu est agrégé, les pages d'actualités restant les sources primaires.
