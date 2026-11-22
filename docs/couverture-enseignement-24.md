# Couverture « enseignement » — Dordogne (24)

Objectif chiffré : au moins **5 sources vérifiées en HTTP 200** pour le couple
secteur enseignement / département 24. **Livré : 16 sources**, 46 URL contrôlées,
46 en HTTP 200 le 2026-11-22.

OBJECTIF : atteint — 16 / 5

## Sources intégrées

| Source | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Écoles de la CCI de Dordogne | chambre consulaire, CFA | https://www.ecoles.dordogne.cci.fr/ | /actualites/ | /feed/ |
| Lycée Maine de Biran (Bergerac) | lycée | https://blogpeda.ac-bordeaux.fr/mainedebiran/ | accueil du blog | /feed/ |
| Collège Léo Testut (Bergerac) | collège | https://blogpeda.ac-bordeaux.fr/leotestut/ | accueil du blog | /feed/ |
| Lycée Jean Capelle (Bergerac) | lycée professionnel | https://lyceejeancapellebergerac.fr/ | /actualites/ | /feed/ |
| Lycée Sud-Périgord Hélène Duc | lycée professionnel | https://www.lycee-sud-perigord.fr/2023/ | /news/ | /feed/ |
| AgroCampus Périgord — La Peyrouse | lycée agricole, CFA | https://perigord.educagri.fr/ | accueil | /rss.xml |
| FSU-SNUipp 24 | fédération syndicale | https://24.fsu-snuipp.fr/ | accueil | /spip.php?page=backend |
| Annuaire Éducation nationale (24) | annuaire officiel | API data.education.gouv.fr (requête Dordogne) | — | — |
| Sud Ouest — Dordogne | presse locale | https://www.sudouest.fr/dordogne/ | /etudiant/lycee/ | /dordogne/rss.xml |
| Sud Ouest — Étudiant | rubrique éducation | https://www.sudouest.fr/etudiant/ | /etudiant/lycee/ | /etudiant/rss.xml |
| Dordogne Libre | presse hebdomadaire | https://www.dordognelibre.fr/ | accueil | /rss.xml |
| Réussir le Périgord | presse hebdomadaire | https://www.reussirleperigord.fr/ | accueil | /feed |
| ici Périgord | radio locale | https://www.ici.fr/radio/perigord | /nouvelle-aquitaine/dordogne-24 | /rss/perigord/rubrique/infos.xml |
| Ville de Périgueux | collectivité, scolarité | https://www.perigueux.fr/ | /actualites/cat-Scolarité-39.html | /actualites/flux-actualites/rss.xml |
| Point Info Jeunesse de Périgueux | annuaire formation | https://www.perigueux-jeunesse.fr/ | /me-former-travailler/ | /feed/ |
| Sarlat-la-Canéda | collectivité, écoles | https://sarlat.fr/ | /mon-quotidien/scolarite-enfance-et-jeunesse/les-ecoles-de-sarlat/ | /feed/ |

Toutes ces organisations sont ancrées dans la Dordogne : Bergerac, Périgueux,
Boulazac Isle Manoire et Sarlat-la-Canéda pour les établissements et les
collectivités, chambre consulaire et fédération départementale, annuaire officiel
interrogé sur la Dordogne, quatre titres ou rubriques de presse locale.

## Exemples cyber associés

Le champ `exemple_cyber` cite des articles vérifiés en HTTP 200 : rançongiciel au
collège La Salle de Brive (France 3, 12/02/2025, 8 000 € de rançon et bulletins
perdus), piratage Pronote dans un lycée d'Agen (Sud Ouest, 11/09/2026), piratage
du compte Pronote d'un élève à Anglet (Sud Ouest, 31/05/2024) et cyberattaque de
l'école de commerce de Pau (Sud Ouest, 15/05/2024). Les alertes liées au lycée
Jay-de-Beaufort de Périgueux (message sur Pronote, 2026) sont attestées par les
titres du flux Google Actualités vérifié en HTTP 200.

## Candidats écartés

- `https://www.bergerac.fr/` (site, rubrique écoles et flux) : HTTP 500 au
  contrôle final alors que les trois URL répondaient 200 plus tôt dans la
  journée ; retiré du corpus pour ne pas livrer une source instable.
- `https://www.cma-dordogne.fr/` et `https://iut-perigueux.u-bordeaux.fr/` :
  échec réseau (000).
- `https://actu.fr/nouvelle-aquitaine/dordogne_24/rss.xml` et
  `https://www.ac-bordeaux.fr/` : HTTP 403 sous curl.

## Méthode et intégration

Découverte par annuaire officiel de l'Éducation nationale, sites d'établissements,
chambres consulaires, fédération départementale, collectivités et presse locale ;
identification des pages d'actualités et des flux, puis contrôle de chaque URL
par GET `curl -L` avec User-Agent navigateur et délai de 25 s. Preuve complète :
`bench/results/verification-enseignement-24.json`.

Corpus : `bench/corpus/sources-enseignement-24.jsonl` (16 lignes, empreinte
recalculée dans `bench/corpus/HASH`).
Base : `db/migrate-081-sources-enseignement-24.sql` insère 16 lignes dans `source`
(parser pointant vers le corpus) et 16 traces `source_verification` en état
`ok200`.
