# Couverture « banque-assurance » — Deux-Sèvres (79)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `banque-assurance` / département `79`.

## Résultat

- **18 sources intégrées** (`bench/corpus/sources-banque-assurance-79.jsonl`, une ligne JSON par source).
- **54 contrôles HTTP** (sites, pages d'actualités et flux), soit **50 URL uniques** : **54 réponses HTTP 200**, aucune URL en échec retenue.
- 18 lignes `source` et 50 lignes `source_verification` créées en base par `db/migrate-066-sources-banque-assurance-79.sql`, toutes avec `department = '79'` et `region = 'Nouvelle-Aquitaine'`.
- Preuve HTTP détaillée : `bench/results/verification-banque-assurance-79.json`.

OBJECTIF : atteint — 18 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Crédit Agricole Charente-Maritime Deux-Sèvres | banque régionale | https://www.credit-agricole.fr/ca-cmds/particulier/conseils/magazine/tout-un-mag.html | Google Actualités « Crédit Agricole Deux-Sèvres » |
| MAIF — siège de Niort | assureur mutualiste | https://entreprise.maif.fr/actualites | Google Actualités « MAIF Niort Deux-Sèvres » |
| SMACL Assurances — siège de Niort | assureur mutualiste (secteur public) | https://www.smacl.fr/actus-et-conseils/ | Google Actualités « SMACL Niort » |
| CPAM des Deux-Sèvres — Assurance Maladie | protection sociale | https://www.ameli.fr/deux-sevres/assure/actualites | Google Actualités « CPAM des Deux-Sèvres fraude » |
| MGEN | mutuelle | https://www.mgen.fr/ressources/actualites | Google Actualités « MGEN Deux-Sèvres » |
| Harmonie Mutuelle | mutuelle | https://www.harmonie-mutuelle.fr/actualites/ | Google Actualités « Harmonie Mutuelle Deux-Sèvres » |
| Crédit Mutuel — agences des Deux-Sèvres | banque | https://www.creditmutuel.com/fr/actualites | Google Actualités « Crédit Mutuel Deux-Sèvres » |
| Banque Populaire — agences des Deux-Sèvres | banque | https://www.banquepopulaire.fr/votre-banque/actualites/ | Google Actualités « Banque Populaire Deux-Sèvres fraude » |
| Caisse d'Épargne Loire Centre | banque régionale | https://www.caisse-epargne.fr/votre-banque/actualites/ | Google Actualités « Caisse d'Épargne Deux-Sèvres » |
| France Assureurs | fédération de l'assurance | https://www.franceassureurs.fr/actualites/ | https://www.franceassureurs.fr/feed/ |
| Fédération Bancaire Française (FBF) | fédération bancaire | https://fbf.fr/fr/rubrique-newsroom/actualites/ | Google Actualités « FBF banque Deux-Sèvres » |
| ACPR | autorité de régulation | https://acpr.banque-france.fr/fr/actualites | Google Actualités « ACPR Deux-Sèvres banque » |
| ORIAS | registre professionnel | https://www.orias.fr/home/communications | Google Actualités « ORIAS assurance intermédiaire » |
| CNCGP | chambre professionnelle | https://www.cncgp.fr/actualites | Google Actualités « CNCGP conseil patrimoine » |
| Niort info | presse locale | https://niortinfo.media/ | https://niortinfo.media/feed/ |
| actu.fr — Deux-Sèvres | presse locale | https://actu.fr/pays-de-la-loire/deux-sevres_79/ | Google Actualités « actu.fr Deux-Sèvres banque » |
| France 3 Nouvelle-Aquitaine — Deux-Sèvres | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/rss |
| ICI Poitou (Radio France) | radio locale | https://www.ici.fr/poitou | https://www.ici.fr/rss/poitou/rubrique/infos.xml |

## Exemples cyber observés

- « Vol de données des clients MAIF et BPCE, que faire si vous êtes concerné ? » — 20 Minutes ( flux Google Actualités MAIF).
- « Fuite de données chez Maif et Banque populaire : que faire ? » — Capital.fr (flux Google Actualités Banque Populaire).
- « Attention aux arnaques SMS à l'assurance maladie via votre compte AMELI » — France 3 Régions (flux CPAM 79).
- « Melle : des clients de l'agence du Crédit Mutuel ciblés par des escrocs » — ici.fr (flux Crédit Mutuel 79).
- « Arnaque à la carte bancaire : les faux coursiers de Niort dans le box des prévenus » — ici.fr (flux Niort info).
- « Divulgation des données FICOBA : la FBF appelle à la vigilance » — Fédération bancaire française (flux FBF).
- « Usurpation d'identité : l'Orias simplifie les démarches pour les intermédiaires » — L'Argus de l'assurance (flux ORIAS).

Les autres valeurs de `exemple_cyber` sont des scénarios de fraude illustratifs, explicitement rédigés comme tels, et non des incidents attestés.

## Méthode et candidates écartés

Recherche web (annuaires professionnels, chambres consulaires, fédérations, organismes de protection sociale, presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur, suivi des redirections et délai maximal de 25 s. Seules les sources dont les trois URL ont répondu 200 ont été intégrées.

Écartés après vérification HTTP : MACIF et MAAF (403 sur le site et les pages d'actualités), CCI des Deux-Sèvres / deux-sevres.cci.fr (challenge Cloudflare, 403), La Nouvelle République — Deux-Sèvres (403 sur les pages, seul le flux RSS répond 200), MSA 79 et Mutualité Française 79 (noms de domaine non résolus), Chambre d'agriculture des Deux-Sèvres (503). Les flux Google Actualités sont des requêtes ciblées « organisation + 79 » : leur contenu est agrégé, les pages d'actualités restant les sources primaires.
