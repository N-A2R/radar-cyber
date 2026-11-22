# Sources du secteur « commerce » — Deux-Sèvres (79)

## Résultat

OBJECTIF : atteint — 20 / 5

**20 sources vérifiées en HTTP 200** pour le couple secteur `commerce` / département `79` (cible : au moins 5 sources vérifiées en 200).

- Corpus : `bench/corpus/sources-commerce-79.jsonl` (20 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-sources-commerce-79.json` — 58 URL contrôlées le 2026-11-22, 58 en 200 : 54 URL de sources (dont 13 flux RSS avec items) et 4 articles cyber.
- Intégration : `db/migrate-161-sources-commerce-79.sql` — 20 sources (`corpus:commerce-79-*`) et 54 traces dans `source_verification` en `ok200` / HTTP 200 (base locale PostgreSQL embarquée, migration appliquée et vérifiée).
- Empreinte corpus `bench/corpus/HASH` : `63d795ad2a16ac5f7423e9010a89cf5b4256af17edca12a8b1f011fe0306f37d`.

## Organisations retenues

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CMA Nouvelle-Aquitaine (couvre le 79) | chambre consulaire (métiers et artisanat) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| CPME 79 | organisation patronale PME-TPE | https://www.cpme79.fr/Actualites | https://www.cpme79.fr/spip.php?page=backend (10 items) |
| MEDEF Deux-Sèvres | organisation patronale départementale | https://www.medef79.fr/actualites | — |
| U2P — entreprises de proximité | fédération artisanat/commerce | https://u2p-france.fr/search | https://u2p-france.fr/rss.xml |
| Deuxsevres.fr | annuaire professionnel et revue de presse | https://www.deuxsevres.fr/nav-newsactus | — |
| Ville de Niort — centre-ville commerçant | institutionnel (service commerce) | https://www.vivre-a-niort.com/actualites/index.html | https://www.vivre-a-niort.com/news.xml (30 items) |
| Niort Agglo — filière commerce | institutionnel (développement économique) | https://www.niortagglo.fr/lagglo/toutes-les-actualites/index.html | https://www.niortagglo.fr/rss.xml (30 items) |
| Agglo 2B — Bocage Bressuirais | institutionnel (développement économique) | https://www.agglo2b.fr/actus | https://www.agglo2b.fr/?format=feed&type=rss |
| CC Parthenay-Gâtine | institutionnel (information économique) | https://www.cc-parthenay-gatine.fr/actualites | https://www.cc-parthenay-gatine.fr/actualites/rss (284 items) |
| MDEE Parthenay et Gâtine | réseau d'accompagnement TPE-PME | https://www.mdee-parthenaygatine.fr/actualites/ | https://www.mdee-parthenaygatine.fr/feed/ (10 items) |
| Niort Marais Poitevin Tourisme — espace pro | office de tourisme (commerçants, restaurateurs) | https://www.niortmaraispoitevin.com/espace-pro/actualites-infos-metiers/ | — |
| Niort info — Commerce local | presse locale | https://niortinfo.media/category/commerce-local/ | https://niortinfo.media/category/commerce-local/feed/ (10 items) |
| La Nouvelle République — Deux-Sèvres | presse quotidienne régionale | https://www.lanouvellerepublique.fr/deux-sevres/economie | https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594 (40 items) |
| La Nouvelle République — Niort | presse quotidienne régionale | https://www.lanouvellerepublique.fr/niort/economie | https://www.lanouvellerepublique.fr/api/v1/rss/6705263824a8a983658b456c (40 items) |
| actu.fr — Deux-Sèvres | presse locale numérique | https://actu.fr/pays-de-la-loire/deux-sevres_79/ | https://actu.fr/rss.xml (30 items) |
| actu.fr — Niort | presse locale numérique | https://actu.fr/nouvelle-aquitaine/niort_79191 | https://actu.fr/rss.xml |
| ICI Poitou (Radio France) | radio publique locale | https://www.ici.fr/radio/poitou | https://www.ici.fr/rss/poitou/rubrique/infos.xml (20 items) |
| Radio Gâtine | radio associative locale | https://radiogatine.fr/news/ | https://radiogatine.fr/rss-feed-1 (15 items) |
| RCF Poitou Deux-Sèvres | radio locale | https://www.rcf.fr/poitou-deuxsevres | — |
| InfoRadar — fil Deux-Sèvres | média d'information locale | https://inforadar.fr/tag/deux-sevres | — |

## Exemples cyber associés

- « Cyber arnaque en cours dans les Deux-Sèvres » (25/05/2023) — https://niortinfo.media/cyber-arnaque-amende-contravention-cours-dans-les-deux-sevres/ (200)
- « La SMACL met les cyberattaques au centre des débats » — https://niortinfo.media/la-smacl-met-les-cyberattaques-au-centre-des-debats/ (200)
- « Cybersécurité : les TPE-PME progressent mais doivent encore renforcer leur maturité » (CPME 79, 21/10/2025) — https://www.cpme79.fr/Cybersecurite-les-TPE-PME-progressent-mais-doivent-encore-renforcer-leur (200)
- « Cybersécurité : l'U2P plaide pour un accompagnement adapté aux réalités des TPE » (30/10/2026) — https://u2p-france.fr/articles/cybersecurite-l-u2-p-plaide-pour-un-accompagnement-adapte-aux-realites-des-tpe (200)
- « Cyberattaque d'ampleur nationale : des supermarchés des Deux-Sèvres contraints de jeter des produits frais et surgelés » (La Nouvelle République, 12/10/2026, titre relevé dans Google Actualités ; URL directe non vérifiée en 200).

## Candidats écartés

- CCI Deux-Sèvres — `https://www.deux-sevres.cci.fr/` et `https://www.cci79.com/` : 403 Cloudflare sous User-Agent navigateur ; non retenue faute de 200 observable.
- Le Courrier de l'Ouest — `https://www.courrierdelouest.fr/` : 403 anti-bot.
- niort.maville.com (édition Deux-Sèvres du Courrier de l'Ouest) : 200 puis 403 de façon instable selon les requêtes ; non retenue.
- `https://actu.fr/pays-de-la-loire/deux-sevres_79/rss.xml` : 404 ; le flux global `https://actu.fr/rss.xml` (200) est retenu.
- `https://www.ouest-france.fr/nouvelle-aquitaine/deux-sevres-79/` : 404 ; `https://www.cci.fr/` : 403 Cloudflare.

Limite de périmètre : les organisations strictement départementales (CPME 79, MEDEF 79, MDEE, Agglo 2B, communautés de communes, presse et radios locales) côtoient des réseaux régionaux ou nationaux (CMA Nouvelle-Aquitaine, U2P, actu.fr, La Nouvelle République) dont la couverture explicite des Deux-Sèvres est vérifiée sur les pages retenues.

## Méthode

Exa indisponible (crédits épuisés, HTTP 402) : découverte par Google Actualités RSS, lecture directe des sites officiels, annuaires et corpus du dépôt, avec cinq angles complémentaires (chambres consulaires et organisations patronales, annuaires professionnels, collectivités, presse locale, radios locales). Chaque URL a ensuite été contrôlée par GET réel avec redirections suivies, User-Agent navigateur et délai de 18 s (Node fetch) ; le JSON de preuve enregistre code HTTP, type de contenu, URL finale et nombre d'items RSS.
