# Sources du secteur « commerce » — Landes (40)

## Résultat

OBJECTIF : atteint — 14 / 5

**14 sources vérifiées en HTTP 200** pour le couple secteur `commerce` / département `40` (cible : au moins 5 sources vérifiées en 200).

- Corpus : `bench/corpus/sources-commerce-40.jsonl` (14 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-commerce-40.json` — 50 URLs contrôlées le 2026-11-22, 50 en 200 (sites, pages d'actualités, flux et articles cyber).
- Intégration : `db/migrate-066-sources-commerce-40.sql` — 14 sources (`corpus:commerce-40-*`) et 50 traces uniques dans `source_verification` en `ok200` / HTTP 200.
- Empreinte corpus `bench/corpus/HASH` : `52b46f7e71c06d9db47fc5f8bc9dc6a053a6dbbd2bed8942f22dd0eaf51bbd54`.

## Organisations retenues

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CCI des Landes | chambre consulaire (commerce et industrie) | https://www.landes.cci.fr/actualite/ | — (flux local 500) |
| CMA Nouvelle-Aquitaine — antenne des Landes | chambre consulaire (métiers et artisanat) | https://www.cma-landes.fr/actualites/ | — |
| MEDEF des Landes | organisation patronale | https://landes.territoriaux.medef.com/actualites | Google Actualités |
| Club Landes Entreprises | club d'entreprises et réseau commerçants | https://club-landes-entreprises.fr/agenda/ | https://club-landes-entreprises.fr/feed/ |
| Landes & Business (Dax) | club d'affaires | https://www.landes-business.fr/landes/ | https://www.landes-business.fr/feed/ |
| Le Journal des Entreprises — Landes | presse économique régionale | https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/landes | RSS Nouvelle-Aquitaine |
| actu.fr — Landes (économie) | presse en ligne locale | https://actu.fr/landes/economie | https://actu.fr/landes/rss.xml |
| Landes Info | presse locale en ligne | https://landesinfo.net/edition | https://landesinfo.net/feed/ |
| Les Annonces Landaises | hebdomadaire local (annonces et commerces) | https://www.annonces-landaises.com/categories/collectivites/ | https://www.annonces-landaises.com/feed/ |
| ZE mag 40 | magazine mensuel local | https://www.zemag40.com/zemag/ | https://www.zemag40.com/rss/blog |
| Mon-Entreprise-Info — Landes | annuaire et actualités des entreprises | https://mon-entreprise-info.com/actualites/landes/ | RSS Landes |
| Societe.Tech — Landes | presse entreprises et technologies | https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-landes/ | Google Actualités |
| AquitaineOnLine — Landes | presse régionale en ligne | https://www.aquitaineonline.com/actualites-en-aquitaine/landes/ | — |
| ICI Gascogne — Landes (Radio France) | radio locale | https://www.ici.fr/nouvelle-aquitaine/landes-40 | https://www.ici.fr/rss/gascogne/rubrique/infos.xml |

Onze flux RSS exploitables sur les 14 sources (10 natifs, 2 via Google Actualités dont un redondant avec un flux natif compté une fois).

## Exemples cyber associés

- Mars@Hack 2026 : les acteurs landais mobilisés autour de la cybersécurité (CCI des Landes) — https://www.landes.cci.fr/presse/marshack-2026-cybersecurite/
- Mars@Hack 2022 : un cyberévènement dans les Landes (AquitaineOnLine) — https://www.aquitaineonline.com/actualites-en-aquitaine/landes/9919-mars-hack-cyber-evenement-dans-les-landes.html
- Les pompiers des Landes victimes d'une cyberattaque, des données personnelles extraites (actu.fr) — https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html
- Arnaque au faux SMS à Mont-de-Marsan : une victime perd 52 000 euros (Landes Info) — https://landesinfo.net/05/02/arnaque-au-faux-sms-a-mont-de-marsan-une-victime-perd-52-000-euros/19949/
- Octobre, mois de la cybersécurité à Mont-de-Marsan (Les Annonces Landaises) — https://www.annonces-landaises.com/actualites/collectivites-octobre-mois-de-la-cybersecurite-a-mont-de-marsan/
- Des réseaux de transport landais victimes d'une arnaque sur Facebook (ICI Gascogne) — https://www.ici.fr/infos/faits-divers-justice/des-reseaux-de-transport-landais-victimes-d-une-arnaque-sur-facebook-1671740

## Candidats écartés

- Sud Ouest — Landes : site, éditions et flux renvoient une boucle de redirections (302) sous User-Agent navigateur ; non retenu faute de 200 observable.
- Flux RSS de la CCI des Landes (`/feed/`) : 500, alors que le site et la page d'actualités répondent 200 ; source conservée sans flux local.
- Chambre d'agriculture des Landes et collectivités locales : secteurs `agriculture` / `collectivites`, hors du couple demandé.

## Méthode

Exa hors crédits (402). Les candidats ont été identifiés via les branches du dépôt (`origin/ext/dept-40-landes`, `origin/ext/src-energie-eau-40`), les annuaires et sites officiels consultés en HTTP direct, puis tous contrôlés par GET réel (redirections suivies, délai 25 s, User-Agent navigateur). Le JSON de vérification enregistre pour chaque URL le code HTTP, le type de contenu et le nombre d'items RSS.
