# Couverture « energie-eau » — Creuse (23)

18 sources vérifiées, 47 URLs distinctes contrôlées en HTTP 200 le 2026-11-22
(sites, pages d'actualités et flux RSS/Atom). Aucune URL en échec retenue.

Corpus : `bench/corpus/sources-energie-eau-23.jsonl` — preuve HTTP :
`bench/results/verification-energie-eau-23.json` — intégration :
`db/migrate-077-sources-energie-eau-23.sql` (ids `corpus:e23-*`, `department='23'`).

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Conseil départemental de la Creuse | collectivité territoriale | /-A-la-une- | /rss/actus.rss (10 items) |
| Département — Eau et milieux aquatiques | service départemental de l'eau | /-Environnement- | — |
| Services de l'État en Creuse — préfecture | administration départementale | /actualites | Google Actualités Creuse eau énergie (8 items) |
| DREAL Nouvelle-Aquitaine | administration régionale | spip.php?page=liste-actualites | spip.php?page=backend-actu (176 items) |
| CCI de la Creuse | chambre consulaire | /category/entreprise/ | /feed/ (10 items) |
| CMA Nouvelle-Aquitaine — Creuse | chambre consulaire | /a-cote-de-chez-vous/actualites | Google Actualités CMA Creuse (18 items) |
| Agglomération du Grand Guéret | communauté d'agglomération | /lagglo/actualites/ | /feed/ (12 items) |
| Enedis | distributeur d'électricité | /presse | Google Actualités Enedis Creuse (25 items) |
| FP2E | fédération professionnelle | /actualites/ | /feed/ (2 items) |
| CIEau | centre de ressources sur l'eau | /categorie/actualite-de-eau/ | /feed/ (10 items) |
| GRDF | distributeur de gaz | — | Google Actualités GRDF (66 items) |
| SUEZ | opérateur privé de l'eau | /fr/news | Google Actualités SUEZ eau (51 items) |
| EDF | opérateur énergétique | — | Google Actualités EDF Creuse (34 items) |
| Pro-RGE — Creuse (23) | annuaire professionnel | — | — |
| Recours France — énergie et eau (23) | annuaire professionnel | — | — |
| La Montagne — Creuse | presse locale | /creuse/economie | Google Actualités filtré (100 items) |
| Ici Creuse (ex-France Bleu Creuse) | radio locale | /infos | Google Actualités Ici Creuse (35 items) |
| Radio Totem | radio locale | /info | Google Actualités Radio Totem Creuse (10 items) |

## Exemples cyber associés

Le champ `exemple_cyber` relève les risques observés dans le secteur :
arnaque à la facture d'eau et faux agents, démarchages frauduleux usurpant
Enedis, faux techniciens GRDF, fuite de données clients chez un prestataire
SUEZ, hameçonnage aux coordonnées bancaires des clients d'électricité, fausses
alertes de coupure d'eau ou de sécheresse et usurpation d'identité
d'établissements publics et consulaires.

## Candidats écartés

- `https://www.creuse.fr/actualites`, `/les-actualites`, `/actu` : HTTP 404 ; la page réelle est `/-A-la-une-`.
- `https://www.creuse.gouv.fr/rss.xml` : HTTP 404 ; veille via Google Actualités retenue.
- `https://www.grdf.fr/actualites`, `/news`, `/communiques` : HTTP 403 (challenge anti-bot).
- `https://www.edf.fr/groupe-edf/espaces-dedies/journaliste/...` : HTTP 403/404 ; veille via Google Actualités retenue.
- `https://nouvelle-aquitaine.ademe.fr/` et `https://www.veolia.fr/` : HTTP 403.
- `https://www.saur.fr/` : certificat TLS invalide pour le nom d'hôte.
- `www.sdec23.fr`, `www.siea23.fr`, `www.eau23.fr`, `www.fdee23.fr`, `www.grand-gueret.fr`, `www.creuse-confluence.fr`, `www.icibeyreuth.fr` : noms de domaine non résolus (les redirections `francebleu.fr/creuse` → `ici.fr/radio/creuse` et `grandgueret.fr` → `agglo-grandgueret.fr` ont été retenues).
- `https://www.ici.fr/rss/creuse` : HTTP 200 mais corps HTML sans items RSS ; flux Google Actualités retenu.

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, sites officiels,
presse locale), identification des pages d'actualités et des flux, puis contrôle
GET de chaque URL avec User-Agent navigateur et suivi des redirections, délai
22 s, comptage des items pour les flux. Le détail des 47 contrôles figure dans
le rapport de vérification.
OBJECTIF : atteint — 18 / 5
