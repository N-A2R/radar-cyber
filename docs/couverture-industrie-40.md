# Couverture — sources « industrie » des Landes (40)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **22 sources, 56 URL distinctes toutes en HTTP 200** (57 relevés, dont 14 flux RSS/Atom) contrôlées le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| CCI des Landes | chambre consulaire (industrie et commerce) | https://www.landes.cci.fr/ | https://www.landes.cci.fr/presse/ | — |
| CPME 40 — Les Entrepreneurs des Landes | organisation patronale TPE-PME | https://www.cpme40.fr/ | https://cpme40.fr/category/actualites/ | https://cpme40.fr/feed/ |
| MEDEF des Landes | organisation patronale | https://landes.territoriaux.medef.com/ | https://landes.territoriaux.medef.com/actualites | — |
| MEDEF Nouvelle-Aquitaine (périmètre Landes) | organisation patronale régionale | https://www.medef-nouvelle-aquitaine.fr/ | https://www.medef-nouvelle-aquitaine.fr/actualites | — |
| UIMM Nouvelle-Aquitaine (périmètre Landes) | syndicat professionnel de la métallurgie | https://www.uimmnouvelleaquitaine.com/ | https://www.uimmnouvelleaquitaine.com/actualite/news.html | — |
| Grand Dax Agglomération — développement économique | intercommunalité (développement industriel) | https://www.grand-dax.fr/ | https://www.grand-dax.fr/connaitre-lagglo/actualite-agenda/ | https://www.grand-dax.fr/feed/ |
| actu.fr — Actu Landes | presse locale en ligne | https://actu.fr/landes/ | https://actu.fr/landes/dernieres-actus | https://actu.fr/landes/rss.xml |
| Les Annonces Landaises | hebdomadaire local | https://www.annonces-landaises.com/ | https://www.annonces-landaises.com/categories/entreprises/ | https://www.annonces-landaises.com/feed/ |
| ICI Gascogne (Radio France) | radio locale | https://www.ici.fr/radio/gascogne | https://www.ici.fr/nouvelle-aquitaine/landes-40 | https://www.ici.fr/rss/gascogne/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine — édition Landes | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss |
| Club Landes Entreprises | club d'entreprises | https://club-landes-entreprises.fr/ | https://club-landes-entreprises.fr/agenda/ | https://club-landes-entreprises.fr/feed/ |
| Landes & Business — club d'affaires (Dax) | club d'entreprises | https://www.landes-business.fr/ | https://www.landes-business.fr/landes/ | https://www.landes-business.fr/feed/ |
| Le Journal des Entreprises — Nouvelle-Aquitaine | presse économique régionale | https://www.lejournaldesentreprises.com/nouvelle-aquitaine | https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/landes | https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine |
| API Recherche d'entreprises (Étalab / INSEE) | annuaire professionnel public (API) | https://recherche-entreprises.api.gouv.fr/ | https://recherche-entreprises.api.gouv.fr/search?departement=40&q=industrie | — |
| BODACC — annonces commerciales | téléservice public d'annonces légales | https://www.bodacc.fr/pages/home/ | https://www.bodacc.fr/pages/annonces-commerciales-recherche/ | — |
| Google News — veille « Landes industrie » | agrégateur de presse locale | https://news.google.com/ | https://news.google.com/ | https://news.google.com/rss/search?q=Landes+industrie&hl=fr&gl=FR&ceid=FR:fr |
| Google News — veille « Landes usine » | agrégateur de presse locale | https://news.google.com/ | https://news.google.com/ | https://news.google.com/rss/search?q=Landes+usine&hl=fr&gl=FR&ceid=FR:fr |
| CMA Nouvelle-Aquitaine (périmètre Landes) | chambre consulaire (artisanat et petites industries) | https://cma-nouvelleaquitaine.fr/ | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| Chambre d'agriculture des Landes (agro-industrie) | chambre consulaire (agro-industrie) | https://landes.chambres-agriculture.fr/ | https://landes.chambres-agriculture.fr/actualites-1 | — |
| UIMM Gironde-Landes (antenne Landes) | syndicat professionnel de la métallurgie (33/40) | https://www.uimm3340.com/ | https://www.uimm3340.com/actualite/ | https://www.uimm3340.com/actualite/feed/ |
| Fibois Landes de Gascogne | interprofession de la filière forêt-bois | https://fibois-landesdegascogne.fr/ | https://fibois-landesdegascogne.fr/actualites/ | https://fibois-landesdegascogne.fr/feed/ |
| Fibois Nouvelle-Aquitaine (périmètre Landes) | fédération sectorielle de la filière forêt-bois | https://fibois-na.fr/ | https://fibois-na.fr/category/actualites/ | https://fibois-na.fr/feed/ |

## Preuve

- Corpus : `bench/corpus/sources-industrie-40.jsonl` (champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Relevé HTTP : `bench/results/verification-industrie-40.json` — 57 relevés, 56 URL distinctes, 56 codes 200, types de contenu, nombre d'items RSS et détection des pages de blocage.
- Migration : `db/migrate-130-sources-industrie-40.sql` — 22 lignes `source` et 57 traces `source_verification` en `ok200` (56 URL distinctes).

## Exemples cyber rattachés

- CCI des Landes — Mars@Hack 2026 : https://www.landes.cci.fr/presse/marshack-2026-cybersecurite/
- actu.fr Actu Landes — cyberattaque des pompiers des Landes : https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html
- Les Annonces Landaises — Octobre, mois de la cybersécurité à Mont-de-Marsan : https://www.annonces-landaises.com/actualites/collectivites-octobre-mois-de-la-cybersecurite-a-mont-de-marsan/
- ICI Gascogne — cyberattaque de la Fédération nationale des chasseurs (185 adhérents landais) : https://www.ici.fr/nouvelle-aquitaine/landes-40/mont-de-marsan/la-federation-nationale-des-chasseurs-victime-d-une-cyberattaque-185-adherents-landais-touches-2569280

## Candidats écartés

- `https://www.sudouest.fr/landes/` et ses variantes : 302 sans destination stable (exclu malgré un corpus départemental antérieur).
- `https://landes.cci.fr/feed/` et `https://www.landes.cci.fr/feed/` : 500 (le flux n'est pas publié ; la page `/presse/`, en 200, est retenue).
- `https://www.aquitaineonline.com/rss.xml` : 404 (le site et sa rubrique Landes restent consultables mais sans flux).
- `https://www.landes.fr/actualites` : 403 (blocage).

Limite de périmètre : MEDEF, CPME, UIMM, CMA et BODACC sont des structures régionales ou nationales ; elles complètent les organisations strictement landaises (CCI des Landes, CPME 40, MEDEF des Landes, Grand Dax, clubs d'entreprises) et les éditions locales de presse.
