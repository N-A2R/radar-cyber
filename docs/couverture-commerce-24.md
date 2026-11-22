# Sources du secteur « commerce » — Dordogne (24)

## Résultat

OBJECTIF : atteint — 11 / 5

**11 sources vérifiées en HTTP 200** pour le couple secteur `commerce` / département `24` (cible : au moins 5 sources vérifiées en 200).

- Corpus : `bench/corpus/sources-commerce-24.jsonl` (11 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-commerce-24.json` — 43 URLs contrôlées le 2026-11-22, 43 en 200 (sites, pages d'actualités, flux et articles cyber).
- Intégration : `db/migrate-091-sources-commerce-24.sql` — 11 lignes dans `source` (`corpus:commerce-24-*`) et 41 traces uniques dans `source_verification` en `ok200` / HTTP 200. Migration appliquée et vérifiée sur le PostgreSQL local : 11 sources et 41 traces présentes.
- 10 flux RSS exploitables sur les 11 sources : CCI Dordogne, Périgord Commerce, Le Journal des Entreprises (Nouvelle-Aquitaine), Dordogne Libre, Sud Ouest Dordogne, Sud Ouest Bergerac, ICI Périgord, Réussir le Périgord, Mon-Entreprise-Info, Ville de Bergerac. Societe.Tech n'expose plus de flux (410).

## Organisations retenues

| Organisation | Type | Page actualités |
|---|---|---|
| CCI Dordogne — actualités et entreprises | chambre consulaire (commerce et industrie) | https://dordogne.cci.fr/actualites/ |
| Périgord Commerce — commerçants et artisans de Dordogne | annuaire professionnel et fédération des commerçants et artisans | https://accueil.perigord-commerce.com/ |
| Le Journal des Entreprises — Dordogne | presse économique régionale | https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/dordogne |
| Dordogne Libre — rubrique économie | presse locale (économie et entreprises) | https://www.dordognelibre.fr/economie/archives/ |
| Sud Ouest — Dordogne | presse locale quotidienne | https://www.sudouest.fr/dordogne/archives/ |
| Sud Ouest — Bergerac | presse locale quotidienne (édition Bergerac) | https://www.sudouest.fr/dordogne/bergerac/ |
| ICI Périgord — Dordogne (Radio France) | radio locale (actualités économiques) | https://www.ici.fr/nouvelle-aquitaine/dordogne-24/actu |
| Réussir le Périgord | presse locale hebdomadaire (économie et entreprises) | https://www.reussirleperigord.fr/ |
| Mon-Entreprise-Info — actualités Dordogne | annuaire et actualités des entreprises | https://mon-entreprise-info.com/actualites/dordogne/ |
| Societe.Tech — entreprises Dordogne | presse spécialisée entreprises et technologies | https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-dordogne/ |
| Ville de Bergerac — commerces et associations | collectivité (annuaire et actualités des commerces) | https://www.bergerac.fr/coeur-de-ville/commerces-associations/ |

## Exemples cyber associés

Les exemples sont tirés de `bench/corpus/incidents-dordogne.jsonl` et rattachés aux sources pertinentes ; chaque URL d'article a été contrôlée en HTTP 200 :

- **Cyberattaque dans des supermarchés** (Intermarché de Hautefort, Tocane-Saint-Apre, Port-Sainte-Foy-et-Ponchapt, Trélissac et Saint-Médard-de-Mussidan) : cible commerciale directe, rattachement aux sources consulaires, de presse et d'annuaire.
- **Faux site de vente de bois de chauffage** usurpant l'identité de la SARL Bellevert du Fleix : commerce en ligne local, rattachement à Périgord Commerce, Sud Ouest Bergerac et Mon-Entreprise-Info.
- **QR codes d'horodateurs Q-Park piratés à Bergerac** : activité commerciale municipale, rattachement à la Ville de Bergerac.
- **Radio Liberté FM à Ribérac victime d'un piratage** : entreprise locale, rattachement à Dordogne Libre.
- **Péribus (Grand Périgueux) alerte contre une arnaque** : rattachement à ICI Périgord et Réussir le Périgord.

## Candidats écartés

- **Les Echos — Dordogne** (`lesechos.fr/pme-regions/nouvelle-aquitaine/dordogne/`) : HTTP 403 constant, non intégré.
- **ViaOuest — actualité Dordogne** (`viaouest.com/actualite-dordogne.html`) : HTTP 429, non intégré.
- **Département de la Dordogne — annuaire des acteurs** (fiche « Fédération des associations de commerçants de Bergerac ») : HTTP 503, non intégré.
- **Societe.Tech — flux RSS** (`/feed/` et `/actualite-entreprises-nouvelle-aquitaine/feed/`) : HTTP 410 ; seule la page d'actualités a été intégrée.
- **CCI Dordogne — flux des commentaires** (`/actualites/feed/`) : 200 mais flux de commentaires vide ; remplacé par le flux principal `/feed/` (10 items).

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, fédérations, presse locale) via moteurs alternatifs, le service Exa étant hors crédits (402). Identification des pages d'actualités et des flux déclarés dans le HTML (`link rel=alternate`), puis contrôle GET réel de chaque URL avec User-Agent navigateur, suivi des redirections, relevé du code HTTP, du type de contenu et du nombre d'items RSS. Seules les sources dont toutes les URL ont répondu 200 ont été intégrées au corpus, à la preuve HTTP et à la base.
