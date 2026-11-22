# Sources du secteur « collectivites » — Dordogne (24)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **15 sources, 49 URL distinctes toutes en HTTP 200** (50 contrôles, un article cyber partagé par deux sources) le 2026-11-22.

- Corpus : `bench/corpus/sources-collectivites-24.jsonl` (15 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-collectivites-24.json` — code, type de contenu et URL contrôlés (sites, pages d'actualités, flux et articles cyber).
- Intégration : `db/migrate-085-sources-collectivites-24.sql` — 15 lignes dans `source` (identifiants `corpus:collectivites-24-*`), table `source_verification` créée si absente puis 50 traces `ok200`.
- Exemples cyber : communiqués officiels (CC Vallée Dordogne Forêt Bessède, mairie de Bussac, Fédération des chasseurs de la Dordogne), presse locale (Sud Ouest, Dordogne Libre, ICI Périgord) et corpus local `bench/corpus/incidents-dordogne.jsonl`. Les sources sans incident propre portent une mention explicite : aucun événement n'est inventé.

## Organisations retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Préfecture de la Dordogne | préfecture | https://www.dordogne.gouv.fr/ | https://www.dordogne.gouv.fr/Actualites | — |
| CCI Dordogne | chambre consulaire | https://dordogne.cci.fr/ | https://dordogne.cci.fr/actualites/ | https://dordogne.cci.fr/feed/ |
| Chambre d'agriculture de la Dordogne | chambre consulaire | https://dordogne.chambres-agriculture.fr/ | https://dordogne.chambres-agriculture.fr/actualites-1 | — |
| CC Vallée Dordogne Forêt Bessède | intercommunalité | https://ccdordogne-bessede.fr/ | https://ccdordogne-bessede.fr/actualites/ | https://ccdordogne-bessede.fr/feed/ |
| Mairie de Bussac | commune | https://bussac-dordogne.fr/ | https://bussac-dordogne.fr/category/actualites/ | https://bussac-dordogne.fr/feed/ |
| Fédération des chasseurs de la Dordogne | fédération | https://www.chasseurs24.com/ | https://www.chasseurs24.com/actualites/ | https://www.chasseurs24.com/feed/ |
| Sud Ouest — Dordogne | presse locale | https://www.sudouest.fr/dordogne/ | https://www.sudouest.fr/dordogne/ | https://www.sudouest.fr/dordogne/rss.xml |
| Dordogne Libre | presse locale | https://www.dordognelibre.fr/ | https://www.dordognelibre.fr/dordogne/ | https://www.dordognelibre.fr/rss.xml |
| ICI Périgord — Dordogne (24) | radio locale | https://www.ici.fr/nouvelle-aquitaine/dordogne-24 | idem | — |
| France 3 Nouvelle-Aquitaine — Dordogne | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne | idem | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss |
| Ville de Périgueux | commune | https://www.perigueux.fr/ | https://www.perigueux.fr/actualites.html | https://www.perigueux.fr/actualites/flux-actualites/rss.xml |
| Ville de Bergerac | commune | https://www.bergerac.fr/ | https://www.bergerac.fr/category/actualite/ | https://www.bergerac.fr/feed/ |
| Grand Périgueux | intercommunalité | https://www.grandperigueux.fr/ | https://www.grandperigueux.fr/actualites/ | https://www.grandperigueux.fr/feed/ |
| Annuaire des communes et intercommunalités (annuaire-mairie.fr) | annuaire local | https://www.annuaire-mairie.fr/departement-dordogne.html | idem | — |
| SDIS 24 | service public départemental | https://www.sdis24.fr/ | https://www.sdis24.fr/category/actualites/ | https://www.sdis24.fr/rss |

## Candidats écartés

- `https://www.dordogne.fr/` (conseil départemental) : HTTP 503 (maintenance) lors des deux contrôles du 22/11/2026.
- `https://www.ici.fr/rss/dordogne/a-la-une.xml` : HTTP 404 — flux ICI non retenu.
- `https://www.sdis24.fr/actualites/` : HTTP 404 — la page effective est `/category/actualites/`.
- `https://www.actu.fr/nouvelle-aquitaine/dordogne_24/` : HTTP 403 au contrôle final — source non retenue.
- `https://www.amf24.fr/`, `https://www.amf-dordogne.fr/`, `https://www.isle-crempse.fr/`, `https://www.smctom.fr/` : NXDOMAIN.
- Exa MCP indisponible (402, crédits épuisés) : angulation web de substitution via Brave/Bing et lecture directe des pages, puis vérification HTTP de chaque URL retenue.
OBJECTIF : atteint — 15 / 5
