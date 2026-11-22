# Couverture « banque-assurance » — Charente-Maritime (17)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `banque-assurance` / département `17`.

## Résultat

- **11 sources intégrées** (`bench/corpus/sources-banque-assurance-17.jsonl`, une ligne JSON par source).
- **22 URL uniques contrôlées** : site, page d'actualités et/ou flux — **22 réponses HTTP 200** (aucun 403/404 retenu).
- **11 lignes `source`** et **11 lignes `source_verification`** (`code_http = 200`, `etat = 'ok200'`) créées en base par `db/migrate-068-sources-banque-assurance-17.sql`. Toutes portent `department = '17'` et `region = 'Nouvelle-Aquitaine'`.
- Ventilation : 8 sources `cti` (organismes du secteur, fédérations, chambres consulaires, registres, banque coopérative locale) et 3 sources `presse` (presse locale et médias).
- Preuve HTTP détaillée : `bench/results/verification-banque-assurance-17.json`.

OBJECTIF : atteint — 11 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CPAM de la Charente-Maritime | caisse primaire d'assurance maladie | https://www.ameli.fr/charente-maritime/assure/actualites | — |
| MSA des Charentes | caisse de mutualité sociale agricole | https://charentes.msa.fr/lfp/actualites-et-evenements | — |
| Mutualité Française Nouvelle-Aquitaine | union régionale de mutuelles | https://nouvelle-aquitaine.mutualite.fr/actualites/ | https://nouvelle-aquitaine.mutualite.fr/actualites/feed/ |
| Fédération Bancaire Française | fédération bancaire | https://fbf.fr/fr/rubrique-newsroom/actualites/ | — |
| CMA Nouvelle-Aquitaine — antenne 17 | chambre consulaire | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| France Assureurs | fédération des assureurs | https://www.franceassureurs.fr/actualites/ | https://www.franceassureurs.fr/feed/ |
| ORIAS | registre des intermédiaires en assurance, banque et finance | — (site seul) | — |
| Sud Ouest — Charente-Maritime | presse locale | https://www.sudouest.fr/charente-maritime/archives/ | https://www.sudouest.fr/charente-maritime/rss.xml |
| actu.fr — La Rochelle | presse locale numérique | https://actu.fr/nouvelle-aquitaine/la-rochelle_17300/ | — |
| ici Charente-Maritime — Radio France | média public local | https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17 | — |
| Crédit Agricole Charente-Maritime Deux-Sèvres | banque coopérative locale | https://www.credit-agricole.fr/ca-cmds/ | — |

## Exemples cyber associés

Le champ `exemple_cyber` du corpus s'appuie sur des articles réels vérifiés en HTTP 200 : fraude sur internet ou par téléphone (MSA), lutte contre la fraude (MSA des Charentes), fraude aux moyens de paiement (FBF, 27/01/2026), bons réflexes face à la fraude (Crédit Agricole), fuite de données Synbird touchant La Rochelle, alerte à l'arnaque sur les factures d'eau à Jonzac, usurpation du numéro du commissariat de Royan, cyberattaque d'un E.Leclerc de Surgères, attaque de la billetterie de la Coursive à La Rochelle, piratage de comptes bancaires (Charente Libre), appels frauduleux à Aytré, arnaque à la facture d'eau en Charente-Maritime (BFMTV).

## Candidats écartés

- `https://www.credit-agricole.fr/ca-charente-maritime-deux-sevres/particulier.html` (et variante `/particulier`) : HTTP 404 — le nom d'agence attendu n'est pas un chemin public valide.
- `https://www.mutualite17.fr/`, `https://www.me17.fr/`, `https://www.larochelleci.fr/`, `https://www.caisse-epargne.fr/poitou-charentes/` : échec DNS / connexion.
- `https://www.orias.fr/actualites/` : HTTP 200 mais renvoie vers `/login/auth` ; page non publique, non retenue comme actualités.
- `https://fbf.fr/fr/rss.xml`, `https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/rss`, `https://actu.fr/nouvelle-aquitaine/la-rochelle_17300/rss.xml` : HTTP 404.
- `https://recours-france.fr/annuaire/banque/17-charente-maritime` : HTTP 404.
- Annuaires Kompass et PagesJaunes « banques 17 » : HTTP 403.
- `https://www.allianz.fr/`, `https://www.macif.fr/` : HTTP 403.

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, fédérations, sites d'établissements et presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur et suivi des redirections (25 s maximum). Seules les sources dont toutes les URLs ont répondu 200 ont été intégrées au corpus et à la base.
