# Couverture — sources « juridique » du Lot-et-Garonne (47)

14 sources vérifiées en HTTP 200 le 2026-11-22 (32 URLs contrôlées, 5 flux RSS exploitables).

| Source | Type | Site | Actualités / flux |
| --- | --- | --- | --- |
| Barreau d'Agen | ordre professionnel d'avocats | https://www.barreau-agen.fr/ | https://www.barreau-agen.fr/actualites/ — flux https://www.barreau-agen.fr/rss.xml (30 items) |
| Tribunal judiciaire d'Agen | juridiction | https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-dagen | https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-dagen/actualites |
| Tribunal judiciaire de Marmande | juridiction | https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-marmande | https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-marmande/actualites |
| Tribunal judiciaire de Nérac | juridiction | https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-nerac | https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-nerac/actualites |
| Notaires de France — annuaire du Lot-et-Garonne | annuaire professionnel notarial | https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/lot-et-garonne | https://www.notaires.fr/fr/actualites |
| Chambre nationale des commissaires de justice | ordre professionnel | https://commissaire-justice.fr/ | https://commissaire-justice.fr/actualites/ — flux https://commissaire-justice.fr/feed/ (10 items) |
| Avocat.fr — actualités du barreau | annuaire professionnel d'avocats | https://www.avocat.fr/ | https://www.avocat.fr/actualites — flux https://www.avocat.fr/rss.xml (10 items) |
| ICI Gascogne — Lot-et-Garonne, faits divers et justice | presse locale | https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47 | https://www.ici.fr/infos/faits-divers-justice — flux https://www.ici.fr/rss/gascogne/rubrique/infos.xml (20 items) |
| La Dépêche du Midi — Lot-et-Garonne | presse locale | https://www.ladepeche.fr/lot-et-garonne | https://www.ladepeche.fr/communes/lot-et-garonne/ |
| Conseil départemental de l'accès au droit du Lot-et-Garonne (CDAD 47) | CDAD / groupement d'intérêt public | https://www.cdad47.info/ | https://www.cdad47.info/colloques-du-cdad47-10 |
| Chambre interdépartementale des notaires (Agen) | chambre professionnelle notariale | https://ci-agen.notaires.fr/ | https://ci-agen.notaires.fr/actualite?type=1&page=1 |
| UDAF 47 — Union départementale des associations familiales | association de défense des droits des familles | https://www.udaf47.fr/ | https://www.udaf47.fr/actualites-udaf47/ |
| Cour d'appel d'Agen | cour d'appel | https://www.justice.gouv.fr/annuaire/fiche/cour-d-appel-d-agen | https://www.justice.gouv.fr/actualites — flux https://www.justice.gouv.fr/rss.xml (10 items) |
| Tribunal de commerce d'Agen | juridiction | https://www.justice.gouv.fr/annuaire/fiche/tribunal-de-commerce-d-agen | https://www.justice.gouv.fr/actualites — flux https://www.justice.gouv.fr/rss.xml (10 items) |

## Preuve

- Corpus : `bench/corpus/sources-juridique-47.jsonl` (champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Relevé HTTP : `bench/results/verification-juridique-47.json` — 32 URLs, 32 codes 200, types de contenu, URL finales et nombres d'items RSS.
- Contrôle : GET réel, redirections suivies, User-Agent `RadarCyberCorpus/1.0`, délai 20 s ; rejoué le 2026-11-22.
- Migration : `db/migrate-148-sources-juridique-47.sql` — 14 lignes `source` et 34 traces `source_verification` en `ok200`.

## Candidats écartés

- `barreaudemarmande.fr`, `agen.tribunal-administratif.fr`, `cr-toulouse.notaires.fr` : domaines inexistants ; juridictions du ressort de Bordeaux et annuaire notarial retenus.
- `actu.fr/lot-et-garonne/` et son flux : HTTP 404 ; `sudouest.fr/lot-et-garonne/` : HTTP 302 sans code 200 vérifiable. ICI Gascogne et La Dépêche couvrent le département.
- `ladepeche.fr/rss` et `barreau-agen.fr/feed/` : HTTP 404 ; le flux réel du barreau est `rss.xml` (30 items).
- `cours-appel.justice.fr/agen` : 200 mais page en maintenance ; fiches officielles `justice.gouv.fr/annuaire/fiche/...` retenues. `justice.fr/annuaire/juridiction/tribunal-judiciaire-dagen` et `notaires.fr/fr/rss.xml` (HTML, pas un flux) écartés.
- `cdad47.info/rss.xml` et `ci-agen.notaires.fr/rss.xml` : 404 ; pages d'actualités existantes retenues comme URL de suivi.

## Méthode

Recherche des organisations du droit dans le Lot-et-Garonne (barreau, tribunaux, notariat, commissaires de justice, annuaires d'avocats, presse locale avec rubrique justice), lecture des pages publiques pour repérer les rubriques d'actualités et les flux, puis contrôle HTTP de chaque URL retenue. Exa hors crédits (402) : découverte par moteurs de recherche alternatifs et sites officiels, chaque URL étant vérifiée individuellement.
