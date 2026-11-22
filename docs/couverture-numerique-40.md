# Couverture — sources « numerique » des Landes (40)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **20 sources en HTTP 200**, 51 URL contrôlées le 2026-11-22 (51 en HTTP 200, 0 morte, 0 sans contenu).

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| CCI des Landes | chambre consulaire — numérique et cybersécurité | https://www.landes.cci.fr/ | https://www.landes.cci.fr/actualite/ | — |
| CMA Nouvelle-Aquitaine — antenne des Landes | chambre consulaire — artisanat et numérique | https://www.cma-landes.fr/ | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| MEDEF des Landes | organisation patronale | https://landes.territoriaux.medef.com/ | https://landes.territoriaux.medef.com/actualites | — |
| Club Landes Entreprises | club d'entreprises | https://club-landes-entreprises.fr/ | https://club-landes-entreprises.fr/agenda/ | https://club-landes-entreprises.fr/feed/ |
| Landes & Business — club d'affaires (Dax) | club d'entreprises | https://www.landes-business.fr/ | https://www.landes-business.fr/landes/ | https://www.landes-business.fr/feed/ |
| Club des Entrepreneurs de Saint-Paul-lès-Dax | club d'entrepreneurs | https://club-des-entrepreneurs-saint-paul-les-dax.fr/ | https://club-des-entrepreneurs-saint-paul-les-dax.fr/evenements/ | — |
| French Tech Bordeaux — réseau régional couvrant les Landes | réseau French Tech | https://frenchtechbordeaux.com/ | https://frenchtechbordeaux.com/ | — |
| NATHD — Service public de la fibre en Nouvelle-Aquitaine | syndicat mixte — très haut débit | https://nathd.fr/ | https://nathd.fr/ | https://nathd.fr/feed/ |
| actu.fr — Actu Landes | presse locale numérique | https://actu.fr/landes/ | https://actu.fr/landes/dernieres-actus | https://actu.fr/landes/rss.xml |
| Sud Ouest — édition Landes | quotidien régional | https://www.sudouest.fr/landes/ | https://www.sudouest.fr/landes/archives/ | https://www.sudouest.fr/landes/rss.xml |
| Landes Info | pure player local | https://landesinfo.net/ | https://landesinfo.net/edition | https://landesinfo.net/feed/ |
| ici Landes (40) — Radio France | radio publique locale | https://www.ici.fr/nouvelle-aquitaine/landes-40 | https://www.ici.fr/nouvelle-aquitaine/landes-40 | https://www.ici.fr/rss/gascogne/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine — édition Landes | télévision publique régionale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss |
| AquitaineOnLine — Landes | presse en ligne régionale | https://www.aquitaineonline.com/ | https://www.aquitaineonline.com/actualites-en-aquitaine/landes/ | https://www.aquitaineonline.com/actualites-en-aquitaine/landes/feed/rss/ |
| Les Annonces Landaises | hebdomadaire local | https://www.annonces-landaises.com/ | https://www.annonces-landaises.com/categories/collectivites/ | https://www.annonces-landaises.com/feed/ |
| Actu Locale 365 — Landes | agrégateur d'actualité locale | https://actulocale365.fr/nouvelle-aquitaine/landes/ | https://actulocale365.fr/nouvelle-aquitaine/landes/ | — |
| Le Parisien — Landes (40) | quotidien régional | https://www.leparisien.fr/landes-40/ | https://www.leparisien.fr/landes-40/ | — |
| XLandes-Info | média départemental en ligne | https://www.xlandes-info.fr/ | https://www.xlandes-info.fr/ | — |
| PresseLib — édition Landes | média local en ligne | https://presselib.com/ | https://presselib.com/en-region/landes | — |
| Université de Pau et des Pays de l'Adour — actualités | université — formations numériques | https://www.univ-pau.fr/ | https://www.univ-pau.fr/fr/actualites/toute-l-actualite.html | — |

Les organisations sont ancrées dans les Landes (40) ou couvrent le département : CCI des Landes, CMA (antenne landaise), MEDEF Landes, clubs d'entreprises landais, NATHD (fibre en Nouvelle-Aquitaine) et le réseau French Tech régional. La presse locale et régionale complète la veille numérique et cyber du territoire.

## Exemples cyber associés

Le champ `exemple_cyber` s'appuie sur des articles vérifiés en HTTP 200 : Mars@Hack 2026 (cybersécurité, CCI des Landes), cyberattaque des pompiers des Landes (actu.fr), cyberattaque avec rançon à la Ville de Tarnos (Sud Ouest), arnaque au faux SMS à Mont-de-Marsan (Landes Info), arnaque sur les réseaux de transport landais (ici Landes), faux soignant à Mont-de-Marsan (France 3), Mars@Hack 2022 (AquitaineOnLine) et « Octobre, mois de la cybersécurité à Mont-de-Marsan » (Les Annonces Landaises).

## Méthode et intégration

Découverte par recherches web, annuaires professionnels, sites d'organisations, chambres consulaires et presse locale, puis identification des pages d'actualités et des flux. Chaque URL a été contrôlée avec `scripts/verifier-sources.mts` (GET réel, redirections suivies, cookies conservés, contenu HTML/RSS exigé) : 51 URL, toutes en HTTP 200.

Corpus : `bench/corpus/sources-numerique-40.jsonl` (20 lignes, empreinte recalculée dans `bench/corpus/HASH`).
Rapport : `bench/results/verification-numerique-40.json`.
Base : `db/migrate-123-sources-numerique-40.sql` (20 sources insérées dans `source`, 20 traces `source_verification`).
