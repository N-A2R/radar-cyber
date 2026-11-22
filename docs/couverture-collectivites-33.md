# Sources du secteur « collectivites » — Gironde (33)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **15 sources, 42 URL distinctes toutes en HTTP 200** (42 contrôles) le 2026-11-22.

- Corpus : `bench/corpus/sources-collectivites-33.jsonl` (15 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`). Empreinte du corpus consolidé : `ca1f53f7239a26f7938f5ab715d4b9b0189d467931f21f76e2e4b35385d44e0f` (`bench/corpus/HASH`).
- Preuve HTTP : `bench/results/verification-collectivites-33.json` — code, type de contenu et URL contrôlés (sites, pages d'actualités, flux et articles cyber). 10 flux RSS vérifiés.
- Intégration : `db/migrate-093-sources-collectivites-33.sql` — 15 lignes dans `source` (identifiants `corpus:collectivites-33-*`), 42 traces `ok200` dans `source_verification`. Migration rejouée une seconde fois : 15 lignes et 42 traces, sans doublon.
- Exemples cyber : fuite revendiquée du portail de la taxe de séjour de Bordeaux Métropole (Cyberattaque.org), cyberattaque contre la mairie de Berson (France 3), faille touchant préfecture et mairie de Bordeaux (ici Gironde), politique de divulgation des vulnérabilités du conseil départemental, atelier de prévention au phishing par SMS de la Ville de Bordeaux. Les sources sans incident propre portent une mention explicite : aucun événement n'est inventé.

## Organisations retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| 20 Minutes Bordeaux | quotidien local | https://www.20minutes.fr/bordeaux/ | idem | https://www.20minutes.fr/feeds/rss-bordeaux.xml |
| AMG33 — Association des Maires de Gironde | association d'élus | https://amg33.fr/ | https://amg33.fr/lactualite/ | https://amg33.fr/feed/ |
| Actu.fr — Gironde | presse locale en ligne | https://actu.fr/nouvelle-aquitaine/gironde_33/ | idem | https://actu.fr/nouvelle-aquitaine/gironde_33/rss.xml |
| Annuaire des communes de la Gironde (annuaire-mairie.fr) | annuaire local | https://www.annuaire-mairie.fr/departement-gironde.html | — | — |
| Bordeaux Métropole | intercommunalité | https://www.bordeaux-metropole.fr/ | https://www.bordeaux-metropole.fr/actualites-Bordeaux-Metropole | https://www.bordeaux-metropole.fr/rss.xml |
| Chambre d'agriculture de la Gironde | chambre consulaire | https://gironde.chambres-agriculture.fr/ | https://gironde.chambres-agriculture.fr/actualites-33 | — |
| Conseil départemental de la Gironde | conseil départemental | https://www.gironde.fr/ | https://www.gironde.fr/actualites | — |
| France 3 Nouvelle-Aquitaine — Gironde | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/ | idem | — |
| Fédération des chasseurs de la Gironde | fédération départementale | https://chasseurs33.com/ | https://chasseurs33.com/actu/ | https://chasseurs33.com/feed/ |
| Le Mag — magazine municipal de Bordeaux | magazine municipal | https://www.bordeaux.fr/le-mag/le-mag-bordeaux-votre-magazine-municipal | https://www.bordeaux.fr/le-mag | — |
| Ville de Bordeaux | commune | https://www.bordeaux.fr/ | https://www.bordeaux.fr/toute-l-actualite | https://www.bordeaux.fr/rss.xml |
| Ville de Libourne | commune | https://www.libourne.fr/ | https://www.libourne.fr/information-transversale/actualites | https://www.libourne.fr/information-transversale/actualites/rss |
| Ville de Mérignac | commune | https://www.merignac.com/ | https://www.merignac.com/actualites | https://www.merignac.com/rss.xml |
| Ville de Pessac | commune | https://www.pessac.fr/ | https://www.pessac.fr/actualites-109.html | https://www.pessac.fr/actualites-109/flux-rss.xml |
| ici Gironde (ex-France Bleu Gironde) | radio locale | https://www.ici.fr/gironde/ | https://www.ici.fr/nouvelle-aquitaine/gironde-33/ | https://www.ici.fr/rss/gironde/a-la-une.xml |

## Candidats écartés

- `https://www.gironde.gouv.fr/` et `https://www.gironde.gouv.fr/Actualites` (préfecture) : HTTP 200 ponctuel en début de recherche, puis HTTP 000 (HTTP/2 stream reset, puis réponse vide) au contrôle final du 22/11/2026 — non retenu, faute de 200 stable.
- `https://www.sudouest.fr/gironde/` : redirection 302 en boucle, aucun code 200 vérifiable.
- CCI Bordeaux Gironde : challenge Cloudflare, HTTP 403.
- SDIS 33 : aucun enregistrement A résolu lors de la recherche.
- Exa MCP indisponible (HTTP 402, crédits épuisés) : angulation par pages officielles et moteurs HTML accessibles, puis vérification HTTP de chaque URL retenue.
OBJECTIF : atteint — 15 / 5
