# Couverture « bâtiment » — Pyrénées-Atlantiques (64)

21 sources vérifiées, 48 contrôles HTTP sur 47 URLs distinctes effectués le 2026-11-22
(sites, pages d'actualités et flux RSS/Atom). Toutes les pages d'actualités retenues
répondent en HTTP 200 ; aucune URL en échec n'a été conservée.

Corpus : `bench/corpus/sources-batiment-64.jsonl` — preuve HTTP :
`bench/results/verification-sources-batiment-64.json` — intégration :
`db/migrate-160-sources-batiment-64.sql` (ids `corpus:batiment-64-*`,
`department='64'`).

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CAUE 64 — conseil d'architecture, d'urbanisme et d'environnement des Pyrénées-Atlantiques | conseil d'architecture, d'urbanisme et d'environnement | https://www.caue64.fr/accueil/ | — |
| CCI Pau Béarn — chambre de commerce et d'industrie | chambre consulaire | https://pau.cci.fr/?post_type=post | https://pau.cci.fr/feed/ |
| CMA Nouvelle-Aquitaine — actualités des artisans des Pyrénées-Atlantiques (64) | chambre des métiers et de l'artisanat | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Pyr%C3%A9n%C3%A9es-Atlantiques | — |
| Societe.com — annuaire des entreprises (recherche Pyrénées-Atlantiques 64) | annuaire professionnel | https://www.societe.com/recherche?departement=64 | — |
| actu.fr — Actu Pyrénées-Atlantiques (64) | presse en ligne locale | https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/ | https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/rss.xml |
| ICI Pyrénées-Atlantiques (64) — actualités de Radio France | radio locale (service public) | https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64 | — |
| France 3 Nouvelle-Aquitaine — édition Pyrénées-Atlantiques | télévision publique locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/rss |
| CAPEB — fédération nationale des artisans du bâtiment | syndicat professionnel du bâtiment (fédération nationale) | https://www.capeb.fr/actualites | — |
| Qualibat — certification et annuaire des entreprises du bâtiment | organisme de certification et annuaire professionnel | https://www.qualibat.com/actualites | — |
| Artisanat.fr — magazine d'actualités de l'artisanat (CMA) | réseau consulaire et magazine d'actualités des artisans | https://www.artisanat.fr/magazine/actus | — |
| Odéys — cluster de la construction et de l'aménagement durables (Nouvelle-Aquitaine) | cluster professionnel de la construction durable | https://www.odeys.fr/actualites | https://www.odeys.fr/rss.xml |
| CERC Nouvelle-Aquitaine — observatoire de la construction | observatoire régional de la construction | https://www.cerc-na.fr/category/actualites/ | https://www.cerc-na.fr/feed/ |
| Bing Actualités — veille bâtiment Pyrénées-Atlantiques (64) | agrégateur de presse locale | https://www.bing.com/news/search?q=b%C3%A2timent+Pyr%C3%A9n%C3%A9es-Atlantiques&format=rss | https://www.bing.com/news/search?q=b%C3%A2timent+Pyr%C3%A9n%C3%A9es-Atlantiques&format=rss |
| Préfecture des Pyrénées-Atlantiques — actualités (habitat et urbanisme) | préfecture (habitat et urbanisme) | https://www.pyrenees-atlantiques.gouv.fr/Actualites | — |
| Ville de Bayonne — actualités (urbanisme et chantiers) | collectivité (ville) | https://www.bayonne.fr/information-transversale/actualites | — |
| La Dépêche du Midi — édition Pyrénées-Atlantiques (64) | presse locale | https://www.ladepeche.fr/pyrenees-atlantiques | https://www.ladepeche.fr/rss.xml |
| Mediabask — quotidien local du Pays basque | presse locale quotidienne (Pays basque) | https://www.mediabask.eus/ | https://www.mediabask.eus/eu/rss/sections/mediabask.rss |
| ICI Pays Basque — actualités et rénovation | radio locale (service public) | https://www.ici.fr/radio/pays-basque | https://www.ici.fr/rss/pays-basque/a-la-une.xml |
| ICI Béarn Bigorre — actualités de Pau et du Béarn | radio locale (service public) | https://www.ici.fr/radio/bearn | https://www.ici.fr/rss/bearn/rubrique/infos.xml |
| Département des Pyrénées-Atlantiques — le64.fr | institutionnel (conseil départemental) | https://www.le64.fr/lactualite-du-departement | https://le64.fr/rss.xml |
| GRETA-CFA Aquitaine — pôle Bâtiment Travaux Publics Béarn / Pays Basque | organisme de formation BTP et apprentissage | https://greta-cfa-aquitaine.fr/actualites/ | — |

## Méthode

Chaque URL a été chargée en GET avec un User-Agent de navigateur, en suivant les
redirections (délai 25 s) ; le code HTTP, le type de contenu, l'URL effective et
le nombre d'octets ont été consignés dans la preuve JSON. La recherche s'est
appuyée sur les annuaires professionnels, chambres consulaires, fédérations,
organismes de certification, organismes de formation et médias locaux du Pays
basque et du Béarn.

Candidats écartés : `www.capeb.fr/pyrenees-atlantiques/` et
`www.capeb.fr/pyrenees-atlantiques/actualites` (404 — la CAPEB n'a pas de page
départementale 64 accessible) ; `capeb64.fr`, `capeb-pa.fr`, `ffb64.fr`,
`btp64.fr`, `cfai-aquitaine.fr` (NXDOMAIN) ;
`sudouest.fr/pyrenees-atlantiques` et `larepubliquedespyrenees.fr` (boucles de
redirections anti-bot) ; `lemoniteur.fr/nouvelle-aquitaine/` (HTTP 403) ;
`news.google.com/rss/search?q=bâtiment+Pyrénées-Atlantiques` (HTTP 429) ;
`ici.fr/rss` (HTTP 200 mais page HTML, pas un flux). Le flux
`www.caue64.fr/accueil/feed/` est un flux de commentaires, non d'actualités :
il n'a donc pas été retenu comme flux d'information.

Exemples cyber observés : alerte « nouvelle campagne de phishing en cours »
sur la page actualités de Qualibat, article « St-Jean-Pied-de-Port remporte
25 000 euros pour rénover son église » chez ICI Pays Basque, et actualités de
réhabilitation et de réemploi dans le bâtiment relayées par Bing Actualités
(consultés le 2026-11-22). Pour les autres sources, le champ `exemple_cyber`
décrit un vecteur sectoriel (faux devis, faux RIB, permis de construire
frauduleux) sans incident nommé dans la page observée.

OBJECTIF : atteint — 21 sources vérifiées HTTP 200 / 5 minimum.
