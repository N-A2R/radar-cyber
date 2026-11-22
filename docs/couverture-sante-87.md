# Sources d'information — secteur santé, département 87 (Haute-Vienne)

OBJECTIF : atteint — 10 / 5 sources vérifiées en HTTP 200 pour le couple secteur « santé » / département 87 (Haute-Vienne).

## Livrable

- `bench/corpus/sources-sante-87.jsonl` — 10 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-sante-87.json` — 35 contrôles (34 couples source/URL, 33 URL distinctes), 35 × HTTP 200 le 2026-11-22 (`curl -L` en GET, User-Agent navigateur, code final après redirections, type de contenu et détection des pages d'erreur « soft 404 »).
- `db/migrate-187-sources-sante-87.sql` — 10 sources `corpus:sante87-*` en `department='87'` et 34 traces `source_verification` en `ok200` (idempotent par `ON CONFLICT` et `WHERE NOT EXISTS`).
- Vérifié sur une base PostgreSQL éphémère : 10 sources `department='87'`, 34 traces `source_verification` (34 × `code_http=200`), puis 10/34 après rejeu de la migration (idempotent).
- `apps/api/test/importer-corpus.test.ts` : 4/4 vert avec cette base (aucune exclusion à ajouter, le test filtre déjà ses quatre identifiants).
- `bench/corpus/HASH` régénéré après ajout du corpus (empreinte `28d8ad50a369f4c7b1d720fc7b6e987ea2ddc3776731d38d0142a10f94ce0bab`).

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | CHU de Limoges | CHU | `/actualites/` | — |
| 2 | ARS Nouvelle-Aquitaine | agence régionale de santé | `/liste-actualites` | `/rss.xml` |
| 3 | Conseil départemental de l'Ordre des médecins de la Haute-Vienne | ordre professionnel (87) | `/actualites` | — |
| 4 | CPTS Limoges | CPTS (Limoges, Isle, Condat-sur-Vienne) | `/actualites/` | `/feed/` |
| 5 | CPTS Monts & Barrages | CPTS (35 communes du sud-est 87) | `/actualites/` | `/feed/` |
| 6 | France 3 Nouvelle-Aquitaine — Haute-Vienne | presse locale | `/nouvelle-aquitaine/haute-vienne/` | `/rss` |
| 7 | Santé publique France — Nouvelle-Aquitaine | agence de santé publique | `/les-actualites` | `/rss/969` |
| 8 | CPAM de la Haute-Vienne | caisse primaire d'assurance maladie (87) | `/haute-vienne/assure/actualites` | — |
| 9 | ESEA Nouvelle-Aquitaine | GIP e-santé | `/actualites` | — |
| 10 | FHF Nouvelle-Aquitaine | fédération hospitalière | `/nos-actualites` | — |

Cinq sources sont explicitement locales ou départementales (CHU 87, CDOM 87, CPTS Limoges, CPTS Monts & Barrages, CPAM 87, France 3 Haute-Vienne) ; les autres couvrent la Haute-Vienne dans le cadre de leur mission régionale (ARS, Santé publique France, ESEA, FHF).

## Preuve

Recherche menée le 2026-11-22 avec Exa (sites officiels, annuaires d'établissements, presse locale, fédérations) puis contrôle réel de chaque URL par `curl -L` en GET : statut HTTP final, type de contenu, et recherche des marqueurs de page d'erreur pour les réponses HTML. Les 35 contrôles répondent 200, sans soft-404. Le relevé complet est dans `bench/results/verification-sources-sante-87.json`.

## Exemples cyber

- CPTS Limoges publie directement « Cybersécurité : et si votre cabinet était le prochain ? », compte rendu d'une soirée avec le GIP ESEA sur la messagerie sécurisée, le DMP et les mots de passe : `https://cpts-limoges.fr/cybersecurite-et-si-votre-cabinet-etait-le-prochain/`.
- Le CHU de Limoges consacre son Chorus n°56 au Cybermois et à l'exercice REMPAR25 de crise cyber systémique (18/09/2025) : `https://www.chu-limoges.fr/app/uploads/1/2025/12/chorus_no_56_light.pdf`.
- La CPAM de la Haute-Vienne documente les fraudes numériques (phishing, usurpation d'identité, faux e-mails) dans son bilan 2024 : `https://www.assurance-maladie.ameli.fr/sites/default/files/2025-05-20-dp-Bilan_fraudes_CPAM87.pdf`.
- France 3 Haute-Vienne relate la protection des hôpitaux contre les pirates informatiques, exemple de la polyclinique de Limoges (23/01/2023) : `https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/video-limoges-comment-les-hopitaux-se-protegent-contre-les-pirates-informatiques-2699598.html`.
- L'ARS Nouvelle-Aquitaine publie un incident de sécurité sur la plateforme des autorisations parentales (12/08/2026) ; ESEA publie « Face aux risques cyber, tous vigilants ! ». Ces deux exemples couvrent le périmètre régional.

## Candidats écartés

- `https://www.chu-limoges.fr/rss.xml` : HTTP 404 ; le CHU n'expose pas de flux RSS public, la page `/actualites/` est retenue.
- `https://www.populaire-du-centre.fr/` : DNS sans réponse ; la presse locale est couverte par France 3 Haute-Vienne.
- `https://www.santepubliquefrance.fr/regions-et-territoires/nouvelle-aquitaine/actualites` : HTTP 404 ; la page régionale et `/les-actualites` sont retenues.
- `https://www.ameli.fr/haute-vienne/assure/actualites/attention-aux-faux-emails-et-sms` : HTTP 404 ; le bilan fraudes de la CPAM 87 est retenu comme exemple cyber.

Prévol : aucune PR ni branche distante pour le couple (santé, 87) — `gh pr list --state all --search 'santé Haute-Vienne'`, `--search 'sante-87'` et `--head ext/src-sante-87` sans résultat ; `git log --all --grep=sante-87` vide. Base utilisée : worktree `ext/src-sante-87` créé depuis `origin/main`, sans écrasement ni reset.

OBJECTIF : atteint — 10 / 5
