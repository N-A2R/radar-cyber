# Sources du secteur « juridique » — Vienne (86)

## Résultat

OBJECTIF : atteint — 12 / 5

**12 sources vérifiées en HTTP 200** pour le couple secteur `juridique` / département `86` (cible : au moins 5 sources vérifiées en 200).

- Corpus : `bench/corpus/sources-juridique-86.jsonl` (12 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-sources-juridique-86.json` — 36 URL uniques contrôlées le 2026-11-22, **36 en 200** (7 flux RSS avec items) ; les URL des articles cyber cités ont aussi été vérifiées en 200.
- Intégration : `db/migrate-121-sources-juridique-86.sql` — 12 sources (`corpus:juridique-86-*`) et 42 traces `source_verification` en `ok200` / HTTP 200. Migration appliquée sur une base PostgreSQL 18.6 embarquée locale : 12 sources et 42 traces relevées après application (`code_http` min = max = 200).
- Empreinte corpus `bench/corpus/HASH` : `82504d813a0bfcbd18611237dae0bbd9b0f41c79af3d6b15f45a8298b11b977a`.

Méthode : GET réel avec redirections suivies, User-Agent navigateur Chrome 124, délai 25 s ; code HTTP, type de contenu, URL finale et nombre d'items RSS enregistrés pour chaque URL. Les flux `text/html` de Le7.info sont des documents RSS valides (10 items) malgré un type de contenu mal déclaré par le serveur. Les URL qui ne répondaient pas en 200 (feeds `/feed` des notaires d'Atlantique-Poitou, pages `/actualites/` de la CRCJ de Poitiers, `/vienne/` et `/vienne/rss.xml` d'actu.fr, `/rss.xml` du CNB) ont été écartées.

## Organisations retenues

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Ordre des avocats de Poitiers | ordre professionnel (barreau 86) | https://www.avocats-poitiers.com/notre-actualite/ | https://www.avocats-poitiers.com/feed/ (0 item) |
| Conseil national des barreaux | fédération des barreaux (couvre le 86) | https://cnb.avocat.fr/nos-actualites | — |
| Chambre régionale des commissaires de justice de Poitiers | ordre professionnel (ressort 86) | https://www.crcjpoitiers.fr/ | https://www.crcjpoitiers.fr/feed/ (1 item) |
| Chambre interdépartementale des notaires d'Atlantique-Poitou | chambre professionnelle (inclut le 86) | https://atlantiquepoitou.notaires.fr/actualite | — |
| Notaires.fr | ordre professionnel (annuaire, couvre le 86) | https://www.notaires.fr/fr/actualites | — |
| CDAD de la Vienne | institution départementale d'accès au droit | https://www.cdad-vienne.fr/category/vos-droits/ | — |
| Tribunal judiciaire de Poitiers | juridiction (86) | https://www.justice.gouv.fr/actualites | https://www.justice.gouv.fr/rss.xml (10 items) |
| Gdroit — barreau de Poitiers | annuaire juridique (cabinets du 86) | https://gdroit.fr/page-generale-fiches/ | https://gdroit.fr/feed/ (8 items) |
| Petites Affiches — barreau de Poitiers | annuaire et presse juridique (86) | https://www.petitesaffiches.fr/actualites,069/droit,044/ | https://www.petitesaffiches.fr/feed/ (10 items) |
| La Nouvelle République — Vienne justice | quotidien régional (édition 86) | https://www.lanouvellerepublique.fr/vienne/faits-divers-justice | https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c (40 items) |
| ICI Poitou — Vienne (86) | média public local | https://www.ici.fr/nouvelle-aquitaine/vienne-86 | https://www.ici.fr/rss/poitou/rubrique/infos.xml (20 items) |
| Le7.info — justice (Vienne 86) | presse locale en ligne | https://www.le7.info/tag/38-justice | https://www.le7.info/rss.xml (10 items) |

## Exemples cyber vérifiés

- La Nouvelle République — cabinet d'avocats de Poitiers frappé par une cyberattaque avec rançon en bitcoins (17/10/2016).
- La Nouvelle République — cyberattaque des réseaux de Poitiers et Grand Poitiers, tentative de chiffrement avec demande de rançon (04/09/2025).
- CNB — « Menaces cyber : le CNB fait le point » (27/08/2026).
- ICI Poitou — collectivités de Poitiers et Grand-Poitiers victimes d'une cyberattaque (02/09/2025).
- Le7.info — cinq mineurs poursuivis pour violences et cyberharcèlement à Poitiers (15/10/2026).
- Petites Affiches — trophée Innovation Cyber 2026 décerné à Optivalue.ai (19/11/2026).
