# Sources du secteur « industrie » — Lot-et-Garonne (47)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **9 sources, 30 URL distinctes toutes en HTTP 200** le 2026-11-22 (5 flux XML vérifiés, 32 traces de vérification prévues en base).

- Corpus : `bench/corpus/sources-industrie-47.jsonl` (9 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-industrie-47.json` — code, type de contenu et URL contrôlés pour les sites, pages d'actualités, flux et articles cyber.
- Intégration : `db/migrate-122-sources-industrie-47.sql` — 9 lignes dans `source` (identifiants `corpus:industrie-47-*`), 32 traces `ok200` dans `source_verification`.
- Empreinte du corpus consolidé : `c1855150e6a34042ac5786870c4031cf173a8b4144308823b82309eca3c06350`.

## Organisations retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| CCI du Lot-et-Garonne | chambre consulaire | https://cci47.fr/ | https://cci47.fr/actualites/ | — |
| CPME du Lot-et-Garonne | fédération patronale | https://www.cpme47.fr/ | https://www.cpme47.fr/actualites/ | — |
| UIMM — La Fabrique de l’avenir | fédération industrielle | https://uimm.lafabriquedelavenir.fr/ | https://uimm.lafabriquedelavenir.fr/actualites/ | https://uimm.lafabriquedelavenir.fr/feed/ |
| La Vie Économique — Lot-et-Garonne | presse économique locale | https://www.vie-economique.com/ | https://www.vie-economique.com/categories/lot-et-garonne/ | https://www.vie-economique.com/categories/lot-et-garonne/feed/ |
| La Dépêche du Midi — Lot-et-Garonne | presse locale | https://www.ladepeche.fr/ | https://www.ladepeche.fr/communes/lot-et-garonne,47/ | https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml |
| Le Petit Bleu d’Agen | presse locale | https://www.petitbleu.fr/ | https://www.petitbleu.fr/economie/ | https://www.petitbleu.fr/economie/rss.xml |
| ICI Lot-et-Garonne | radio locale | https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47 | https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu | https://www.ici.fr/rss/gascogne/rubrique/infos.xml |
| Agglomération d’Agen — développement économique | intercommunalité | https://www.agglo-agen.net/ | https://www.agglo-agen.net/en-ce-moment/actualites | — |
| Journal de Tonneins | presse locale | https://www.journaldetonneins.fr/ | https://www.journaldetonneins.fr/toutes-les-actualites | — |

## Exemples cyber

- CCI 47 : page « Cybersécurité – Protégez votre entreprise en Lot-et-Garonne » (https://cci47.fr/cybersecurite/).
- CPME 47 : « Lancement d’ImpactCyber pour inciter les TPE-PME à se sécuriser » (article dédié, HTTP 200).
- UIMM : « Les machines industrielles sont les grandes oubliées de la cybersécurité » (article dédié, HTTP 200).
- La Vie Économique : « Cybersécurité – La troisième édition de Garonn’Hack à Agen » (article dédié, HTTP 200).
- La Dépêche 47 : cyberattaque de la mairie de Fumel (03/10/2025), services paralysés.
- Le Petit Bleu / ICI 47 : cyberattaque de la Ville d’Agen (12/07/2023) et de la mairie de Fumel.
- Agglomération d’Agen : cyberattaque visant l’agglomération à l’été 2023.
- Journal de Tonneins : aucun incident propre identifié ; exemples régionaux cités à titre de contexte, sans invention d'événement local.

## Candidats écartés

- `www.medef47.fr`, `www.cma47.fr`, `www.artisanat47.fr` : NXDOMAIN ou échec TLS — aucun HTTP 200.
- `www.sudouest.fr/lot-et-garonne/...` : redirections 302 sans destination stable — non retenu.
- `cci47.fr/rss/?follow=actualites` : page HTML d'agrégation, pas un document XML — non comptée comme flux.
- MEDEF Nouvelle-Aquitaine et CPME Nouvelle-Aquitaine : portées régionales sans page départementale 47 vérifiée.
OBJECTIF : atteint — 9 / 5
