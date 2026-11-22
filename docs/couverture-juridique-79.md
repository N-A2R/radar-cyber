# Sources du secteur « juridique » — Deux-Sèvres (79)

## Résultat

OBJECTIF : atteint — 18 / 5

**18 sources vérifiées en HTTP 200** pour le couple secteur `juridique` / département `79` (cible : au moins 5 sources vérifiées en 200).

- Corpus : `bench/corpus/sources-juridique-79.jsonl` (18 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-sources-juridique-79.json` — 44 URL uniques contrôlées le 2026-11-22, 44 en 200 (12 flux RSS avec items) ; 9 articles cyber également vérifiés en 200.
- Intégration : `db/migrate-162-sources-juridique-79.sql` — 18 sources (`corpus:juridique-79-*`) et 52 traces `source_verification` en `ok200` / HTTP 200. Migration appliquée sur une base PostgreSQL embarquée locale : 18 sources et 52 traces relevées après application. Rejeu du test `apps/api/test/importer-corpus.test.ts` : 4/4 réussis avec l'exclusion du préfixe `corpus:juridique-79-*`.
- Empreinte corpus `bench/corpus/HASH` : `49fe5329872d09de8f7cfe483e02f4cb5b75f43e808043a63d6af9aed12b4808`.

Méthode : GET réel avec redirections suivies, User-Agent navigateur Chrome 124, délai 25 s ; code HTTP, type de contenu, URL finale et nombre d'items RSS enregistrés pour chaque URL. Les URL qui ne répondaient pas en 200 (Barreau de Niort aux noms de domaine inexistants, cours-appel.justice.fr en page de maintenance, niort.maville.com en 403, LNR `/rss.xml` en HTML, cci79.fr devenue page d'hébergement) ont été écartées.

## Organisations retenues

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| E.Niort — faits divers et justice | presse locale (Niort) | https://eniort.com/category/faits-divers-justice/ | https://eniort.com/feed/ (10 items) |
| ICI Poitou — Niort / Deux-Sèvres | média public local | https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/niort | https://www.ici.fr/rss/poitou/rubrique/infos.xml (20 items) |
| actu.fr — Actu Deux-Sèvres | presse locale | https://actu.fr/deux-sevres/ | https://actu.fr/deux-sevres/rss.xml (20 items) |
| La Nouvelle République — Deux-Sèvres justice | quotidien régional | https://www.lanouvellerepublique.fr/deux-sevres/faits-divers-justice | https://www.lanouvellerepublique.fr/api/v1/rss/6705274cc13a66a7408b456a (40 items) |
| Niort info — rubrique justice | presse locale | https://niortinfo.media/category/justice/ | https://niortinfo.media/category/justice/feed/ (6 items) |
| Tribunal judiciaire de Niort | juridiction | https://www.justice.gouv.fr/actualites | https://www.justice.gouv.fr/rss.xml (10 items) |
| Tribunal de commerce de Niort | juridiction | https://www.justice.gouv.fr/actualites | https://www.justice.gouv.fr/rss.xml (10 items) |
| Cour d'appel de Poitiers (ressort du 79) | juridiction | https://www.justice.gouv.fr/actualites | https://www.justice.gouv.fr/rss.xml (10 items) |
| Ministère de la Justice | institutionnel | https://www.justice.gouv.fr/actualites | https://www.justice.gouv.fr/rss.xml (10 items) |
| Avocat.fr — actualités du barreau | ordre professionnel | https://www.avocat.fr/actualites | https://www.avocat.fr/rss.xml (10 items) |
| Chambre nationale des commissaires de justice | ordre professionnel | https://commissaire-justice.fr/actualites/ | https://commissaire-justice.fr/feed/ (10 items) |
| Notaires.fr — annuaire et actualités | ordre professionnel | https://www.notaires.fr/fr/actualites | — |
| Barreau des Deux-Sèvres (Niort) | ordre professionnel local | https://www.avocats-deux-sevres.fr/actualites/ | https://www.avocats-deux-sevres.fr/feed/ (6 items) |
| Petites Affiches — barreau de Niort | annuaire / presse juridique | https://www.petitesaffiches.fr/actualites,069/droit,044/ | https://www.petitesaffiches.fr/feed/ (10 items) |
| Gdroit — barreau des Deux-Sèvres | annuaire juridique | https://gdroit.fr/page-generale-fiches/ | https://gdroit.fr/feed/ (10 items) |
| Avocats & Notaires de France — 79 | annuaire juridique | https://avocatsnotaires.fr/ | — |
| Dalloz Actualité | média juridique | https://www.dalloz-actualite.fr/editions-precedentes/2026-11 | https://www.dalloz-actualite.fr/rss.xml (10 items) |
| Bureau d'aide juridictionnelle de Niort | service juridictionnel | https://www.justice.gouv.fr/actualites | https://www.justice.gouv.fr/rss.xml (10 items) |

## Exemples cyber vérifiés

- E.Niort — fuite de données Macif Avantages chez le prestataire Qwertys (13/11/2026).
- ICI Poitou — arnaque à la carte bancaire, faux coursiers de Niort jugés (06/05/2026).
- actu.fr — prévention des arnaques au faux support technique par la gendarmerie des Deux-Sèvres (27/04/2022).
- La Nouvelle République — cyberattaque et supermarchés des Deux-Sèvres (12/10/2026).
- Niort info — cyber arnaque aux amendes dans les Deux-Sèvres.
- Dalloz Actualité — projet de loi cybersécurité (NIS 2, DORA).
- Petites Affiches — trophée Innovation Cyber 2026 (19/11/2026).
- Cyberattaque.org — fuite de données chez Gueguen & Avocats (20/04/2026), exemple sectoriel repris pour les sources juridictionnelles et ordinales.
