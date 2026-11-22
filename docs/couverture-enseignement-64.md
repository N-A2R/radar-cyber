# Sources du secteur « enseignement » — Pyrénées-Atlantiques (64)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **24 sources, 85 URL distinctes toutes en HTTP 200** le 2026-11-22 (21 flux RSS/Atom vérifiés, 89 traces de vérification en base).

- Corpus : `bench/corpus/sources-enseignement-64.jsonl` (24 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-enseignement-64.json` — code, type de contenu et URL contrôlés (sites, pages d'actualités, flux et articles cyber), GET avec User-Agent navigateur et suivi des redirections.
- Intégration : `db/migrate-132-sources-enseignement-64.sql` — 24 lignes dans `source` (identifiants `corpus:ens64-*`), 89 traces `ok200` dans `source_verification`. Migration appliquée le 2026-11-22 sur la base de développement PostgreSQL (vérifié : 24 sources, 89 traces, 85 URL distinctes).
- Empreinte du corpus consolidé : `b7f94960f66be2bae29f8ba5a694bd20f7f4157da223c7a297f10b6d64829118`.
- Exemples cyber : faits réels et vérifiés (ethical hacking au lycée Guynemer, IA/BTS SIO à Saint-John Perse, intervention CNIL à Stella Maris, cybermois de l'UPPA, cyberattaque de la FSU et de la CFDT, souveraineté numérique à la CCI Pau Béarn). Les sources sans incident propre portent une mention explicite : aucun événement n'est inventé.

## Organisations retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Lycée Guynemer (Oloron-Sainte-Marie) | lycée pro/technologique | https://www.lycee-guynemer.com/ | https://www.lycee-guynemer.com/category/actualites/ | https://www.lycee-guynemer.com/feed/ |
| Lycée Saint-John Perse | lycée | https://www.lycee-saint-john-perse.fr/ | https://www.lycee-saint-john-perse.fr/blog | https://www.lycee-saint-john-perse.fr/blog-feed.xml |
| Lycée des Métiers Molière (Orthez) | lycée professionnel | https://lycee-metiers-orthez.fr/ | https://lycee-metiers-orthez.fr/actualites | https://lycee-metiers-orthez.fr/feed |
| École hôtelière de Biarritz | lycée hôtelier | https://www.ecolehotelierebiarritz.fr/ | https://www.ecolehotelierebiarritz.fr/category/actualites/ | https://www.ecolehotelierebiarritz.fr/feed/ |
| Lycée Saint-Cricq (Pau) | lycée | https://www.lycee-saint-cricq.org/ | https://www.lycee-saint-cricq.org/category/actualite/ | https://www.lycee-saint-cricq.org/feed/ |
| Stella Maris (Anglet) | ensemble scolaire privé | https://stellamarisanglet.fr/ | https://stellamarisanglet.fr/actualites/ | https://stellamarisanglet.fr/feed/ |
| Lycée Saint-Joseph (Ustaritz) | lycée privé | https://www.saintjo64.fr/ | https://www.saintjo64.fr/nos-actualites-lycee-saint-joseph-ustaritz/ | https://www.saintjo64.fr/feed/ |
| Lycée Louis de Foix (Bayonne) | lycée professionnel | https://louisdefoix.fr/ | https://louisdefoix.fr/articles/ | https://louisdefoix.fr/feed/ |
| Université de Pau et des Pays de l'Adour | université | https://www.univ-pau.fr | https://www.univ-pau.fr/fr/actualites.html | https://www.univ-pau.fr/_plugins/web/vieuppa/fr/filter/org.ametys.web.article.RSS/rss.xml |
| ESTIA (Bidart) | école d'ingénieurs | https://www.estia.fr | https://www.estia.fr/les-actualites/ | https://www.estia.fr/rss.xml |
| CCI Pau Béarn — formation et numérique | chambre consulaire | https://pau.cci.fr | https://pau.cci.fr/blog/ | https://pau.cci.fr/feed/ |
| CMA 64 / CMA Nouvelle-Aquitaine | chambre consulaire | https://www.cma64.fr | https://www.cma64.fr/actualites/ | — |
| SNES | syndicat enseignement | https://www.snes.edu | https://www.snes.edu/toute-lactualite/ | https://www.snes.edu/feed/ |
| UNSA Éducation | syndicat enseignement | https://www.unsa-education.fr | https://www.unsa-education.fr/thematiques/actualites/ | https://www.unsa-education.com/feed/ |
| FSU | fédération syndicale | https://www.fsu.fr | https://fsu.fr/category/nos-actions/evenements/ | https://fsu.fr/feed/ |
| CFDT — éducation/formation | confédération syndicale | https://www.cfdt.fr | https://www.cfdt.fr/sinformer/toutes-les-actualites-par-dossiers-thematiques | https://www.cfdt.fr/feed |
| actu.fr — Pau | presse locale | https://actu.fr/nouvelle-aquitaine/pau_64445/ | https://actu.fr/tag/education/ | https://actu.fr/rss.xml |
| ici — Pays basque | radio locale | https://www.ici.fr/pays-basque | https://www.ici.fr/pays-basque | https://www.ici.fr/rss/infos.xml |
| ici — Béarn | radio locale | https://www.ici.fr/bearn | https://www.ici.fr/bearn | https://www.ici.fr/rss/infos.xml |
| Le Café pédagogique | média pédagogique | https://www.cafepedagogique.net/ | https://www.cafepedagogique.net/category/actualite/ | https://www.cafepedagogique.net/feed/ |
| Annuaire des établissements 64 | annuaire | https://www.annuaire-education.fr/departement/pyrenees-atlantiques/064.html | — | — |
| Lycée polyvalent Cantau (Anglet) | lycée | https://lycee-cantau.fr/ | https://lycee-cantau.fr/lycee-cantau-anglet/actualites/ | https://lycee-cantau.fr/feed/ |
| Lycée professionnel du 4 septembre 1870 (Bayonne) | lycée professionnel | https://www.lycee4septembre.fr/ | https://www.lycee4septembre.fr/actualites/ | https://www.lycee4septembre.fr/feed/ |
| Lycée polyvalent Haute-Vue Pau-Morlaàs | lycée | https://www.lyceeprofessionnel-morlaas.fr/ | https://www.lyceeprofessionnel-morlaas.fr/actualites/ | — |

## Candidats écartés

- `https://www.ac-bordeaux.fr/`, `https://www.ac-bordeaux.fr/dsden64` : HTTP 403 ; `https://web64.ac-bordeaux.fr/` : serveur injoignable (000). Aucune source rectorat/DSDEN retenue.
- Sud Ouest (Pau, Bayonne, rubrique éducation, flux RSS) et La République des Pyrénées : boucle anti-bot 307/302 ; non retenus.
- `https://louisdefoix.fr/actualites/` : HTTP 404 ; la page `/articles/` (200) a été retenue.
- `https://www.lyceeprofessionnel-morlaas.fr/feed/` et les flux `/feed/` de la CMA renvoient du HTML : non comptés comme flux RSS.
- `www.esc-pau.fr`, `iut-pau.univ-pau.fr`, `www.ensgti.univ-pau.fr`, `www.greta-pau.fr` et les antennes syndicales départementales : NXDOMAIN ou serveur injoignable (000).
OBJECTIF : atteint — 24 sources vérifiées en HTTP 200 / 5 sources vérifiées en HTTP 200
