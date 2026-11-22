# Sources du secteur « collectivites » — Pyrénées-Atlantiques (64)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **21 sources, 52 URL distinctes toutes en HTTP 200** le 2026-11-22 (11 flux RSS vérifiés, 69 traces de vérification en base).

- Corpus : `bench/corpus/sources-collectivites-64.jsonl` (21 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-collectivites-64.json` — code, type de contenu et URL contrôlés (sites, pages d'actualités, flux et articles cyber). 56 URL ont été testées : 52 en 200, 4 articles Sud Ouest en 302 (redirection paywall) ; seules les URL en 200 sont comptées et versées en base.
- Intégration : `db/migrate-130-sources-collectivites-64.sql` — 21 lignes dans `source` (identifiants `corpus:collectivites-64-*`), 69 traces `ok200` dans `source_verification` ; migration appliquée le 2026-11-22 sur la base de développement PostgreSQL (`source` : +21, `source_verification` : +69).
- Empreinte du corpus consolidé : `622864aad3246da7defe33cb5bbadbb2bd583ed347dcf583a6ca034dae365e64`.
- Exemples cyber : fait réel et vérifié pour la Ville de Pau (DDoS, 31/12/2024, France 3), la CCI Pau Béarn (rançongiciel, mai 2024), la Ville d'Anglet (Pronote, mai 2024), la mairie d'Espelette (phishing, septembre 2026) et la Ville de Saint-Jean-de-Luz (communiqué officiel, avril 2026). Les sources sans incident propre portent une mention explicite : aucun événement n'est inventé.

## Organisations retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Conseil départemental des Pyrénées-Atlantiques | service public départemental | https://www.le64.fr/ | https://www.le64.fr/lactualite-du-departement | https://www.le64.fr/rss.xml |
| Préfecture des Pyrénées-Atlantiques | service public départemental | https://www.pyrenees-atlantiques.gouv.fr/ | https://www.pyrenees-atlantiques.gouv.fr/Actualites | — |
| Communauté d'agglomération Pays Basque | intercommunalité | https://www.communaute-paysbasque.fr/ | https://www.communaute-paysbasque.fr/actualites/toutes-les-actualites | — |
| SDIS des Pyrénées-Atlantiques | service public départemental | https://www.sdis64.fr/ | https://www.sdis64.fr/les-actualites-du-sdis-64/ | https://www.sdis64.fr/feed/ |
| CCI Pau Béarn | chambre consulaire | https://pau.cci.fr/ | https://pau.cci.fr/blog/ | https://pau.cci.fr/feed/ |
| Chambre des métiers et de l'artisanat des Pyrénées-Atlantiques | chambre consulaire | https://www.cma64.fr/ | https://www.cma64.fr/a-cote-de-chez-vous/actualites | — |
| Communauté de communes du Pays de Nay | intercommunalité | https://paysdenay.fr/ | https://paysdenay.fr/actualites | https://paysdenay.fr/feed/ |
| Ville de Bayonne | commune | https://www.bayonne.fr/ | https://www.bayonne.fr/information-transversale/actualites | — |
| Ville d'Anglet | commune | https://www.anglet.fr/ | https://www.anglet.fr/actualites/dernieres-actualites/ | — |
| Ville de Biarritz | commune | https://www.biarritz.fr/ | https://www.biarritz.fr/les-actualites | — |
| Ville d'Orthez | commune | https://www.mairie-orthez.fr/ | https://www.mairie-orthez.fr/la-ville/a-la-une/ | https://www.mairie-orthez.fr/feed/ |
| Ville de Lons | commune | https://www.mairie-lons.fr/ | https://www.mairie-lons.fr/ma-mairie/actualites/ | https://www.mairie-lons.fr/feed/ |
| Ville de Billère | commune | https://www.billere.fr/ | https://www.billere.fr/actualites/ | https://www.billere.fr/feed/ |
| Ville de Saint-Jean-de-Luz | commune | https://www.saintjeandeluz.fr/ | https://www.saintjeandeluz.fr/fr/actualites/ | https://www.saintjeandeluz.fr/fr/feed/ |
| Ville d'Hendaye | commune | https://www.hendaye.fr/ | https://www.hendaye.fr/fr/actualites/ | — |
| Annuaire des communes et intercommunalités des Pyrénées-Atlantiques | annuaire local | https://www.annuaire-mairie.fr/departement-pyrenees-atlantiques.html | — | — |
| actu.fr — Pyrénées-Atlantiques | presse locale | https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/ | https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/ | https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/rss.xml |
| Mediabask | presse locale | https://www.mediabask.eus/ | https://lhebdo.mediabask.eus/eu/hemeroteca/mediabask/sections/actualite | https://www.mediabask.eus/eu/rss/news.rss |
| ICI Pays Basque | radio locale | https://www.ici.fr/radio/pays-basque | https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64/actu | https://www.ici.fr/rss/pays-basque/a-la-une.xml |
| ICI Béarn Bigorre | radio locale | https://www.ici.fr/radio/bearn | https://www.ici.fr/radio/bearn/actu | — |
| France 3 Pyrénées-Atlantiques | chaîne de télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques | — |

## Candidats écartés

- `https://www.pau.fr/`, `https://www.agglo-pau.fr/` et leurs pages `/actualites` : HTTP 404 au contrôle du 22/11/2026 ; non retenus.
- `https://www.sudouest.fr/pyrenees-atlantiques/`, son flux RSS et les quatre articles cyber Sud Ouest cités dans `exemple_cyber` : HTTP 302 (redirection paywall) ; non retenus comme URL vérifiées en 200.
- `https://www.larepubliquedespyrenees.fr/`, `https://www.bayonne.cci.fr/` et `https://bayonne.cci.fr/` : HTTP 302/403 ; non retenus.
- `https://www.cdg64.fr/`, `https://www.pau-agglomeration.fr/`, `https://www.cc-pays-de-ladour.fr/`, `https://www.cma-pyrenees-atlantiques.fr/` : NXDOMAIN ou serveur injoignable (000) ; non retenus.
- `https://pau.cci.fr/actualites/`, `https://www.bayonne.fr/actualites`, `https://www.mediabask.eus/eu/actualites`, `https://www.bayonne.fr/rss.xml`, `https://www.anglet.fr/rss.xml` : HTTP 404 ; les pages d'actualités et flux effectivement retenus ont été relocalisés puis vérifiés en 200.
- Les quatre articles Sud Ouest mentionnés dans `exemple_cyber` proviennent du corpus d'incidents `bench/corpus/incidents-pyreneesatlantiques.jsonl` : ils documentent des faits réels mais leur URL est en 302 au contrôle ; ils ne sont pas comptés dans les 52 URL vérifiées.
OBJECTIF : atteint — 21 / 5
