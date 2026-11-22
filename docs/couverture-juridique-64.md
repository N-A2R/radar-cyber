# Couverture — sources « juridique » des Pyrénées-Atlantiques (64)

16 sources vérifiées en HTTP 200 le 2026-11-22 (44 URLs contrôlées, 12 flux RSS déclarés).

| Source | Type | Site | Actualités / flux |
| --- | --- | --- | --- |
| Ordre des avocats de Pau | ordre professionnel d'avocats | https://www.avocats-pau.fr/ | bloc Actualités de l'accueil — flux https://www.avocats-pau.fr/rss.xml (0 item, flux vide mais actif) |
| Chambre interdépartementale des notaires Atlantique et Pyrénées (Pau) | chambre professionnelle notariale | https://cr-pau.notaires.fr/ | https://cr-pau.notaires.fr/actualite |
| Tribunal administratif de Pau | juridiction administrative | https://pau.tribunal-administratif.fr/ | https://pau.tribunal-administratif.fr/actualites — flux https://pau.tribunal-administratif.fr/flux-rss/dernieres-decisions (20 items) |
| Cour d'appel de Pau | juridiction | https://www.justice.gouv.fr/annuaire/fiche/cour-d-appel-de-pau | https://www.justice.gouv.fr/actualites — flux https://www.justice.gouv.fr/rss.xml (10 items) |
| Tribunal de commerce de Pau | juridiction | https://www.justice.gouv.fr/annuaire/fiche/tribunal-de-commerce-de-pau | https://www.justice.gouv.fr/actualites — flux https://www.justice.gouv.fr/rss.xml |
| Tribunal judiciaire de Pau | juridiction | https://www.justice.gouv.fr/annuaire/fiche/tribunal-judiciaire-de-pau | https://www.justice.gouv.fr/actualites — flux https://www.justice.gouv.fr/rss.xml |
| CCI Pau Béarn | chambre consulaire — commerce et industrie | https://pau.cci.fr/ | https://pau.cci.fr/blog/ — flux https://pau.cci.fr/feed/ (10 items) |
| CMA Nouvelle-Aquitaine — Pyrénées-Atlantiques | chambre consulaire — métiers et artisanat | https://cma-nouvelleaquitaine.fr/ | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites |
| ici Béarn Bigorre — faits divers et justice | presse locale — radio publique | https://www.ici.fr/radio/bearn | https://www.ici.fr/infos/faits-divers-justice — flux https://www.ici.fr/rss/bearn/rubrique/infos.xml (20 items) |
| La République des Pyrénées | presse quotidienne locale | https://www.larepubliquedespyrenees.fr/ | https://www.larepubliquedespyrenees.fr/faits-divers/justice/ — flux https://www.larepubliquedespyrenees.fr/rss.xml (20 items) |
| UDAF 64 — Union départementale des associations familiales | union d'associations — droit de la famille | https://www.udaf64.fr/ | https://www.udaf64.fr/actualites/ — flux https://www.udaf64.fr/feed/ (10 items) |
| Notaires de France — annuaire des Pyrénées-Atlantiques | annuaire professionnel notarial | https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/pyrenees-atlantiques | https://www.notaires.fr/fr/actualites — flux https://www.notaires.fr/fr/rss/actualites (420 items) |
| Chambre nationale des commissaires de justice | ordre professionnel | https://commissaire-justice.fr/ | https://commissaire-justice.fr/actualites/ — flux https://commissaire-justice.fr/feed/ (10 items) |
| Avocat.fr — actualités du barreau | annuaire et actualités de la profession d'avocat | https://www.avocat.fr/ | https://www.avocat.fr/actualites — flux https://www.avocat.fr/rss.xml (10 items) |
| Ordre des avocats de Bayonne | ordre professionnel d'avocats | https://www.avocats-bayonne.org/ | https://www.avocats-bayonne.org/le-barreau/actualites.html — flux https://www.avocats-bayonne.org/le-barreau/actualites.feed?type=rss (2 items) |
| Greffe du tribunal de commerce de Pau | greffe — juridiction consulaire | https://www.greffe-tc-pau.fr/ | https://www.greffe-tc-pau.fr/actualites |

## Preuve

- Corpus : `bench/corpus/sources-juridique-64.jsonl` (16 lignes, 9 ch chacune).
- Contrôle HTTP détaillé : `bench/results/verification-juridique-64.json` (44 URLs, 44 codes 200, types de contenu, URL finales, items RSS).
- Intégration base : `db/migrate-170-sources-juridique-64.sql` — 16 lignes dans `source`, 44 traces `ok200` dans `source_verification`, appliquées le 2026-11-22.

## Candidats écartés

- `barreau-pau.fr`, `pays-basque.cci.fr` : domaines inexistants ; `avocats-pau.fr` (site officiel de l'Ordre) et `pau.cci.fr` retenus.
- `cours-appel.justice.fr/pau/...` : HTTP 200 mais page « Site en cours de maintenance » ; fiches officielles `justice.gouv.fr/annuaire/fiche/...` retenues pour les juridictions du ressort.
- `sudouest.fr/pyrenees-atlantiques/pau/` : HTTP 302 sans code 200 vérifiable ; `actu.fr/nouvelle-aquitaine/pau_64483/` : HTTP 403. La République des Pyrénées et ICI Béarn Bigorre couvrent le département.
- `avocats-pau.fr/actualites`, `avocats-pau.fr/feed/`, `pau.tribunal-administratif.fr/rss.xml`, `cr-pau.notaires.fr/rss.xml`, `mediabask.eus/rss.xml` : HTTP 404 ; rubriques ou flux réels listés ci-dessus retenus.

## Méthode

Recherche des organisations du droit dans les Pyrénées-Atlantiques (ordre des avocats de Pau, notariat de Pau, tribunaux et cour d'appel, chambres consulaires, presse locale, UDAF, annuaires professionnels), lecture des pages publiques pour repérer rubriques d'actualités et flux, puis contrôle HTTP de chaque URL par GET avec redirections suivies (User-Agent `RadarCyberCorpus/1.0`, timeout 25 s). Seules les URL ayant répondu 200 ont été intégrées au corpus et à la base.

OBJECTIF : atteint — 16 / 5
