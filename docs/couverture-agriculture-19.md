# Couverture — sources « agriculture » de la Corrèze (19)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **10 sources, 24 URLs toutes en HTTP 200** (dont 4 flux RSS) contrôlées le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Chambre d'agriculture de la Corrèze | chambre consulaire | https://correze.chambres-agriculture.fr/ | https://correze.chambres-agriculture.fr/actualites-1 | — |
| FDSEA de la Corrèze | syndicat agricole | https://fdsea19.fr/ | https://fdsea19.fr/actualites/ | https://fdsea19.fr/feed/ (9 items) |
| La Montagne — Corrèze | presse locale | https://www.lamontagne.fr/correze/ | https://www.lamontagne.fr/economie/agriculture | — |
| ICI Corrèze (Radio France) | radio locale | https://www.ici.fr/radio/limousin | https://www.ici.fr/nouvelle-aquitaine/correze-19/actu | https://www.ici.fr/rss/limousin/rubrique/infos.xml (20 items) |
| actu.fr — Corrèze | presse locale | https://actu.fr/ | https://actu.fr/nouvelle-aquitaine/correze_19/ | — |
| Réussir (presse agricole spécialisée) | presse agricole spécialisée | https://www.reussir.fr/ | https://www.reussir.fr/fil-actualites | https://www.reussir.fr/rss.xml (20 items) |
| Sud Ouest — Corrèze | presse régionale | https://www.sudouest.fr/correze/ | https://www.sudouest.fr/economie/agriculture | https://www.sudouest.fr/correze/rss.xml (20 items) |
| France 3 Nouvelle-Aquitaine — Corrèze | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/ | https://france3-regions.franceinfo.fr/economie/agriculture | — |
| La France Agricole | presse agricole spécialisée | https://www.lafranceagricole.fr/ | https://www.lafranceagricole.fr/actualites/ | — |
| CER France Corrèze (centre de gestion agricole) | centre de gestion agricole | https://correze.cerfrance.fr/ | https://www.cerfrance.fr/actualites/ | — |

## Preuve

- Corpus : `bench/corpus/sources-agriculture-19.jsonl` (champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Relevé HTTP : `bench/results/verification-agriculture-19.json` — 24 URLs, 24 codes 200, types de contenu et nombre d'items RSS enregistrés.
- Migration : `db/migrate-076-sources-agriculture-19.sql` — 10 lignes `source` et 24 traces `source_verification` en `ok200`.

## Exemples cyber rattachés

- Chambre d'agriculture : « Achat de fourrage : attention aux offres frauduleuses » (07/10/2026) — article vérifié en 200 sur le site de la chambre.
- Réussir : cyberattaque chez EDE 19 (Corrèze), 30 000 éleveurs perturbés (16/01/2025) — article vérifié en 200.
- France 3 Nouvelle-Aquitaine : cyberattaque d'une mairie de Corrèze, 44 000 euros perdus (20/06/2025).

## Candidats écartés

- `https://ja19.fr/`, `https://www.ja19.fr/`, `https://jeunesagriculteurs19.fr/` : 000 (DNS) — aucun site Jeunes Agriculteurs 19 joignable.
- `https://www.correze.chambagri.fr/` : 000 — ancien domaine obsolète.
- `https://cer19.fr/`, `https://cerfrance19.fr/`, `https://cga19.fr/`, `https://terredeliens19.fr/`, `https://coop19.fr/` : 000 (DNS).
- `https://correze.chambres-agriculture.fr/actualites.rss` et `/actualites-1/rss` : 404 — la chambre n'expose pas de flux RSS public.
- `https://www.lamontagne.fr/rss/correze.xml` : 404 — aucun flux Corrèze public identifié.
- `https://actu.fr/nouvelle-aquitaine/correze_19/rss.xml` : 403.

Limite de périmètre : le flux ICI est celui de la station Limousin (pas de flux Corrèze dédié), et les rubriques « agriculture » de France 3, Sud Ouest, La Montagne et La France Agricole sont nationales/régionales mais couvrent le département.
