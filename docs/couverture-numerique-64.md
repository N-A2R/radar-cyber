# Couverture — sources « numerique » des Pyrénées-Atlantiques (64)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **21 sources en HTTP 200**, 62 URL contrôlées le 2026-11-22 (62 en HTTP 200, avec contenu HTML ou flux RSS exploitable).

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| CCI Pau Béarn | chambre consulaire — numérique | https://pau.cci.fr/ | https://pau.cci.fr/blog/ | https://pau.cci.fr/feed/ |
| CMA Nouvelle-Aquitaine — antenne 64 | chambre consulaire — artisanat et numérique | https://cma-nouvelleaquitaine.fr/ | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| MEDEF Pays Basque | organisation patronale | https://www.medef-pays-basque.fr/ | https://www.medef-pays-basque.fr/actualites | — |
| MEDEF Béarn & Soule | organisation patronale | https://www.medef-bearnetsoule.com/fr | https://www.medef-bearnetsoule.com/actualites | — |
| Pays Basque Digital | cluster numérique | https://www.pays-basque-digital.fr/ | https://www.pays-basque-digital.fr/actualites/ | — |
| Syndicat Mixte La Fibre64 | syndicat mixte — très haut débit | https://lafibre64.fr/ | https://lafibre64.fr/cybermois/ | — |
| LaNum — Agence Numérique Pays Basque | agence numérique | https://lanum-paysbasque.com/ | https://lanum-paysbasque.com/ | https://lanum-paysbasque.com/feed/ |
| French Tech Pays Basque | réseau d'innovation | https://www.frenchtech-paysbasque.com/ | https://www.frenchtech-paysbasque.com/posts | — |
| ESTIA — technopole Izarbel | école d'ingénieurs et technopole | https://www.estia.fr/ | https://www.estia.fr/les-actualites/ | https://www.estia.fr/rss.xml |
| Numeum | syndicat professionnel du numérique | https://numeum.fr/ | https://numeum.fr/les-actualites-numeum/ | https://numeum.fr/feed/ |
| Communauté d'Agglomération Pays Basque | collectivité — rencontres numériques | https://www.communaute-paysbasque.fr/ | https://www.communaute-paysbasque.fr/actualites/toutes-les-actualites | — |
| Conseil départemental 64 — le64 | collectivité | https://www.le64.fr/ | https://www.le64.fr/lactualite-du-departement | https://www.le64.fr/rss.xml |
| Ville de Bayonne | collectivité | https://www.bayonne.fr/ | https://www.bayonne.fr/information-transversale/actualites | — |
| Sud Ouest — Pyrénées-Atlantiques | quotidien régional | https://www.sudouest.fr/pyrenees-atlantiques/ | https://www.sudouest.fr/pyrenees-atlantiques/pau/ | https://www.sudouest.fr/pyrenees-atlantiques/pau/rss.xml |
| La République des Pyrénées | quotidien départemental | https://www.larepubliquedespyrenees.fr/ | https://www.larepubliquedespyrenees.fr/ | https://www.larepubliquedespyrenees.fr/rss.xml |
| actu.fr — Pyrénées-Atlantiques | presse locale numérique | https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/ | idem | — |
| La Vie Economique — Pays Basque | presse économique locale | https://www.vie-economique.com/ | https://www.vie-economique.com/categories/pays-basque/ | https://www.vie-economique.com/feed/ |
| ici Pays Basque — Radio France | radio publique locale | https://www.ici.fr/radio/pays-basque | https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64 | https://www.ici.fr/rss/pays-basque/a-la-une.xml |
| France 3 Nouvelle-Aquitaine — Pyrénées-Atlantiques | télévision publique régionale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/pau | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/rss |
| Actu Pau | agrégateur d'actualité locale | https://actu-pau.com/ | https://actu-pau.com/actu/ | https://actu-pau.com/rss.xml |
| Université de Pau et des Pays de l'Adour | université — formations numériques | https://www.univ-pau.fr/ | https://www.univ-pau.fr/fr/actualites/toute-l-actualite.html | — |

## Ancrage territorial et exemples cyber

Les organisations retenues sont établies dans le département (CCI Pau, MEDEF Béarn & Soule et Pays Basque, La Fibre64, LaNum, Pays Basque Digital, ESTIA Izarbel, communes et collectivités du 64) ou couvrent explicitement le département (CMA Nouvelle-Aquitaine, Numeum, presse régionale et locale).

Exemples d'actualités numériques/cyber vérifiées en HTTP 200 : Cyber Resilience Act (Pays Basque Digital), souveraineté numérique béarnaise (CCI Pau), webinaire facturation électronique (CMA), initiation à ChatGPT (MEDEF Pays Basque), IA et Campus Cyber (MEDEF Béarn & Soule), Cybermois (Fibre64), Cyberhubs (Numeum), IA et données aux Rencontres numériques du Pays Basque (Communauté d'agglomération), cyberattaque d'une filiale de la Poste (Sud Ouest), cyberattaque d'entités de la CCI (La République des Pyrénées), cyberattaque des pompiers des Pyrénées-Atlantiques (ici Pays Basque), PME cibles des cyberattaques (France 3), cybersécurité Escape (La Vie Economique).

## Méthode, preuves et intégration

Découverte par sites officiels, annuaires professionnels, chambres consulaires, fédérations et presse locale (Exa indisponible : 402 crédits épuisés). Chaque URL a été contrôlée avec `scripts/verifier-sources.mts` (GET réel, redirections suivies, cookies conservés, contenu HTML/RSS exigé) : 62 URL, toutes en HTTP 200.

Candidats écartés après contrôle HTTP : CCI Bayonne (403 Cloudflare), PagesJaunes Informatique 64 (403), nombreuses URL de flux inexistantes (actu.fr 64, CMA, MEDEF, Pays Basque Digital, French Tech Pays Basque) et sites hors service ou en 404 (pau.fr en direct, medef64.fr, digitalpaysbasque.fr, etc.). Le flux La Fibre64 répond 200 mais sans item exploitable : il n'est pas enregistré comme flux dans le corpus.

Corpus : `bench/corpus/sources-numerique-64.jsonl` (21 lignes, empreinte recalculée dans `bench/corpus/HASH`).
Rapport : `bench/results/verification-numerique-64.json` (62 URL, code HTTP, type de contenu et items RSS).
Base : `db/migrate-066-sources-numerique-64.sql` (21 sources insérées dans `source`, 21 traces `source_verification`). Migration appliquée et vérifiée le 2026-11-22 sur la base de développement PostgreSQL : 21 lignes `corpus:numerique-64-%`, codes HTTP 200/200 (min/max).
OBJECTIF : atteint — 21 / 5
