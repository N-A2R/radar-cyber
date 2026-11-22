# Couverture « energie-eau » — Dordogne (24)

22 sources vérifiées, 63 URLs distinctes contrôlées en HTTP 200 le 2026-11-22
(sites, pages d'actualités et flux RSS/Atom). Aucune URL en échec retenue.

Corpus : `bench/corpus/sources-energie-eau-24.jsonl` — preuve HTTP :
`bench/results/verification-energie-eau-24.json` — intégration :
`db/migrate-085-sources-energie-eau-24.sql` (ids `corpus:e24-*`, `department='24'`).

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Préfecture de la Dordogne | administration départementale | /Actualites | Google Actualités site:dordogne.gouv.fr (56 items) |
| DREAL Nouvelle-Aquitaine | administration régionale | spip.php?page=liste-actualites | spip.php?page=backend-actu (176 items) |
| CCI de la Dordogne | chambre consulaire | /actualites/ | /feed/ (10 items) |
| Grand Périgueux | intercommunalité Eau-Assainissement | /actualites/ | /actualites/feed/ (10 items) |
| CC des Bastides Dordogne-Périgord | intercommunalité Assainissement | /accueil/actus/ | /feed/ (10 items) |
| Ville de Périgueux | collectivité territoriale | /actualites.html | /actualites/flux-actualites/rss.xml (162 items) |
| Ville de Bergerac | collectivité territoriale | /category/actualite/ | /feed/ (10 items) |
| Enedis | distributeur d'électricité | /presse | Google Actualités Enedis Dordogne (68 items) |
| EDF | opérateur énergétique | /groupe-edf/innover/.../toutes-les-actualites-de-la-rd | Google Actualités EDF Dordogne (37 items) |
| GRDF | distributeur de gaz | justdecarb.grdf.fr/espace-presse | Google Actualités GRDF Dordogne (50 items) |
| SUEZ | opérateur privé de l'eau | /fr/news | Google Actualités SUEZ Dordogne eau (10 items) |
| FP2E | fédération professionnelle | /actualites/ | /feed/ (2 items) |
| CIEau | centre de ressources sur l'eau | /categorie/actualite-de-eau/ | /feed/ (10 items) |
| Pro-RGE — Dordogne (24) | annuaire professionnel | /entreprise/d/24/ | Google Actualités RGE Dordogne (2 items) |
| Dordogne Libre | presse locale | /dordogne/ | /rss.xml (20 items) |
| Sud Ouest — Dordogne | presse locale | /dordogne | /dordogne/rss.xml (20 items) |
| Ici Périgord | radio locale | /nouvelle-aquitaine/dordogne-24 | Google Actualités Ici Périgord (87 items) |
| France 3 Nouvelle-Aquitaine — Dordogne | télévision locale | /nouvelle-aquitaine/dordogne | Google Actualités France 3 Dordogne (32 items) |
| SDE 24 — Syndicat départemental d'énergies | syndicat départemental | /category/actualites/ | /feed/ (20 items) |
| ENGIE | opérateur énergétique | /explore/actualites/ | Google Actualités ENGIE Dordogne (35 items) |
| SAUR | opérateur privé de l'eau | /fr/actualites/ | Google Actualités SAUR Dordogne (9 items) |
| Actu Dordogne | presse en ligne | /nouvelle-aquitaine/dordogne_24/ | Google Actualités Dordogne eau site:actu.fr (70 items) |

## Exemples cyber associés

Le champ `exemple_cyber` relève les risques observés dans le secteur :
arnaque à la facture d'eau et faux agents, démarchages frauduleux usurpant
Enedis, GRDF, ENGIE ou le SDE 24, fausses alertes de coupure d'eau ou de
sécheresse, faux techniciens, fuite de données clients chez un prestataire de
facturation, hameçonnage aux coordonnées bancaires et usurpation d'identité
d'établissements publics, consulaires et de collectivités locales.

## Candidats écartés

- `https://www.dordogne.fr/` (Conseil départemental) : HTTP 503, ainsi que
  `/-Eau-` ; veille assurée par la préfecture, le SDE 24 et les communautés
  d'agglomération.
- `https://www.veolia.fr/fr/actualites` : HTTP 403 (challenge anti-bot).
- `https://www.dordogne.gouv.fr/rss.xml` et `https://www.ici.fr/radio/perigord/rss.xml` : HTTP 404 ; veille via Google Actualités retenue.
- `https://www.bergerac.fr/actualites/` : HTTP 500 ; la page réelle est `/category/actualite/`.
- `https://www.grandperigueux.fr/feed/` : HTTP 200 mais un seul item « Hello world ! » ; le flux `/actualites/feed/` (10 items) a été retenu.
- `https://recours-france.fr/annuaire/energie/24-dordogne` : délai dépassé sans réponse ; `pro-rge.fr/entreprise/d/24/` retenu comme annuaire.
- `https://www.engie.com/fr`, `https://www.grdf.fr/actualites`, `https://www.edf.fr/groupe-edf/espaces-dedies/espace-presse` : redirections non canoniques ou 404 ; pages d'actualités canoniques retenues.

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, sites officiels,
syndicats départementaux, opérateurs et presse locale), identification des
pages d'actualités et des flux, puis contrôle GET de chaque URL avec
User-Agent navigateur et suivi des redirections, délai 25 s, comptage des items
pour les flux. Le détail des 63 contrôles figure dans le rapport de
vérification.
