# Sources du secteur « commerce » — Lot-et-Garonne (47)

## Résultat

OBJECTIF : atteint — 17 / 5

**17 sources vérifiées en HTTP 200** pour le couple secteur `commerce` / département `47` (cible : au moins 5 sources vérifiées en 200).

- Corpus : `bench/corpus/sources-commerce-47.jsonl` (17 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-commerce-47.json` — 47 URL contrôlées le 2026-11-22, 47 en 200 (sites, pages d'actualités, flux et articles cyber).
- Intégration : `db/migrate-131-sources-commerce-47.sql` — 17 sources (`corpus:commerce47-*`) et 52 traces dans `source_verification` (47 URL distinctes) en `ok200` / HTTP 200.
- Empreinte corpus `bench/corpus/HASH` : `ce259f05890253c00b7f894b79e0cd60848417286f78abc5f24d13b4aaa255dc`.

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CCI Lot-et-Garonne | chambre consulaire (commerce et industrie) | https://cci47.fr/actualites/ | Google Actualités « CCI Lot-et-Garonne » |
| CPME 47 | organisation patronale (PME et commerces) | https://www.cpme47.fr/actualites/ | Google Actualités « CPME 47 Lot-et-Garonne » |
| CMA Nouvelle-Aquitaine — antenne 47 | chambre consulaire (métiers, artisanat et commerces) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | Google Actualités « CMA Lot-et-Garonne artisanat » |
| La Dépêche du Midi — Lot-et-Garonne | presse locale quotidienne | https://www.ladepeche.fr/communes/lot-et-garonne,47/ | https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml |
| Le Petit Bleu d'Agen — économie | presse locale quotidienne | https://www.petitbleu.fr/economie/ | https://www.petitbleu.fr/economie/rss.xml |
| actu.fr — Lot-et-Garonne (économie) | presse en ligne locale | https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/economie | https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/rss.xml |
| La Vie Économique — Lot-et-Garonne | presse économique régionale | https://www.vie-economique.com/categories/lot-et-garonne/ | https://www.vie-economique.com/categories/lot-et-garonne/feed/ |
| Le Journal des Entreprises — Lot-et-Garonne | presse économique régionale | https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/lot-et-garonne | https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine |
| ICI Lot-et-Garonne (Radio France) | radio locale | https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu | https://www.ici.fr/rss/gascogne/rubrique/infos.xml |
| Mon-Entreprise-Info — Lot-et-Garonne | annuaire et actualités des entreprises | https://mon-entreprise-info.com/actualites/lot-et-garonne/ | https://mon-entreprise-info.com/actualites/lot-et-garonne/rss.xml |
| Societe.Tech — Lot-et-Garonne | presse entreprises et technologies | https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-lot-et-garonne/ | Google Actualités « Societe.Tech Lot-et-Garonne » |
| La Semaine des Pyrénées — Lot-et-Garonne | hebdomadaire local | https://www.lasemainedespyrenees.fr/category/lot-et-garonne/ | https://www.lasemainedespyrenees.fr/category/lot-et-garonne/feed/ |
| Journal de Tonneins | presse locale | https://www.journaldetonneins.fr/toutes-les-actualites | — (flux local 404) |
| MEDEF Lot-et-Garonne (GPI-Medef 47) | syndicat patronal | https://www.gpi-medef47.fr/actualites | — |
| Les Vitrines de Villeneuve et de la Vallée du Lot (l3vl) | réseau de commerçants et annuaire géolocalisé | https://www.l3vl.com/actualites | — |
| Quidam Hebdo — Lot-et-Garonne | hebdomadaire en ligne | https://quidam-hebdo.com/category/lot-et-garonne/ | https://quidam-hebdo.com/category/lot-et-garonne/feed/ |
| 47 FM | radio locale | https://www.47fm.net/actualites | — |

Treize flux déclarés sur les 17 sources (9 natifs et 4 via Google Actualités), dont 12 exploitables : le flux `actu.fr` répond 200 mais ne contient aucun item.

## Exemples cyber associés

- Incident de sécurité FICOBA (CCI 47) — https://cci47.fr/5/ ; page « Cybersécurité » de la CCI : https://cci47.fr/cybersecurite/
- Lancement d'ImpactCyber pour inciter les TPE-PME à se sécuriser (CPME 47) — https://www.cpme47.fr/actualites/lancement-d-impactcyber-pour-inciter-les-tpe-pme-a-se-securiser-160.html
- « Les pirates ont demandé une rançon » : l'association lot-et-garonnaise La Sauvegarde victime d'une cyberattaque (La Dépêche) — https://www.ladepeche.fr/2024/11/07/les-pirates-ont-demande-une-rancon-lassociation-lot-et-garonnaise-la-sauvegarde-victime-dune-cyberattaque-12310164.php
- À Agen, l'association La Sauvegarde en pleine crise informatique et sociale (Petit Bleu) — https://www.petitbleu.fr/2026/07/01/il-faut-mettre-un-terme-a-cette-situation-de-souffrance-des-salaries-a-agen-lassociation-la-sauvegarde-en-pleine-crise-informatique-et-sociale-se-13446972.php
- Ledil Immobilier (Agen) : 6 700 données d'utilisateurs divulguées — https://darkwebinformer.com/ledil-immobilier-ledil-immo-database-breached-threat-actor-888-leaks-6-700-french-real-estate-user-records/
- Cyberattaque par cryptolocker chez SAS Expérience Beauté (Boé) — https://legalplanet.pro/lattaque-par-cryptolocker-par-un-prestataire-informatique-mecontent-cour-dappel-dagen-1-decembre-2025-n-de-rg-25-00266/

## Candidats écartés

- MEDEF Lot-et-Garonne : `medef47.fr`, `medef-lot-et-garonne.fr` et `lot-et-garonne.territoriaux.medef.com` → NXDOMAIN / HTTP 000 ; aucun 200 observable.
- Sud Ouest — Lot-et-Garonne et ses articles cyber (dont Intermarché Marmande) : boucles de redirections, code final 302 ; non retenus.
- CCI 47 — `/rss/?follow=actualites` : HTTP 200 mais `text/html`, pas un flux RSS ; Google Actualités retenu.
- CPME 47 — `/feed/` : HTTP 404 ; flux Google Actualités retenu.
- `actu.fr/lot-et-garonne/rss.xml` et `journaldetonneins.fr/feed/` : HTTP 404 ; URLs alternatives 200 retenues.
- Chambre d'agriculture, collectivités et santé du 47 : secteurs distincts, hors du couple demandé.

## Méthode

Recherche web par angles complémentaires (chambres consulaires et organisations patronales, annuaires professionnels, presse locale et économique, veille cyber), puis vérification de chaque URL par GET réel (`curl -L`, User-Agent navigateur, délai max 25 s, redirections suivies) : code HTTP final, type de contenu, URL effective et nombre d'items RSS enregistrés dans le JSON de preuve. Exa indisponible (crédits épuisés, HTTP 402) : découverte complétée par les annuaires, sites officiels et corpus locaux déjà vérifiés du dépôt.
