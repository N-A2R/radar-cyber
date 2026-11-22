# Couverture — sources « numerique » de la Gironde (33)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **9 sources en HTTP 200**, 24 URL distinctes contrôlées toutes en 200 (sites, pages d’actualités, flux et articles d’exemple), le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| French Tech Bordeaux | réseau French Tech (fédération des acteurs numériques de Gironde) | https://www.frenchtechbordeaux.com/ | https://www.frenchtechbordeaux.com/nos-actualites | — |
| Bordeaux Métropole — actualités et pôle numérique | collectivité territoriale — pôle numérique | https://www.bordeaux-metropole.fr/ | https://www.bordeaux-metropole.fr/actualites-Bordeaux-Metropole | https://www.bordeaux-metropole.fr/rss.xml |
| Bordeaux Technowest | technopole et incubateur de startups (Mérignac) | https://technowest.com/ | https://technowest.com/actualites/ | https://technowest.com/feed/ |
| Unitec — incubateur Bordeaux | incubateur de startups numériques (Cité numérique, Bègles) | https://unitec.fr/ | https://unitec.fr/actualites/ | https://unitec.fr/feed/ |
| SYRPIN — syndicat des professionnels du numérique | syndicat professionnel / cluster numérique (Bordeaux) | https://www.syrpin.org/ | https://www.syrpin.org/category/evenements/ | https://www.syrpin.org/feed/ |
| Pôle ENTER | pôle de compétitivité numérique (Bègles) | https://pole-enter.org/ | https://pole-enter.org/agenda/ | — |
| Rue89 Bordeaux | presse locale numérique (Bordeaux / Gironde) | https://rue89bordeaux.com/ | https://rue89bordeaux.com/ | https://rue89bordeaux.com/feed/ |
| 20 Minutes Bordeaux | presse quotidienne locale (édition Bordeaux) | https://www.20minutes.fr/bordeaux/ | https://www.20minutes.fr/bordeaux/ | — |
| Sharing-data — annuaire tech Bordeaux | annuaire professionnel des entreprises du numérique | https://sharing-data.fr/annuaire/bordeaux/ | https://sharing-data.fr/blog/ | — |

Toutes ces organisations sont ancrées en Gironde (33) ou couvrent le département : French Tech Bordeaux, SYRPIN, Unitec, Bordeaux Technowest et Pôle ENTER constituent le réseau numérique bordelais (Bordeaux, Mérignac, Bègles) ; Bordeaux Métropole porte les politiques numériques territoriales ; Sharing-data répertorie les établissements numériques de Bordeaux ; Rue89 Bordeaux et 20 Minutes Bordeaux couvrent l’actualité locale.

## Exemples cyber associés

Le champ `exemple_cyber` s’appuie sur des articles vérifiés en HTTP 200 : « Cyberattaque des supermarchés : quatre Intermarché girondins parmi les magasins touchés » (13/10/2026), « Cyberattaque de l’Éducation nationale : une rentrée légèrement perturbée dans l’académie de Bordeaux » (02/09/2026) et « Bordeaux Métropole : piratage des données des hébergements déclarés » (27/04/2026).

## Méthode et intégration

Découverte par recherche web, annuaires professionnels, sites d’organisations et presse locale, puis identification des pages d’actualités et des flux. Chaque URL a été contrôlée par un GET `curl -L` avec User-Agent navigateur et suivi des redirections ; les 24 URL distinctes sont en HTTP 200. CCI Bordeaux Gironde (403 Cloudflare) et plusieurs flux de presse (403/404) ont été écartés faute de vérification 200.

Preuve HTTP : `bench/results/verification-numerique-33.json` (24 codes HTTP).
Base : `db/migrate-096-sources-numerique-33.sql` insère 9 lignes dans `source` (parser pointant vers le corpus) et 9 traces `source_verification` en état `ok200`.
