# Sources du secteur « collectivites » — Deux-Sèvres (79)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **25 sources, 58 URL distinctes toutes en HTTP 200** le 2026-11-22 (11 flux XML vérifiés, 80 traces de vérification en base).

- Corpus : `bench/corpus/sources-collectivites-79.jsonl` (25 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-collectivites-79.json` — code, type de contenu et URL contrôlés (sites, pages d'actualités, flux et articles cyber).
- Intégration : `db/migrate-066-sources-collectivites-79.sql` — 25 lignes dans `source` (identifiants `corpus:collectivites-79-*`), 80 traces `ok200` dans `source_verification` ; migration appliquée le 2026-11-22 sur la base de développement PostgreSQL.
- Exemples cyber : SMS frauduleux au nom de la Ville de Niort (13/12/2025), faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024), cyberattaque avec rançon de l'EHPAD de Champdeniers-Saint-Denis (10/12/2025). Les sources sans incident propre portent une mention explicite : aucun événement n'est inventé.

## Organisations retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Conseil départemental des Deux-Sèvres | conseil départemental | https://www.deux-sevres.fr/ | https://www.deux-sevres.fr/toutes-les-actualites | — |
| Communauté d'agglomération du Niortais | intercommunalité | https://www.niortagglo.fr/ | https://www.niortagglo.fr/lagglo/toutes-les-actualites/index.html | — |
| Ville de Niort | commune | https://www.vivre-a-niort.com/ | https://www.vivre-a-niort.com/actualites/toutes-les-news-archives/index.html | — |
| Ville de Bressuire | commune | https://www.ville-bressuire.fr/ | https://www.ville-bressuire.fr/systeme/actualites/ | https://www.ville-bressuire.fr/feed/?post_type=post |
| Ville de Thouars | commune | https://thouars.fr/ | https://thouars.fr/category/actualites/ | https://thouars.fr/feed/ |
| Ville de Parthenay | commune | https://www.parthenay.fr/ | https://www.parthenay.fr/actualites | https://www.parthenay.fr/actualites/rss |
| Ville de Melle | commune | https://melle.fr/ | https://melle.fr/actualites | — |
| Ville de Cerizay | commune | https://www.cerizay.fr/ | https://www.cerizay.fr/index.php/a-la-une | https://www.cerizay.fr/index.php?format=feed&type=rss |
| Agglomération du Bocage Bressuirais | intercommunalité | https://www.agglo2b.fr/ | https://www.agglo2b.fr/actus | — |
| Communauté de communes Haut Val de Sèvre | intercommunalité | https://cc-hautvaldesevre.fr/ | https://cc-hautvaldesevre.fr/ | https://cc-hautvaldesevre.fr/?format=feed&type=rss |
| Centre de gestion de la fonction publique territoriale des Deux-Sèvres | service public départemental | https://www.cdg79.fr/ | https://www.cdg79.fr/actualites | — |
| SDIS des Deux-Sèvres | service public départemental | https://www.sdis79.fr/ | https://www.sdis79.fr/actualites-generales/ | https://www.sdis79.fr/feed/ |
| Chambre d'agriculture Charente-Maritime–Deux-Sèvres | chambre consulaire | https://cmds.chambre-agriculture.fr/ | https://cmds.chambre-agriculture.fr/actualites-1 | — |
| CMA Nouvelle-Aquitaine — antenne Deux-Sèvres | chambre consulaire | https://cma-nouvelleaquitaine.fr/ | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| Association des maires des Deux-Sèvres (ADM79) | fédération | https://adm79.fr/ | https://adm79.fr/ | — |
| Annuaire de l'AMF — Deux-Sèvres | annuaire professionnel | https://www.amf.asso.fr/m/annuaire/?refer=departement&dep_n_id=79 | https://www.amf.asso.fr/m/annuaire/?refer=departement&dep_n_id=79 | — |
| Annuaire de l'administration — Deux-Sèvres | annuaire professionnel | https://lannuaire.service-public.gouv.fr/nouvelle-aquitaine/deux-sevres | https://lannuaire.service-public.gouv.fr/nouvelle-aquitaine/deux-sevres | — |
| Annuaire des communes des Deux-Sèvres | annuaire professionnel | https://www.annuaire-mairie.fr/departement-deux-sevres.html | — | — |
| La Nouvelle République — Deux-Sèvres | presse locale | https://www.lanouvellerepublique.fr/deux-sevres | https://www.lanouvellerepublique.fr/deux-sevres/commune | https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594 |
| France 3 Nouvelle-Aquitaine — Deux-Sèvres | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/niort | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/rss |
| ICI Poitou (Radio France) | radio locale | https://www.ici.fr/radio/poitou | https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79 | https://www.ici.fr/rss/poitou/rubrique/infos.xml |
| Niort info | presse locale | https://niortinfo.media/ | https://niortinfo.media/category/vie-de-la-cite/ | https://niortinfo.media/feed/ |
| Radio Gâtine | radio locale | https://radiogatine.fr/ | https://radiogatine.fr/news-1 | https://radiogatine.fr/rss-feed-1 |
| RCF Poitou Deux-Sèvres | radio locale | https://www.rcf.fr/poitou-deuxsevres | https://www.rcf.fr/actualite?radio=poitou-deuxsevres | — |
| Actu Deux-Sèvres (actu.fr) | presse locale | https://actu.fr/pays-de-la-loire/deux-sevres_79/ | https://actu.fr/pays-de-la-loire/deux-sevres_79/ | — |

## Candidats écartés

- `https://www.deux-sevres.cci.fr/` et `/actualites` (CCI Deux-Sèvres) : HTTP 403 avec page « Just a moment... » au contrôle curl du 22/11/2026 ; non retenus faute de preuve 200.
- `https://www.lanouvellerepublique.fr/deux-sevres/commune/champdeniers-saint-denis/...` et `/aiffres/...` : HTTP 403 au contrôle final ; les exemples cyber correspondants sont remplacés par des articles vérifiés en 200 (ICI et actu.fr).
- `https://www.agglo2b.fr/?format=feed&type=rss` et `https://adm79.fr/feed/` : HTTP 200 mais flux sans item ; champs `url_flux` laissés vides.
- `https://cci79.fr/` : HTTP 200 mais page « parked domain » sans rapport avec la CCI des Deux-Sèvres ; non retenu.
- `https://www.bressuire.fr/` : redirige vers `https://www.ville-bressuire.fr/`, URL retenue après redirection.

Méthode : découverte des organisations via annuaires professionnels, chambres consulaires, fédérations, sites officiels et presse locale ; pages d'actualités et flux repérés dans les pages elles-mêmes ; chaque URL contrôlée par GET HTTP réel (`curl -L`, User-Agent navigateur, délai 25 s) le 2026-11-22.
OBJECTIF : atteint — 25 / 5
