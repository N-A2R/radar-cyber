# Sources du secteur « santé » — Lot-et-Garonne (47)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **13 sources, 42 URL distinctes toutes en HTTP 200** le 2026-11-22 (44 traces de vérification, 6 flux XML vérifiés).

- Corpus : `bench/corpus/sources-sante-47.jsonl` (13 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-sources-sante-47.json` — code, type de contenu et URL effective contrôlés pour le site, la page d'actualités, le flux et l'article cyber de chaque source.
- Intégration : `db/migrate-123-sources-sante-47.sql` — 13 lignes dans `source` (identifiants `corpus:sante47-*`), 44 traces `ok200` dans `source_verification`.
- Empreinte du corpus consolidé : `9d5771ccec224158ca5faab9a3dd66aecb7059d9fd2ed985c23901aee026bed3`.

## Organisations retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| ARS Nouvelle-Aquitaine — délégation Lot-et-Garonne | agence régionale de santé | https://www.nouvelle-aquitaine.ars.sante.fr/ | https://www.nouvelle-aquitaine.ars.sante.fr/liste-actualites?archive=0 | https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite |
| CPAM du Lot-et-Garonne — Assurance Maladie | caisse d'assurance maladie | https://www.ameli.fr/lot-et-garonne/assure | https://www.ameli.fr/lot-et-garonne/assure/liste-actualites-locales | — |
| Conseil de l'Ordre des médecins du Lot-et-Garonne | ordre professionnel de santé | https://conseil47.ordre.medecin.fr/ | https://conseil47.ordre.medecin.fr/actualites/ | — |
| Santé publique France — Nouvelle-Aquitaine | agence de santé publique | https://www.santepubliquefrance.fr/regions-et-territoires/nouvelle-aquitaine | https://www.santepubliquefrance.fr/regions/nouvelle-aquitaine/actualites | https://www.santepubliquefrance.fr/rss.xml |
| ESEA Nouvelle-Aquitaine — GRADeS e-santé | groupement régional e-santé | https://www.esea-na.fr/ | https://www.esea-na.fr/actualites | — |
| URPS Pharmaciens Nouvelle-Aquitaine | union professionnelle de santé | https://www.urps-pharmaciens-na.fr/ | https://www.urps-pharmaciens-na.fr/actualites/ | — |
| Mutualité Française Nouvelle-Aquitaine | mutuelle de santé | https://nouvelle-aquitaine.mutualite.fr/ | https://nouvelle-aquitaine.mutualite.fr/actualites/ | — |
| La Dépêche du Midi — Lot-et-Garonne (santé) | presse locale | https://www.ladepeche.fr/communes/lot-et-garonne,47/ | https://www.ladepeche.fr/partenaire/sante-bien-etre/sante/ | https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml |
| Le Petit Bleu d'Agen — santé | presse locale | https://www.petitbleu.fr/ | https://www.petitbleu.fr/sante/ | https://www.petitbleu.fr/sante/rss.xml |
| ICI Lot-et-Garonne | radio locale | https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47 | https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu | https://www.ici.fr/rss/gascogne/rubrique/infos.xml |
| La Vie Économique — Lot-et-Garonne | presse économique locale | https://www.vie-economique.com/categories/lot-et-garonne/ | https://www.vie-economique.com/categories/lot-et-garonne/ | https://www.vie-economique.com/categories/lot-et-garonne/feed/ |
| La Semaine des Pyrénées — Lot-et-Garonne | presse locale | https://www.lasemainedespyrenees.fr/ | https://www.lasemainedespyrenees.fr/category/lot-et-garonne/ | — |
| Journal de Tonneins | presse locale | https://www.journaldetonneins.fr/ | https://www.journaldetonneins.fr/toutes-les-actualites | — |

## Exemples cyber

- ARS Nouvelle-Aquitaine : incident de sécurité concernant la plateforme de recueil des autorisations parentales des 0-18 ans (article dédié, HTTP 200).
- CPAM 47 / La Vie Économique 47 : données de patients du CHU de Reims exposées après la cyberattaque d'un logiciel médical.
- Conseil de l'Ordre des médecins 47 : tentatives d'hameçonnage visant les médecins (article du Conseil national, HTTP 200).
- Santé publique France : prestataire victime d'une cyberattaque, près de 80 000 données de contact concernées (France Info, HTTP 200).
- ESEA Nouvelle-Aquitaine : cybersécurité des systèmes d'information de santé (wwwsec.esea-na.fr, HTTP 200).
- URPS Pharmaciens NA : formation « Cybermenaces et professionnels libéraux » (article dédié, HTTP 200).
- Mutualité Française NA : cyberattaques chez Novabio, données de santé en fuite.
- La Dépêche 47 : factures médicales de patients de l'hôpital Foch exposées après une cyberattaque.
- Le Petit Bleu d'Agen / Journal de Tonneins : dossiers de patients du centre hospitalier de Perpignan en fuite.
- ICI Lot-et-Garonne : plongée dans la cybersécurité du CHU de Bordeaux (une vingtaine d'attaques par jour).
- La Semaine des Pyrénées 47 : clinique privée sanctionnée de 500 000 € après un vol de données (Le Figaro, HTTP 200).

## Candidats écartés

- `www.ch-agen.fr`, `www.ch-villeneuve.fr`, `www.ch-marmande.fr` : échec de connexion TLS/réseau (HTTP 000) — aucun HTTP 200.
- `lotetgaronne.msa.fr`, `www.fhp47.fr`, `urps-medecins-na.fr` : NXDOMAIN ou échec réseau — non retenus.
- Le quota de recherche Exa étant épuisé (402), la découverte a été complétée par des URL connues et vérifiées une à une avec `curl -L` ; aucune URL non vérifiée n'a été intégrée.
