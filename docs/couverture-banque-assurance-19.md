# Couverture « banque-assurance » — Corrèze (19)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `banque-assurance` / département `19`.

## Résultat

- **14 sources intégrées** (`bench/corpus/sources-banque-assurance-19.jsonl`, une ligne JSON par source).
- **41 URL uniques contrôlées** : sites, pages d'actualités, flux et articles cyber — **41 réponses HTTP 200** (aucun 403/404 retenu).
- **14 lignes `source`** et **14 lignes `source_verification`** (`code_http = 200`, `etat = 'ok200'`) créées en base par `db/migrate-076-sources-banque-assurance-19.sql`. Toutes portent `department = '19'` et `region = 'Nouvelle-Aquitaine'`.
- Ventilation : 11 sources `cti` (caisses d'assurance, mutuelles, fédérations, registre, agences locales d'assureurs, chambre consulaire) et 3 sources `presse` (presse locale et radios).
- Preuve HTTP détaillée : `bench/results/verification-banque-assurance-19.json`.

OBJECTIF : atteint — 14 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CPAM de la Corrèze | caisse primaire d'assurance maladie | https://www.ameli.fr/correze/assure/actualites | — |
| MSA Limousin (couvre la Corrèze) | caisse de mutualité sociale agricole | https://limousin.msa.fr/lfp/actualites-et-evenements | — |
| Assurance Retraite — CARSAT Limousin | caisse d'assurance retraite | https://www.lassuranceretraite.fr/ | — |
| Mutualité Française Nouvelle-Aquitaine | union régionale de mutuelles | https://nouvelle-aquitaine.mutualite.fr/actualites/ | https://nouvelle-aquitaine.mutualite.fr/actualites/feed/ |
| Fédération Bancaire Française | fédération bancaire | https://fbf.fr/fr/rubrique-newsroom/actualites/ | — |
| France Assureurs | fédération des assureurs | https://www.franceassureurs.fr/actualites/ | https://www.franceassureurs.fr/feed/ |
| ORIAS | registre des intermédiaires en assurance, banque et finance | — (site seul) | — |
| Groupama — agence de Brive-la-Gaillarde | agence locale d'assurance | https://www.groupama.fr/assurance/conseils/ | — |
| Groupama — agence de Tulle | agence locale d'assurance | https://www.groupama.fr/assurance/conseils/ | — |
| Allianz — agence de Brive-la-Gaillarde | agence locale d'assurance | https://agence.allianz.fr/brive-19100-H91919 | — |
| La Montagne — Corrèze | presse locale | https://www.lamontagne.fr/info-en-continu/correze | — |
| actu.fr — Corrèze | presse locale numérique | https://actu.fr/nouvelle-aquitaine/correze_19 | https://actu.fr/nouvelle-aquitaine/correze_19/rss.xml |
| ici Corrèze — Radio France | média public local | https://www.ici.fr/radio/limousin/actu | https://www.ici.fr/rss/limousin/rubrique/infos.xml |
| CMA Nouvelle-Aquitaine — antenne Corrèze | chambre consulaire | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?county=correze | — |

## Exemples cyber associés

Le champ `exemple_cyber` du corpus s'appuie sur des articles réels vérifiés en HTTP 200 : fraude à la Sécurité sociale en Corrèze (La Montagne, 15/05/2026), lutte contre la fraude (MSA Limousin), SMS et courriels frauduleux (Assurance Retraite, 04/11/2026), fraude aux moyens de paiement (FBF, 27/01/2026), baromètre cybersécurité (FBF), campagne Cyberprev (France Assureurs), escroquerie à la carte bancaire en Corrèze (La Montagne, 28/11/2025), cyberattaque et froid connecté (Groupama), prévention des risques cyber en entreprise (Groupama), arnaques repérées par Que Choisir en Corrèze (La Montagne, 21/05/2026), bande d'escrocs démantelée en Corrèze (La Montagne, 01/09/2026), remboursement des victimes d'arnaque bancaire (actu.fr, 16/06/2025), escroqueries en bande organisée jugées à Tulle (ici, 30/09/2026), cybercriminalité en Corrèze (La Montagne, 18/11/2021).

## Candidats écartés

- `https://www.allianz.fr/` et ses articles cyber (`/assurance-particulier/securite/cyberharcelement.html`) : HTTP 403 — seule la page de l'agence locale de Brive est retenue.
- `https://www.labanquepostale.fr/particulier/accompagner/actualites-et-conseils.html` : HTTP 403.
- `https://www.credit-agricole.fr/ca-correze/` (et variante accentuée) : HTTP 404.
- `https://www.cci-correze.fr/` : échec DNS ; `https://www.correze.cci.fr/` : HTTP 403.
- `https://www.caisse-epargne.fr/limousin/`, `https://www.smac.fr/`, `https://www.msa-limousin.fr/` : échec DNS / connexion.
- `https://www.lamontagne.fr/correze/rss.xml`, `https://actu.fr/nouvelle-aquitaine/tulle_19272/rss.xml`, `https://www.ici.fr/nouvelle-aquitaine/correze-19/rss` : HTTP 404/403.

## Méthode

Recherche web (annuaires professionnels, sites d'agences locales, chambres consulaires, caisses d'assurance, fédérations, presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur et suivi des redirections (25 s maximum). Seules les sources dont toutes les URLs ont répondu 200 ont été intégrées au corpus et à la base. Les exemples cyber ont été retrouvés via les flux et les actualités des sites, puis confirmés en HTTP 200.
