# Sources du secteur « commerce » — Gironde (33)

## Résultat

OBJECTIF : atteint — 17 / 5

**17 sources vérifiées en HTTP 200** pour le couple secteur `commerce` / département `33` (cible : au moins 5 sources vérifiées en 200).

- Corpus : `bench/corpus/sources-commerce-33.jsonl` (17 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-commerce-33.json` — 64 URLs contrôlées le 2026-11-22, 64 en 200 (sites, pages d'actualités, flux RSS et articles cyber).
- Intégration : `db/migrate-094-sources-commerce-33.sql` — 17 lignes dans `source` (`corpus:commerce-33-*`) et 64 traces `ok200` / HTTP 200 dans `source_verification`. Migration appliquée et vérifiée sur le PostgreSQL local (`radar`, port 5433) : 17 sources et 64 traces présentes.
- Empreinte du corpus consolidé : `4d4a48be32f0d3e2510e59f7cec24f8b8222cee93e11364ebe7b11f18ea1ee22`.

## Organisations retenues

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Le Journal des Entreprises — Gironde | presse économique régionale | https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/gironde | https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine |
| ICI Gironde (Radio France) | radio locale | https://www.ici.fr/nouvelle-aquitaine/gironde-33/actu | https://www.ici.fr/rss/gironde/rubrique/infos.xml |
| Mon-Entreprise-Info — Gironde | annuaire professionnel | https://mon-entreprise-info.com/actualites/gironde/ | https://mon-entreprise-info.com/actualites/gironde/rss.xml |
| Bordeaux Métropole — économie et commerces | collectivité | https://www.bordeaux-metropole.fr/actualites | https://www.bordeaux-metropole.fr/rss.xml |
| FEVAD | fédération du e-commerce | https://www.fevad.com/actualites/ | https://www.fevad.com/feed/ |
| CMA Nouvelle-Aquitaine | chambre consulaire régionale | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| FCD | fédération du commerce et de la distribution | https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/ | — |
| Societe.Tech — Gironde | presse spécialisée entreprises | https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-gironde/ | — |
| Cyberattaque.org | veille cybersécurité | https://www.cyberattaque.org/ | https://www.cyberattaque.org/feed/ |
| actu.fr — Gironde (économie) | presse locale | https://actu.fr/nouvelle-aquitaine/gironde_33/economie | https://actu.fr/nouvelle-aquitaine/gironde_33/rss.xml (200, 0 item) |
| Artisanat.fr — CMA France | chambre consulaire nationale | https://www.artisanat.fr/magazine/actus | — |
| Bordeaux Mon Commerce | association de commerçants et artisans | https://www.bordeauxmoncommerce.fr/category/actus/ | https://www.bordeauxmoncommerce.fr/feed/ |
| UMIH 33 | syndicat hôtellerie-restauration Gironde | https://www.umih33.fr/actualites/ | https://www.umih33.fr/feed/ |
| Centre-ville en mouvement | réseau des commerces de centre-ville | https://www.centre-ville.org/le-blog-actualite-des-centres-villes/ | https://www.centre-ville.org/feed/ |
| Échos judiciaires girondins — économie | presse locale | https://www.echos-judiciaires.com/categories/economie/ | https://www.echos-judiciaires.com/feed/ |
| Bouger à Bordeaux | presse locale | https://www.bougerabordeaux.com/bordeaux/actu/news/ | https://www.bougerabordeaux.com/feed/ |
| France 3 Nouvelle-Aquitaine — Gironde | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/rss |

## Exemples cyber associés

Chaque URL d'article a été contrôlée en HTTP 200 le 2026-11-22 :

- **Cyberattaque des supermarchés** : quatre Intermarché girondins parmi les magasins touchés (Bouger à Bordeaux) — rattachement aux sources consulaires, fédérations et annuaires du commerce.
- **Fuite de données du service de la taxe de séjour de Bordeaux Métropole** (9 390 déclarants) — rattachement à Bordeaux Métropole, FEVAD et Mon-Entreprise-Info.
- **Cybersécurité TPE : guide pratique pour artisans** (Artisanat.fr / CMA France) — rattachement aux chambres consulaires et à l'UMIH 33.
- **[Chronique] Cybersécurité, une question de conformité** (Échos judiciaires girondins) — rattachement à la presse locale économique et au réseau Centre-ville en mouvement.
- **Cyberattaque visant la Ville de Bordeaux** et **mairie de Floirac privée d'internet** (actu.fr, France 3) — rattachement à la presse locale et à la veille cyber.

## Candidats écartés

- **CCI Bordeaux-Gironde** (`bordeaux.cci.fr`, `www.bordeaux.cci.fr`) et **CMA Gironde** (`cma-gironde.fr`, `cma33.fr`) : nom de domaine non résolu depuis cet environnement ; relais CMA Nouvelle-Aquitaine et Artisanat.fr retenus à la place.
- **Sud Ouest** (site, pages Gironde/Bordeaux et flux) : HTTP 302 constant avec `curl -L` (boucle anti-bot), non intégré malgré les mesures 200 archivées la veille.
- **20 Minutes Bordeaux** (`/rss/local/bordeaux.xml`, `/rss/une.xml`) : HTTP 403, non intégré.
- **Societe.Tech — flux RSS** (`/feed/`, `/actualite-entreprises-nouvelle-aquitaine/feed/`) : HTTP 410 ; seule la page d'actualités a été intégrée.
- **CMA Nouvelle-Aquitaine** (`/feed/`, `/rss.xml`) et **FCD** (`/feed/`, `/rss.xml`) : HTTP 404 ; pages d'actualités intégrées sans flux.
- **actu.fr — flux Gironde** : HTTP 200 mais 0 item ; signalé dans la preuve, page d'actualités économie intégrée.

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, fédérations, collectivités et presse locale) puis identification des pages d'actualités et des flux déclarés dans le HTML. Exa étant hors crédits (402), les candidats ont été trouvés par recherche web alternative et par les corpus existants du dépôt. Chaque URL a ensuite été contrôlée par un GET réel avec User-Agent navigateur, suivi des redirections, délai 25 s, relevé du code HTTP, du type de contenu et du nombre d'items RSS. Seules les sources dont toutes les URL ont répondu 200 ont été intégrées au corpus, à la preuve HTTP et à la base.
