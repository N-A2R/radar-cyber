# Sources d'information — secteur santé, département 79 (Deux-Sèvres)

OBJECTIF : atteint — 12 / 5 sources vérifiées en HTTP 200 pour le couple secteur « santé » / département 79 (Deux-Sèvres).

## Livrable

- `bench/corpus/sources-sante-79.jsonl` — 12 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-sante-79.json` — 48 contrôles (42 couples source/URL uniques, 31 URL distinctes), 48 × HTTP 200 le 2026-11-22 (`curl -L` en GET, User-Agent navigateur, code final après redirections, type de contenu et détection des pages d'erreur « soft 404 »).
- `db/migrate-180-sources-sante-79.sql` — 12 sources `corpus:sante79-*` en `department='79'` et 42 traces `source_verification` en `ok200`. Vérifié sur une base PostgreSQL éphémère : 12 sources, 42 traces (42 × code_http 200), 12/42 après rejeu de la migration (idempotent).
- `apps/api/test/importer-corpus.test.ts` — exclusion du préfixe `corpus:sante79-%` ajoutée ; test ciblé 4/4 vert.
- `bench/corpus/HASH` régénéré après ajout du corpus.

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | Centre hospitalier de Niort | hôpital public (79) | `/actualites/` | `/rss.xml` |
| 2 | ARS Nouvelle-Aquitaine — périmètre 79 | agence régionale | `/liste-actualites?archive=0` | `/rss.xml?type=ars_actualite` |
| 3 | CPAM des Deux-Sèvres | assurance maladie (79) | `/deux-sevres/assure/liste-actualites-locales` | page actualités (HTML) |
| 4 | CDOM des Deux-Sèvres | ordre professionnel (79) | `/actualites` | `/rss` |
| 5 | FHF Nouvelle-Aquitaine | fédération hospitalière | `/actualites/` | `/feed/` |
| 6 | France Assos Santé Nouvelle-Aquitaine | association d'usagers | `/actualites/` | `/feed/` |
| 7 | URPS Médecins Libéraux Nouvelle-Aquitaine | union professionnelle | accueil du site | `/feed/` |
| 8 | actu.fr — Deux-Sèvres | presse locale (79) | `/nouvelle-aquitaine/deux-sevres_79/` | `/rss.xml` |
| 9 | ICI Poitou — Deux-Sèvres | radio locale (79) | `/nouvelle-aquitaine/deux-sevres-79` | `/rss/poitou/rubrique/infos.xml` |
| 10 | La Nouvelle République — Deux-Sèvres Santé | presse locale (79) | `/deux-sevres/sante` | page actualités (HTML) |
| 11 | Centre hospitalier Nord Deux-Sèvres | hôpital public (79) | `/Actualites/1/14` | page actualités (HTML) |
| 12 | Santé publique France — Nouvelle-Aquitaine | agence sanitaire publique | `/les-actualites` | `/rss.xml` |

Six sources sont explicitement départementales ou locales (CH de Niort, CH Nord Deux-Sèvres, CPAM 79, CDOM 79, presse 79, ICI Poitou 79) ; six sont des organismes régionaux ou nationaux dont la mission couvre les Deux-Sèvres (ARS, FHF, France Assos Santé, URPS, Santé publique France, presse régionale).

## Exemple cyber observé

Un EHPAD de Champdeniers (Deux-Sèvres) a été victime d'une cyberattaque avec demande de rançon, relatée par ICI Poitou — `https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797` (200). Cet article est joint à chaque ligne du corpus comme exemple cyber du secteur 79. La fuite de données de la Fédération Hospitalière de France (plus de 30 000 professionnels de santé) constitue un second exemple sectoriel vérifié 200.

## Méthode et exclusions

Recherche menée le 2026-11-22 : sites officiels, annuaires d'établissements, Google Actualités RSS, moteurs web et liens internes des sites (API Exa hors crédits, HTTP 402). Chaque URL retenue a été contrôlée par `curl -L` en GET ; les URL renvoyant une page d'erreur avec statut 200 (CloudFront « 403 ERROR ») ont été écartées, notamment les faux flux RSS de `lanouvellerepublique.fr`. Quand aucun flux RSS n'existe, la page d'actualités vérifiée 200 est déclarée comme `url_flux` et la source est enregistrée au format `html`.

Écartés après vérification : `ch-bressuire.fr`, `ch-saint-maixent.fr`, `ch-thouars.fr`, `cci-deux-sevres.fr`, `cma-deux-sevres.fr` (connexion impossible) ; `ouest-france.fr` (403) ; `ici.fr/rss/poitou-charentes/rubrique/infos.xml` et `ici.fr/rss/deux-sevres-79/rubrique/infos.xml` (404) ; `nouvelle-aquitaine.ars.sante.fr/actualites` (403) ; faux flux RSS de `lanouvellerepublique.fr` (page d'erreur 200) ; `conseil79.ordre.medecin.fr/actualites/feed` (404), le flux actif étant `/rss`.

Prévol : aucune PR ni branche distante pour le couple (santé, 79). Les PR #554 à #561 livrent d'autres secteurs des Deux-Sèvres (banque-assurance, agriculture, bâtiment, collectivités, énergie-eau, enseignement, commerce), sans chevauchement avec la santé. Base utilisée : `origin/main` (worktree `ext/src-sante-79`).
