# Sources du secteur « commerce » — Pyrénées-Atlantiques (64)

## Résultat

OBJECTIF : atteint — 8 / 5

**8 sources vérifiées en HTTP 200** pour le couple secteur `commerce` / département `64` (cible : au moins 5 sources vérifiées en 200).

- Corpus : `bench/corpus/sources-commerce-64.jsonl` (8 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-commerce-64.json` — 30 URLs contrôlées le 2026-11-22, 30 en 200 (sites, pages d'actualités, flux et articles cyber).
- Intégration : `db/migrate-150-sources-commerce-64.sql` — 8 sources (`corpus:commerce-64-*`) et 28 traces uniques dans `source_verification` en `ok200` / HTTP 200.
- Empreinte corpus `bench/corpus/HASH` : `cd70c93a929df2a4d16b2643d30965859838cf7e315166209dc27410729368e3`.

## Organisations retenues

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CCI Pau Béarn | chambre consulaire (commerce et industrie) | https://pau.cci.fr/blog/ | https://pau.cci.fr/feed/ (10 items) |
| CMA Nouvelle-Aquitaine — antenne des Pyrénées-Atlantiques | chambre consulaire (métiers et artisanat) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?county=pyrenees-atlantiques | — |
| Mon-Entreprise-Info — Pyrénées-Atlantiques | annuaire professionnel et actualités des entreprises | https://mon-entreprise-info.com/actualites/pyrenees-atlantiques/ | https://mon-entreprise-info.com/actualites/pyrenees-atlantiques/rss.xml (50 items) |
| Le Journal des Entreprises — Pyrénées-Atlantiques | presse économique régionale | https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/pyrenees-atlantiques | https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine (20 items) |
| ICI Pays Basque | radio locale | https://www.ici.fr/radio/pays-basque | https://www.ici.fr/rss/pays-basque/rubrique/infos.xml (20 items) |
| ICI Béarn Bigorre | radio locale | https://www.ici.fr/radio/bearn | https://www.ici.fr/rss/bearn/rubrique/infos.xml (20 items) |
| Societe.Tech — Pyrénées-Atlantiques | presse économique et technologique | https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-pyrenees-atlantiques/ | Google Actualités (79 items) |
| France 3 Nouvelle-Aquitaine — Pyrénées-Atlantiques | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques | — |

Six flux RSS exploitables sur les 8 sources.

## Exemples cyber associés

- Cyberattaque de sites Internet : « Assez peu de conséquences, aucune fuite de données » à Bordeaux et Pau, deux villes ciblées par les hackers (France 3 Nouvelle-Aquitaine) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html
- Incident de cybersécurité chez La Mutuelle Familiale, Saint-Jean-de-Luz (commune de Saint-Jean-de-Luz) — https://www.saintjeandeluz.fr/fr/incident-de-cybersecurite-chez-la-mutuelle-familiale/

## Candidats écartés

- CCI Bayonne Pays Basque — https://www.bayonne.cci.fr/ : 403 Cloudflare (URL réelle, confirmée par `bench/domain-candidates/wikidata-siren-sites.tsv`, SIREN 186400057 / Wikidata Q2948195) ; non retenue faute de 200 observable.
- Sud Ouest — Pau et articles cyber locaux : boucle de redirections (302) sous User-Agent navigateur.
- La République des Pyrénées — édition et article « plusieurs magasins béarnais touchés par la cyberattaque dans les supermarchés » : 302.
- Medef Pays Basque, Medef 64, clubs d'entreprises locaux (`pau-business-club.fr`, `biarritz-business-club.fr`) : pas de réponse HTTP exploitable (000).
- CCI Pau Béarn — `/actualites/` : 404 ; la page d'actualités retenue est `/blog/`, liée depuis le site officiel.
- Mediabask, actu.fr Pau et France 3 Nouvelle-Aquitaine : site 200 mais aucun flux RSS local vérifié en 200 pour le département.

## Méthode

Exa hors crédits (402). Les candidats ont été identifiés par lecture directe des sites officiels (CCI Pau Béarn, CMA Nouvelle-Aquitaine), des annuaires sectoriels (Mon-Entreprise-Info), du corpus du dépôt (`bench/corpus/incidents-pyreneesatlantiques.jsonl`, `bench/corpus/sources-pyreneesatlantiques.jsonl`) et des médias locaux, puis tous contrôlés par GET réel (redirections suivies, délai 25 s, User-Agent navigateur). Le JSON de vérification enregistre pour chaque URL le code HTTP, le type de contenu et le nombre d'items RSS.
