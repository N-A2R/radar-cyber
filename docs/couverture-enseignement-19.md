# Couverture — sources « enseignement » de la Corrèze (19)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **10 sources en HTTP 200**, 36 contrôles HTTP tous en 200 (27 URL de sources — 26 uniques — et 9 articles d'exemple ; 7 flux RSS/API), le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Lycée Pierre-Caraminot (Égletons) | lycée | http://www.lyceecaraminot.fr/ | http://www.lyceecaraminot.fr/Actualites | https://www.lyceecaraminot.fr/rss/actualites.xml |
| Lycée agricole Edgard-Pisani Tulle-Naves | lycée agricole | https://lycee-agricole-tulle.fr/ | https://lycee-agricole-tulle.fr/?s=actualite | https://lycee-agricole-tulle.fr/feed/ |
| Lycée des métiers Marcel Barbanceys (Neuvic) | lycée professionnel | https://www.lycee-barbanceys.com/ | https://www.lycee-barbanceys.com/actualites/ | https://www.lycee-barbanceys.com/feed/ |
| EPL Haute-Corrèze (Meymac / Neuvic) | lycée agricole | https://epl-haute-correze.fr/ | https://epl-haute-correze.fr/actualites/ | — |
| Lycée Georges-Cabanis (Brive-la-Gaillarde) | lycée | https://lycee-cabanis.fr/ | https://lycee-cabanis.fr/actualites/ | https://lycee-cabanis.fr/feed/ |
| Lycée et CFA Lavoisier (Brive-la-Gaillarde) | lycée / CFA | https://www.lycee-lavoisier.com/ | https://www.lycee-lavoisier.com/actualites/ | https://www.lycee-lavoisier.com/feed/ |
| Cité scolaire d’Arsonval (Brive-la-Gaillarde) | cité scolaire | https://www.cite-scolaire-arsonval.fr/ | https://www.cite-scolaire-arsonval.fr/Actualites | https://www.cite-scolaire-arsonval.fr/rss/actualites.xml |
| La Vie Corrézienne — rubrique Éducation | presse locale | https://www.laviecorrezienne.fr/ | https://www.laviecorrezienne.fr/actualites-education.html | — |
| Annuaire des établissements (Éducation nationale) | annuaire professionnel | https://data.education.gouv.fr/pages/recherche-etablissement/ | idem | API JSON Corrèze |
| GRETA du Limousin — antennes de Corrèze | organisme de formation | https://www.greta-du-limousin.fr/ | https://www.greta-du-limousin.fr/actualites/ | — |

Toutes ces organisations sont ancrées dans le département 19 : Égletons, Naves/Tulle, Neuvic, Meymac, Brive-la-Gaillarde, presse départementale, annuaire interrogé sur la Corrèze et antennes GRETA de Brive/Tulle/Égletons.

## Exemples cyber associés

Le champ `exemple_cyber` s'appuie sur des articles vérifiés en HTTP 200 : ransomware du collège La Salle de Brive (France 3, 12/02/2025, 8 000 € de rançon), piratage Pronote d'un lycée d'Agen (Sud Ouest, 11/09/2026), piratage du compte Pronote d'un élève à Anglet (Sud Ouest, 31/05/2024) et cyberattaque de l'école de commerce de Pau (Sud Ouest, 15/05/2024). L'annuaire n'a pas d'exemple d'article dédié : le champ est vide.

## Candidats écartés

- **CCI de la Corrèze** (`www.correze.cci.fr`) et **rectorat de Limoges** (`www.ac-limoges.fr`) : HTTP 403 sous curl (protection anti-bot), non retenus.
- **CMA Corrèze** : redirection vers `cma-nouvelleaquitaine.fr`, sans page locale dédiée ; pas retenue comme source départementale.
- `www.iut-tulle.fr`, `iut-tulle.unilim.fr` : NXDOMAIN ; `www.unilim.fr/iut-tulle/` : 404.
- `lycee-agricole-tulle.fr/actualites/` : 404 ; la recherche interne `?s=actualite` et le flux `/feed/` ont été retenus.
- `www.laviecorrezienne.fr/rss.xml` : 404 ; aucun flux trouvé pour ce titre.
- `actu.fr/nouvelle-aquitaine/correze_19/` : HTTP 403 sous curl.

## Méthode et intégration

Découverte par recherche web et annuaires (corpus local `sante-enseignement.jsonl`, `institutions-complet.jsonl`, annuaire Éducation nationale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur, suivi des redirections et délai de 25 s. Les 36 URLs ont répondu 200 ; preuve détaillée dans `bench/results/verification-enseignement-19.json`.

Corpus : `bench/corpus/sources-enseignement-19.jsonl` (10 lignes, empreinte recalculée dans `bench/corpus/HASH`).
Base : `db/migrate-070-sources-enseignement-19.sql` insère 10 lignes dans `source` (parser pointant vers le corpus) et 26 traces `source_verification` en état `ok200` (26 URL de sources uniques ; l'annuaire partage la même URL pour site et actualités).

OBJECTIF : atteint — 10 / 5
