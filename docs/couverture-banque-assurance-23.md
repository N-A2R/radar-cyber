# Couverture « banque-assurance » — Creuse (23)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `banque-assurance` / département `23`.

## Résultat

- **13 sources intégrées** (`bench/corpus/sources-banque-assurance-23.jsonl`, une ligne JSON par source).
- **34 URL uniques contrôlées** : sites, pages d'actualités, flux RSS et articles cyber — **34 réponses HTTP 200**, aucune 403/404 retenue.
- **13 lignes `source`** et **13 lignes `source_verification`** (`code_http = 200`, `etat = 'ok200'`) créées en base par `db/migrate-076-sources-banque-assurance-23.sql`. Toutes portent `department = '23'` et `region = 'Nouvelle-Aquitaine'`.
- Ventilation : 9 sources `cti` (CCI, CMA, organismes de protection sociale, caisses, fédérations, registre) et 4 sources `presse` (presse locale et média public).
- Preuve HTTP détaillée : `bench/results/verification-banque-assurance-23.json`.

OBJECTIF : atteint — 13 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CCI de la Creuse | chambre de commerce et d'industrie | https://www.cci-creuse.com/category/entreprise/ | https://www.cci-creuse.com/feed/ |
| CMA Nouvelle-Aquitaine — délégation de la Creuse | chambre des métiers et de l'artisanat | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| Caisse commune de Sécurité sociale de la Creuse (ex-CPAM) | organisme de protection sociale | https://www.assurance-maladie.ameli.fr/actualites-et-publications/actualites/nouvelle-aquitaine | — |
| MSA Limousin (Creuse) | caisse de mutualité sociale agricole | https://limousin.msa.fr/lfp/actualites | — |
| Carsat Centre Ouest (Creuse) | caisse d'assurance retraite | https://www.carsat-centreouest.fr/home/actif/actualites-actif.html | — |
| France Assureurs | fédération des assureurs | https://www.franceassureurs.fr/actualites/ | https://www.franceassureurs.fr/feed/ |
| Mutualité Française Nouvelle-Aquitaine | union régionale de mutuelles | https://nouvelle-aquitaine.mutualite.fr/actualites/ | https://nouvelle-aquitaine.mutualite.fr/actualites/feed/ |
| Fédération Bancaire Française | fédération professionnelle bancaire | https://fbf.fr/fr/rubrique-newsroom/actualites/ | — |
| ORIAS | registre des intermédiaires banque/assurance/finance | https://www.orias.fr/home/communications | — |
| actu.fr — Actu Creuse | presse locale numérique | https://actu.fr/nouvelle-aquitaine/creuse_23/ | — |
| La Montagne — Creuse | presse locale quotidienne | https://www.lamontagne.fr/creuse/ | — |
| ici Creuse — Radio France | média public local | https://www.ici.fr/radio/creuse | — |
| Le Populaire du Centre — Guéret | presse locale quotidienne | https://www.lepopulaire.fr/gueret-23000/ | — |

## Exemples cyber vérifiés

- CCI de la Creuse : « Comment assurer la sécurité numérique en entreprise ? » (200).
- CMA Nouvelle-Aquitaine : « Les artisans, des cibles de choix pour les cybercriminels » (200).
- Caisse commune de Sécurité sociale de la Creuse : lutte contre les fraudes à l'Assurance Maladie (200).
- MSA Limousin : « Fraude sur internet ou par téléphone, soyez vigilant ! » (200).
- Carsat Centre Ouest : « Courriels, sites internet, médias et appels frauduleux : soyez vigilant ! » (200).
- France Assureurs : 8ᵉ cartographie prospective des risques, cyberattaques en tête (200).
- Mutualité Française : « Cyberattaques : un impact sur la prise en charge des patients » (200).
- FBF : « Fraude aux moyens de paiement : un appel aux acteurs du numérique à se mobiliser » (27/01/2026, 200).

## Candidats écartés

- `https://www.creuse.cci.fr/` — 403 (la CCI de la Creuse publie sur `cci-creuse.com`).
- `https://www.orias.fr/actualites/` — 200 mais redirection vers `/login/auth` (page publique `/home/communications` retenue).
- `https://acpr.banque-france.fr/fr` et pages d'actualités — 403.
- `https://www.urssaf.fr/` et `https://aquitaine.urssaf.fr/` — injoignables (000).
- `https://www.banquepopulaire.fr/centre/` — 503 ; `https://www.caisse-epargne.fr/centre-val-de-loire/` — 000.
- `https://www.credit-agricole.fr/ca-limousin/particulier.html` — 404.
- `https://www.creuse.fr/actualites` — 404.
- Flux indisponibles : `https://limousin.msa.fr/lfp/rss`, `https://www.franceassureurs.fr/actualites/cybersecurite/`, `https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml` — 404.

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, fédérations, sites d'organismes et presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur et suivi des redirections (25 s maximum). Seules les sources dont toutes les URLs ont répondu 200 ont été intégrées au corpus et à la base.
