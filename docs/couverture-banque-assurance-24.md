# Couverture « banque-assurance » — Dordogne (24)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `banque-assurance` / département `24`.

OBJECTIF : atteint — 13 / 5

## Résultat

- **13 sources intégrées** (`bench/corpus/sources-banque-assurance-24.jsonl`, une ligne JSON par source).
- **43 URL uniques contrôlées** : sites, pages d'actualités, flux RSS et articles cyber — **43 réponses HTTP 200**, aucune erreur ni mur antibot retenu.
- **13 lignes `source`** créées en base par `db/migrate-066-sources-banque-assurance-24.sql`. Toutes portent `department = '24'` et `region = 'Nouvelle-Aquitaine'`. Le détail des contrôles est conservé dans `bench/results/verification-banque-assurance-24.json` et dans le champ `parser` de chaque ligne.
- Ventilation : 9 sources `cti` (chambres consulaires, caisses, mutuelles, fédérations, registre) et 4 sources `presse` (presse locale et média public).
- Empreinte du corpus après ajout : `7ec35c9705b0a9a1092e37653318d4964fa323540bfdf6c7b408cfedaae12c37`.

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CCI Dordogne | chambre de commerce et d'industrie | https://dordogne.cci.fr/actualites/ | https://dordogne.cci.fr/feed/ |
| CMA Nouvelle-Aquitaine — délégation de la Dordogne | chambre des métiers et de l'artisanat | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| CPAM de la Dordogne | assurance maladie | https://www.ameli.fr/dordogne/assure/actualites | — |
| Carsat Aquitaine (Dordogne) | assurance retraite et prévoyance | https://www.carsat-aquitaine.fr/home/actif/actualites-actif.html | — |
| MSA Dordogne Lot-et-Garonne | mutualité sociale agricole | https://www.msa.fr/lfp/actualites-particulier | — |
| Mutualité Française Nouvelle-Aquitaine | union régionale de mutuelles | https://nouvelle-aquitaine.mutualite.fr/actualites/ | https://nouvelle-aquitaine.mutualite.fr/feed/ |
| France Assureurs | fédération des assureurs | https://www.franceassureurs.fr/actualites/ | https://www.franceassureurs.fr/feed/ |
| Fédération Bancaire Française | fédération professionnelle bancaire | https://fbf.fr/fr/rubrique-newsroom/actualites/ | — |
| ORIAS | registre banque/assurance/finance | https://www.orias.fr/home/communications | — |
| Sud Ouest — Dordogne | presse locale quotidienne | https://www.sudouest.fr/dordogne/ | https://www.sudouest.fr/dordogne/rss.xml |
| Dordogne Libre | presse locale hebdomadaire | https://www.dordognelibre.fr/ | https://www.dordognelibre.fr/rss.xml |
| Réussir le Périgord | presse locale hebdomadaire | https://www.reussirleperigord.fr/ | https://www.reussirleperigord.fr/feed |
| ici Périgord — Radio France | média public local | https://www.ici.fr/nouvelle-aquitaine/dordogne-24 | https://www.ici.fr/rss/perigord/rubrique/infos.xml |

## Exemples cyber vérifiés

- CCI Dordogne : « Fraude informatique : pensez à vous prémunir » (200).
- CMA Nouvelle-Aquitaine : « Les artisans, des cibles de choix pour les cybercriminels » (200).
- CPAM de la Dordogne : lutte contre les fraudes à l'Assurance Maladie (200).
- Carsat Aquitaine / Assurance retraite : « SMS et courriels frauduleux : soyez vigilant » (200).
- MSA Dordogne Lot-et-Garonne : « Fraude sur internet ou par téléphone, soyez vigilant ! » (200).
- Mutualité Française : « Cyberattaques : un impact sur la prise en charge des patients » (200).
- France Assureurs : cyberattaques, ressource pour la résilience des TPE-PME (200).
- FBF : « Que font les banques françaises pour lutter contre la fraude aux moyens de paiement ? » (200).
- Sud Ouest : QR codes d'horodateurs piratés en Dordogne (200).
- Dordogne Libre : piratage de Ribérac Liberté FM (200).
- Réussir le Périgord : « Les enjeux de la cybersécurité » (200).
- ici Périgord : escrocs se faisant passer par mail pour une mairie de Dordogne (200).

## Candidats écartés

- `https://actu.fr/nouvelle-aquitaine/dordogne_24/` et son flux — HTTP 200 mais page « Attention Required! » (défi Cloudflare) : pas de contenu vérifiable.
- `https://www.banquepopulaire.fr/sud-ouest/actualites` — HTTP 200 mais mur « Radware Page ».
- `https://www.cci-dordogne.fr/`, `https://www.cma-dordogne.fr/`, `https://dordogne.msa.fr/lfp/`, `https://www.msa-sudouest.fr/`, `https://www.urssaf.fr/accueil.html` — 000 (DOMAINES ou hôtes injoignables) ; CCI retenue sur `dordogne.cci.fr`, CMA sur `cma-nouvelleaquitaine.fr`, MSA sur `msa.fr/lfp`.
- `https://www.credit-agricole.fr/ca-perigord/particulier.html` — 404 ; `https://www.carsat-aquitaine.fr/actualites` et `/rss.xml` — 200 mais page « Erreur page non trouvée » (soft 404), page d'actualités réelle retenue dans le fil d'actif.
- `https://www.ameli.fr/dordogne/actualites` — 404 ; page `/dordogne/assure/actualites` retenue.

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, fédérations, sites d'organismes et presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur et suivi des redirections (25 s maximum), avec lecture du titre pour écarter les pages d'erreur et les murs antibot. Seules les sources dont toutes les URL ont répondu 200 avec un contenu réel ont été intégrées au corpus et à la base.
