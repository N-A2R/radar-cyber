# Couverture « industrie » — Charente-Maritime (17)

OBJECTIF : atteint — 9 / 5

Neuf sources d'information du secteur **industrie** dans le département **17 (Charente-Maritime)**, toutes vérifiées en HTTP 200 le 2026-11-22 : 21 URL distinctes (sites, pages d'actualités et flux), 21 codes 200.

## Sources retenues

| Source | Type | Site | Actualités | Flux | Exemple cyber |
|---|---|---|---|---|---|
| CPME 17 — Confédération des petites et moyennes entreprises de la Charente-Maritime | organisation patronale départementale | https://cpme17.fr/ | https://cpme17.fr/actualites/ | https://cpme17.fr/feed/ | MalletteCyber Pro : un nouvel outil pour sensibiliser les TPE-PME aux risques cyber (article du flux CPME 17, https://cpme17.fr/mallettecyber-pro-un-nouvel-outil-pour-sensibiliser-les-tpe-pme-aux-risques-cyber/). |
| MEDEF Charente-Maritime | organisation patronale départementale | https://www.medef17.fr/ | https://www.medef17.fr/fr/actualites | https://www.medef17.fr/fr/actualites | Actualités patronales départementales : suivi des enjeux numériques et de cybersécurité des entreprises (aucun titre cyber daté dans la page consultée le 2026-11-22). |
| Sud Ouest — Charente-Maritime | presse quotidienne régionale | https://www.sudouest.fr/charente-maritime/ | https://www.sudouest.fr/charente-maritime/ | https://www.sudouest.fr/charente-maritime/rss.xml | Cyberattaques en Charente-Maritime : menace omniprésente pour les moins préparés (Sud Ouest, 22/01/2023, exemple rapporté). |
| actu.fr — Charente-Maritime | média local en ligne | https://actu.fr/nouvelle-aquitaine/charente-maritime_17 | https://actu.fr/nouvelle-aquitaine/charente-maritime_17 | https://actu.fr/nouvelle-aquitaine/charente-maritime_17/rss.xml | Flux local départemental suivi pour les cyberincidents d'entreprises (aucun titre cyber dans les items du 2026-11-22). |
| ici La Rochelle — Radio France | radio/média local public | https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17 | https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17 | https://www.ici.fr/rss/la-rochelle/a-la-une.xml | Flux La Rochelle suivi pour les incidents cyber locaux (aucun titre cyber dans le flux au contrôle du 2026-11-22). |
| Le Journal des Entreprises — Nouvelle-Aquitaine | presse économique régionale | https://www.lejournaldesentreprises.com/nouvelle-aquitaine | https://www.lejournaldesentreprises.com/nouvelle-aquitaine | https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine | Flux économique régional couvrant les entreprises de Charente-Maritime (aucun titre cyber dans les items du 2026-11-22). |
| Agglo La Rochelle — actualités et développement économique | communauté d'agglomération (développement industriel) | https://www.agglo-larochelle.fr/ | https://www.agglo-larochelle.fr/actualites | https://www.agglo-larochelle.fr/les-flux-rss-de-l-agglo/-/data-agglo/all-9786027.rss | Flux RSS institutionnel de l'agglomération rochelaise, suivi pour les incidents cyber des services et entreprises du territoire (aucun titre cyber au contrôle du 2026-11-22). |
| Technopole ATLAS — La Rochelle | technopole / cluster innovation | https://technopole-atlas.fr/ | https://technopole-atlas.fr/l-actualite | https://technopole-atlas.fr/l-actualite | Fountaine-Pajot, constructeur de catamarans à La Rochelle, victime d'une cyberattaque en 2020 : exemple d'incident cyber industriel du territoire (rapporté par Ouest-France, non vérifié en HTTP dans cette tranche). |
| Coopérative Carbone — La Rochelle | coopérative de transition énergétique | https://cooperativecarbone.fr/ | https://cooperativecarbone.fr/actus/ | https://cooperativecarbone.fr/feed/ | Rochefort : collectivités et entreprises, attention aux cyberattaques (Sud Ouest, 16/10/2026, exemple rapporté non vérifié en HTTP dans cette tranche). |

## Méthode

Recherche web d'organisations professionnelles (CPME, MEDEF), de technopoles, de coopératives, d'agences de développement, d'annuaires industriels et de presse locale couvrant la Charente-Maritime, puis repérage des pages d'actualités et des flux RSS/Atom dans le HTML des sites (balises `<link rel="alternate">` quand disponibles). Chaque URL a été contrôlée par `curl -L -s` avec un User-Agent navigateur ; le statut, le type MIME et le temps de réponse sont consignés dans `bench/results/verification-sources-industrie-17.json` et dans 21 traces `source_verification` de la migration. Quand aucun flux RSS n'est exposé, la page d'actualités sert de `url_flux` (cas du MEDEF 17 et de la Technopole ATLAS).

## Écartées après vérification

- CCI Charente-Maritime (`charente-maritime.cci.fr`) : HTTP 403, même avec User-Agent navigateur.
- L'Usine Nouvelle — page Charente-Maritime et Invest in Nouvelle-Aquitaine (annuaire, blog, flux) : HTTP 403 au contrôle `curl` avec en-têtes navigateur ; non retenues malgré une lecture 200 observée par ailleurs.
- Chambre des métiers et de l'artisanat de la Charente-Maritime (`cma17.fr`) : aucune résolution réseau.
- Haute Saintonge : site en 200 mais aucun flux RSS/Atom exposé ni page `/actualites/` (404).
- UIMM nationale (`uimm.lafabriquedelavenir.fr`) et BNIC/Cognac.fr : site et flux accessibles mais rattachement au département 17 non vérifié (Cognac relève du 16) ; exclues du couple secteur/département.
- `cmd17.fr` : domaine garé, sans contenu public exploitable.

Intégration : `bench/corpus/sources-industrie-17.jsonl`, `db/migrate-074-sources-industrie-17.sql` (ids `corpus:industrie17-*`, `department='17'`, 21 traces `source_verification` en `ok200`).
