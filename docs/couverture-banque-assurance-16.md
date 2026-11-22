# Sources banque / assurance / mutuelles — Charente (16)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `banque-assurance` / département `16`.

## Résultat

- **13 sources intégrées** (`bench/corpus/sources-banque-assurance-16.jsonl`, une ligne JSON par source).
- **29 URL uniques contrôlées** : site, page d'actualités et/ou flux — **29 réponses HTTP 200** (aucune redirection piégeuse, aucun 403/404 retenu).
- **13 lignes `source`** et **13 lignes `source_verification`** (`code_http = 200`, `etat = 'ok200'`) créées en base par `db/migrate-064-sources-banque-assurance-16.sql`. Toutes portent `department = '16'` et `region = 'Nouvelle-Aquitaine'`.
- Ventilation : 8 sources `cti` (organismes du secteur, fédérations, chambres consulaires) et 5 sources `presse` (presse locale et médias).

## Organismes et médias retenus

| Source | Type | URL d'actualités / flux |
| --- | --- | --- |
| Mutualité Française Charente | union départementale de mutuelles | https://www.mutualite16.fr/les-actualites/ · https://www.mutualite16.fr/feed/ |
| MSA des Charentes | caisse de mutualité sociale agricole | https://charentes.msa.fr/lfp/actualites-et-evenements |
| Crédit Agricole Charente Périgord | banque coopérative | https://www.credit-agricole.fr/ca-charente-perigord/particulier/conseils/magazine/tout-un-mag.html |
| CPAM de la Charente | assurance maladie | https://www.ameli.fr/charente/assure/actualites |
| Fédération Bancaire Française | fédération bancaire | https://fbf.fr/fr/rubrique-newsroom/actualites/ |
| France Assureurs | fédération des assureurs | https://www.franceassureurs.fr/actualites/ · https://www.franceassureurs.fr/feed/ |
| CMA Nouvelle-Aquitaine (antenne 16) | chambre consulaire | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites |
| Mutualité Française Nouvelle-Aquitaine | union régionale de mutuelles | https://nouvelle-aquitaine.mutualite.fr/actualites/feed/ |
| Charente Libre — économie | presse locale | https://www.charentelibre.fr/economie/ · https://www.charentelibre.fr/economie/rss.xml |
| Sud Ouest — Charente | presse locale | https://www.sudouest.fr/charente/rss.xml |
| Charente Numérique | presse locale numérique | https://www.charente-numerique.fr/feed/ |
| actu.fr — Angoulême | presse locale numérique | https://actu.fr/nouvelle-aquitaine/angouleme_16015/ |
| France 3 — Charente | média public local | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/rss |

## Exemples cyber associés

- Piratage de 13 600 € sur les comptes d'un couple de Saint-Angeau (Charente Libre, 01/08/2024) : URL vérifiée dans le champ `exemple_cyber` du corpus.
- La lutte contre la fraude (MSA des Charentes) : https://charentes.msa.fr/lfp/actions-partenaires/bilan-lutte-fraude
- Bons réflexes face à la fraude (Crédit Agricole Charente Périgord) : https://www.credit-agricole.fr/ca-charente-perigord/particulier/conseils/ma-protection-et-celle-de-mes-proches/bons-reflexes-face-a-la-fraude.html
- Fraude aux moyens de paiement (FBF, 27/01/2026) : https://fbf.fr/fr/communique_de_presse/fraude-aux-moyens-de-paiements-un-appel-aux-acteurs-du-numerique-a-se-mobiliser/

## Candidats écartés

- **CCI Charente** (`www.charente.cci.fr`) : HTTP 403 (Cloudflare) sur la home et les actualités, y compris avec plusieurs user-agents ; non retenu faute de 200 observable.
- **Caisse d'Épargne**, **MACIF**, **Banque Populaire Grand Ouest**, **ICI Charente** : 403/503, DNS ou erreur lors du contrôle ; non retenus.

## Méthode

Recherche web (annuaires consulaires, fédérations, presse locale, sites d'établissements) suivie d'un contrôle `curl -L -s -o /dev/null -w '%{http_code}'` sur chaque URL du corpus. Le champ `code_http` du JSONL vaut 200 pour chaque source ; les URL sont détaillées dans le corpus et la table `source_verification`.
