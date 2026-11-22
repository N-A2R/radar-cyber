# Couverture — sources « agriculture » de la Dordogne (24)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **18 sources, 43 URLs toutes en HTTP 200** (dont 8 flux RSS) contrôlées le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Chambre d'agriculture de la Dordogne | chambre consulaire | https://dordogne.chambres-agriculture.fr/ | https://dordogne.chambres-agriculture.fr/actualites-1 | — |
| FDSEA de la Dordogne | syndicat agricole | https://fdsea24.fr/ | https://fdsea24.fr/actualites/ | https://fdsea24.fr/feed/ (6 items) |
| Jeunes Agriculteurs de la Dordogne | syndicat agricole | https://www.jeunesagriculteurs24.fr/ | https://www.jeunesagriculteurs24.fr/actualites | — |
| Cerfrance Dordogne | centre de gestion agricole | https://www.cerfrancedordogne.fr/ | https://www.cerfrancedordogne.fr/blog | — |
| CER France (réseau national) | centre de gestion agricole | https://dordogne.cerfrance.fr/ | https://www.cerfrance.fr/actualites/ | — |
| CCI Dordogne | chambre consulaire | https://dordogne.cci.fr/ | https://dordogne.cci.fr/actualites/ | https://dordogne.cci.fr/feed/ (10 items) |
| SAFER Nouvelle-Aquitaine (antenne Dordogne) | safer foncière agricole | https://www.saferna.fr/ | https://www.saferna.fr/actualites/ | https://www.saferna.fr/feed/ (10 items) |
| Fédération régionale des Cuma Nouvelle-Aquitaine | fédération coopérative agricole | https://nouvelle-aquitaine.cuma.fr/ | https://nouvelle-aquitaine.cuma.fr/actualites/ | — |
| Fédération des Cuma de la Dordogne (annuaire FNCuma) | annuaire professionnel agricole | https://www.cuma.fr/contacter-une-federation/?_fselect_department=24 | https://www.cuma.fr/actualites/ | — |
| Sud Ouest — Dordogne | presse régionale | https://www.sudouest.fr/dordogne/ | https://www.sudouest.fr/economie/agriculture | https://www.sudouest.fr/dordogne/rss.xml (20 items) |
| actu.fr — Dordogne | presse locale | https://actu.fr/ | https://actu.fr/nouvelle-aquitaine/dordogne_24/ | — |
| ICI Périgord (Radio France) | radio locale | https://www.ici.fr/radio/perigord | https://www.ici.fr/nouvelle-aquitaine/dordogne-24/actu | https://www.ici.fr/rss/perigord/rubrique/infos.xml (20 items) |
| France 3 Nouvelle-Aquitaine — Dordogne | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/ | https://france3-regions.franceinfo.fr/economie/agriculture | — |
| Réussir (presse agricole spécialisée) | presse agricole spécialisée | https://www.reussir.fr/ | https://www.reussir.fr/fil-actualites | https://www.reussir.fr/rss.xml (20 items) |
| La France Agricole | presse agricole spécialisée | https://www.lafranceagricole.fr/ | https://www.lafranceagricole.fr/actualites/ | — |
| Réussir le Périgord | presse agricole spécialisée | https://www.reussirleperigord.fr/ | https://www.reussirleperigord.fr/actualite | https://www.reussirleperigord.fr/feed (10 items) |
| Dordogne Libre | presse locale | https://www.dordognelibre.fr/ | https://www.dordognelibre.fr/ | https://www.dordognelibre.fr/rss.xml (20 items) |
| Annuaire des Chambres d'agriculture (réseau national) | annuaire professionnel agricole | https://www.chambres-agriculture.fr/ | https://www.chambres-agriculture.fr/actualites/ | — |

## Preuve

- Corpus : `bench/corpus/sources-agriculture-24.jsonl` (champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Relevé HTTP : `bench/results/verification-agriculture-24.json` — 43 URLs, 43 codes 200, types de contenu, nombre d'items RSS et détection des pages de blocage Cloudflare.
- Migration : `db/migrate-084-sources-agriculture-24.sql` — 18 lignes `source` et 43 traces `source_verification` en `ok200`.

## Exemples cyber rattachés

- CCI Dordogne : « RGPD : attention aux arnaques ! » — https://dordogne.cci.fr/rgpd-attention-aux-arnaques/ (15/01/2019), article vérifié en 200.
- Sud Ouest — Dordogne : « Cyberattaque dans des supermarchés : plusieurs magasins visés en Dordogne » — https://www.sudouest.fr/dordogne/cyberattaque-dans-des-supermarches-plusieurs-magasins-vises-en-dordogne-31039218.php (12/10/2026), filière alimentaire, article vérifié en 200.

## Candidats écartés

- `https://ja24.fr/`, `https://www.ja24.fr/`, `https://www.ja-agriculteurs.fr/` : 000 (DNS) — le vrai site est `jeunesagriculteurs24.fr`, retenu.
- `https://dordogne.chambagri.fr/` et `/actualites/` : erreur TLS (certificat sans ce nom d'hôte) — domaine `chambres-agriculture.fr` retenu à la place.
- `https://actu.fr/nouvelle-aquitaine/dordogne_24/rss.xml` : HTTP 200 mais page Cloudflare « Attention Required! », pas un flux — exclu.
- `https://dordogne.chambres-agriculture.fr/actualites-1/rss` et `/actualites.rss` : 404 — la chambre n'expose pas de flux RSS public.
- `https://www.terredeliens.org/nouvelle-aquitaine/` et `/nouvelle-aquitaine/actualites/` : 404.
- `https://www.reussirleperigord.fr/actualites/` : 404 — la rubrique est `/actualite`.

Limite de périmètre : les rubriques « agriculture » de Sud Ouest, France 3, Réussir et La France Agricole sont nationales/régionales mais couvrent la Dordogne ; le flux ICI est celui de la station Périgord (pas de flux départemental dédié).
