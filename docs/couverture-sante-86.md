# Sources d'information — secteur santé — Vienne (86)

OBJECTIF : atteint — 20 / 5 sources vérifiées en HTTP 200 pour le couple secteur « santé » / département 86 (Vienne).

## Livrable

- `bench/corpus/sources-sante-86.jsonl` — 20 sources au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-sante-86.json` — relevé des 61 URL contrôlées le 2026-11-22, toutes en HTTP 200.
- `db/migrate-192-sources-sante-86.sql` — insertion idempotente de 20 lignes dans `source` (`region = 'Nouvelle-Aquitaine'`, `department = '86'`) et de 71 traces `ok200` dans `source_verification`.

## Sources retenues

| # | Organisation | Type | Page d'actualités | Flux |
|---|---|---|---|---|
| 1 | ARS Nouvelle-Aquitaine — délégation de la Vienne | agence régionale de santé | `/liste-actualites?archive=0` | `/rss.xml?type=ars_actualite` |
| 2 | CPAM de la Vienne | caisse d'assurance maladie | `/vienne/assure/liste-actualites-locales` | — |
| 3 | MSA Poitou (Vienne — Deux-Sèvres) | mutualité sociale agricole | `/lfp/en-direct` | — |
| 4 | CHU de Poitiers | centre hospitalier universitaire | `/toutes-les-actualites/` | `/feed/` |
| 5 | Centre hospitalier de Châtellerault | centre hospitalier | `/toutes-les-actualites/` (CHU) | `/feed/` |
| 6 | Centre hospitalier de Loudun | centre hospitalier | `/toutes-les-actualites/` (CHU) | `/feed/` |
| 7 | Département de la Vienne — Santé | conseil départemental | `/fil-infos/actualites` | — |
| 8 | CPTS du Pays Loudunais | communauté professionnelle territoriale de santé | `/actualites` | — |
| 9 | DAC 86 | réseau de coordination | `/actualites` | — |
| 10 | Ordre des médecins de la Vienne | ordre professionnel | `/actualites/` | — |
| 11 | ESEA Nouvelle-Aquitaine | groupement régional e-santé | `/actualites` | — |
| 12 | URPS Médecins Libéraux NA | union professionnelle | `/etre-medecin-liberal/` | `/feed/` |
| 13 | URPS Pharmaciens NA | union professionnelle | `/actualites/` | `/feed/` |
| 14 | URPS Infirmiers Libéraux NA | union professionnelle | `/actualites/` | `/feed/` |
| 15 | Mutualité Française NA | union de mutuelles | `/actualites/` | `/feed/` |
| 16 | Ordre des pharmaciens NA | ordre professionnel | `/les-communications/focus-sur/les-actualites` | — |
| 17 | Polyclinique de Poitiers (ELSAN) | clinique privée | `/fr/nos-actualites` | — |
| 18 | La Nouvelle République — Vienne | presse locale | `/vienne/sante` | API RSS |
| 19 | ICI Poitou (Radio France) | radio locale publique | `/nouvelle-aquitaine/infos/sante-sciences` | `/rss/poitou/a-la-une.xml` |
| 20 | Le7.info — Santé | presse locale | `/tag/16-sante` | `/rss.xml` |

## Méthode

Découverte par recherche web (annuaires professionnels, chambres et fédérations, ordres, presse locale), puis vérification de **chaque** URL par `curl -L` avec User-Agent navigateur et délai maximal de 20 s : code final, type de contenu et URL effective. 61 URL distinctes testées, 61 en HTTP 200. Les candidats dont l'URL ne répondait pas ont été écartés : `vienne.gouv.fr` (connexion réinitialisée), `ch-chatellerault.fr` et `ch-loudun.fr` (indisponibles — remplacés par les pages dédiées du CHU de Poitiers), `vie-economique.com/categories/vienne` (404), `ici.fr/nouvelle-aquitaine/poitou` (404), `lanouvellerepublique.fr/rss/poitiers.xml` (page HTML, pas un flux — remplacé par l'API RSS de l'édition Vienne).

Les exemples cyber sont des articles ou pages de sécurité des systèmes d'information de santé accessibles en HTTP 200, dont un retour d'expérience local (`le7.info` : rançongiciel au Conseil départemental de la Vienne) et un article sur la cybersécurité du CHU de Poitiers (La Nouvelle République).

## Prévol

Aucune PR ni commit antérieur pour le couple santé / Vienne (86) : `gh pr list --state all --search 'sante vienne 86'` et `git log --all` sans résultat sur ce sujet. Base utilisée : `origin/main` dans le worktree `ext/src-sante-86`, sans reset ni modification d'une branche existante.
