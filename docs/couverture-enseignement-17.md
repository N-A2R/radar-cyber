# Couverture des sources « enseignement » — Charente-Maritime (17)

Seize sources du secteur `enseignement` pour le département 17, vérifiées le 2026-11-22 : 39 URL distinctes contrôlées (sites, pages d'actualités et flux RSS/Atom), toutes en HTTP 200.

Périmètre : établissements et opérateurs de l'enseignement de la Charente-Maritime (université, laboratoire, écoles supérieures, enseignement catholique, GRETA, lycées de La Rochelle, Saintes, Surgères, Jonzac et Rochefort) et presse locale couvrant le département (Sud Ouest, actu.fr, ici La Rochelle, France 3 Nouvelle-Aquitaine, Haute Saintonge).

| Source | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Université de La Rochelle | université | https://www.univ-larochelle.fr/ | /Actualites/ | /actualites/feed/ |
| L3i — Laboratoire d'Informatique et d'Intelligence de La Rochelle | laboratoire universitaire d'informatique | https://l3i.univ-larochelle.fr/ | /actualites/ | /feed/ |
| EIGSI — École d'ingénieurs de La Rochelle | école supérieure d'ingénieurs | https://www.eigsi.fr/ | /actualites-ecole-ingenieur/ | — |
| Excelia — écoles supérieures de La Rochelle | groupe d'écoles supérieures | https://www.excelia-group.fr/ | /a-propos-dexcelia/news-room/actualites | /rss.xml |
| La Salle Saint-Louis — établissement catholique de La Rochelle | établissement d'enseignement catholique | https://www.lasallesaintlouis.fr/ | /copie-de-actualit%C3%A9s-%C3%A9cole | /blog-feed.xml |
| Greta Poitou-Charentes — formation continue (site 17) | GRETA — formation professionnelle continue | https://www.greta-poitou-charentes.fr/ | /actualites/ | /feed/ |
| Lycée Antoine de Saint-Exupéry (La Rochelle) | lycée général et technologique | https://www.lycee-saintexupery-larochelle.fr/ | /blog | — |
| Lycée Bernard Palissy (Saintes) | lycée professionnel | https://palissy.fr/ | /actualites/ | /feed/ |
| Lycée polyvalent du Pays d'Aunis (Surgères) | lycée polyvalent et CFA | https://www.lyceedupaysdaunis.com/ | /actualites/ | /feed/ |
| Lycée Jean Hyppolite (Jonzac) | lycée général et professionnel | https://lycee-jeanhyppolite.fr/ | accueil | /?format=feed&type=rss |
| Lycée polyvalent Marcel Dassault (Rochefort) | lycée polyvalent | https://www.lycee-marcel-dassault.fr/ | /actualite.html | — |
| Sud Ouest — Charente-Maritime (étudiant) | presse quotidienne régionale | https://www.sudouest.fr/charente-maritime/ | /etudiant/ | /rss.xml |
| actu.fr — Charente-Maritime | média local en ligne | https://actu.fr/nouvelle-aquitaine/charente-maritime_17 | accueil | /rss.xml |
| ici La Rochelle — Radio France | radio/média local | https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17 | accueil | /rss/la-rochelle/a-la-une.xml |
| France 3 Nouvelle-Aquitaine — Charente-Maritime | télévision publique régionale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente-maritime | accueil | /titres.rss |
| Haute Saintonge | hebdomadaire local | https://www.hautesaintonge.fr/ | accueil | — |

Méthode : recherche web (annuaires d'établissements, sites d'académie, sites d'écoles, presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur, suivi des redirections et délai maximal de 25 s. Seules les sources dont toutes les URLs ont répondu 200 ont été retenues.

Intégration : `bench/corpus/sources-enseignement-17.jsonl`, `bench/results/verification-sources-enseignement-17.json`, `db/migrate-073-sources-enseignement-17.sql` (16 sources, 39 traçages `source_verification` en `ok200`), appliqués en base locale le 2026-11-22. Empreinte du corpus : `bench/corpus/HASH`.

Mesure reproductible (rejouée le 22/11/2026) :

```
jq -s '[.[] | select(.secteur=="enseignement" and .departement=="17" and .code_http==200)] | length' bench/corpus/sources-enseignement-17.jsonl
jq '[.detail[].urls[] | select(.code == 200)] | length' bench/results/verification-sources-enseignement-17.json
```

→ 16 sources en HTTP 200 ; 39 URL vérifiées, 39 en 200. Cible : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur « enseignement » / département 17. Aucun code ni test modifié.

OBJECTIF : atteint — 16 / 5
