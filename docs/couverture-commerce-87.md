# Sources du secteur « commerce » — Haute-Vienne (87)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `commerce` / département `87`.

## Résultat

**11 sources vérifiées en HTTP 200** (cible : au moins 5).

- Corpus : `bench/corpus/sources-commerce-87.jsonl` — 11 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`.
- Preuve HTTP : `bench/results/verification-commerce-87.json` — 27 URL contrôlées, 27 en 200, le 2026-11-22.
- Intégration : `db/migrate-121-sources-commerce-87.sql` — 11 lignes dans `source` (identifiants `corpus:commerce-87-*`) et 27 traces dans `source_verification` (`code_http = 200`, `etat = 'ok200'`), avec `region = 'Nouvelle-Aquitaine'` et `department = '87'`.
- 5 flux RSS/Atom exploitables : Limoges Métropole (73 items), ICI Limousin (20), Sud Ouest Haute-Vienne (20), FEVAD (10), Cyberattaque.org (10).

OBJECTIF : atteint — 11 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CMA Nouvelle-Aquitaine — antenne Haute-Vienne | chambre consulaire (métiers et commerces) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| CPME 87 — Les Entrepreneurs de la Haute-Vienne | fédération professionnelle (PME, TPE, commerces) | https://www.cpme87.fr/actualites/ | — |
| Limoges Métropole | collectivité (actualités économie et commerces) | https://www.limoges-metropole.fr/informations-transversales/actualites | https://www.limoges-metropole.fr/informations-transversales/actualites/rss |
| Le Populaire du Centre — Haute-Vienne | presse locale quotidienne | https://www.lepopulaire.fr/economie/ | — |
| ICI Limousin (Radio France) | radio locale | https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87/actu | https://www.ici.fr/rss/limousin/rubrique/infos.xml |
| Sud Ouest — Haute-Vienne | presse régionale | https://www.sudouest.fr/haute-vienne/ | https://www.sudouest.fr/haute-vienne/rss.xml |
| France 3 Nouvelle-Aquitaine — Haute-Vienne | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/ | — |
| actu.fr — Limoges | presse locale | https://actu.fr/nouvelle-aquitaine/limoges_87085/ | — |
| FCD — Fédération du commerce et de la distribution | fédération professionnelle | https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/ | — |
| FEVAD — Fédération du e-commerce et de la vente à distance | fédération professionnelle (e-commerce) | https://www.fevad.com/actualite/ | https://www.fevad.com/feed/ |
| Cyberattaque.org — incidents cyber | presse spécialisée cyber | https://www.cyberattaque.org/ | https://www.cyberattaque.org/feed/ |

## Exemples cyber associés

- **Climb Up Limoges** — près de 151 000 profils en vente sur le darkweb après une cyberattaque, touchant un commerce de loisirs de la Haute-Vienne (Cyberattaque.org, 2026-10-14) : https://www.cyberattaque.org/climb-up-pres-de-151-000-profils-en-vente-sur-le-darkweb-apres-une-cyberattaque/
- **TPE/PME de Haute-Vienne** — « Lutter contre le fléau des cyberattaques » : 30 à 35 % des PME victimes paient la rançon (Limoges Infos 87) : https://www.limogesinfos87.fr/actualite-22011-lutter-contre-le-fleau-des-cyberattaques.html
- **Service d'identification des bovins et ovins** — cyberattaque perturbant les éleveurs limousins (France 3 Nouvelle-Aquitaine, 2024-12-31) : https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/le-service-d-identification-des-bovins-et-ovins-victime-d-une-cyberattaque-le-travail-des-eleveurs-limousins-perturbe-3084484.html

## Candidats écartés

- **CCI de Limoges et de la Haute-Vienne** (`limoges.cci.fr`, site et `/actualites`) : HTTP 403 persistant, malgré sa pertinence consulaire.
- **Ville de Limoges** (`limoges.fr/actualites`) : HTTP 403.
- **Conseil départemental de la Haute-Vienne** (`haute-vienne.fr/actualites`) : HTTP 404.
- **Cigusto Limoges** (communiqué cyber) : HTTP 403 sur la page du communiqué ; l'incident est documenté dans le corpus `incidents-hautevienne.jsonl` mais le lien n'a pas pu être vérifié.
- **`fevad.com/actualites/`** : 200 mais redirection vers l'accueil ; remplacé par `/actualite/`, page d'actualités explicite.

## Méthode

Recherche web (chambres consulaires, fédérations professionnelles, annuaires, collectivités et presse locale), identification des pages d'actualités et des flux, puis contrôle GET réel de chaque URL avec User-Agent navigateur, suivi des redirections et délai maximal de 18 s. Seules les sources dont toutes les URLs ont répondu 200 et dont le contenu est exploitable ont été intégrées au corpus et à la base.
