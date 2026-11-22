# Sources d'information — secteur santé — Gironde (33)

OBJECTIF : atteint — 18 / 5 sources vérifiées en HTTP 200 pour le couple secteur « santé » / département 33 (Gironde).

## Livrable

- `bench/corpus/sources-sante-33.jsonl` — 18 sources au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `db/migrate-120-sources-sante-33.sql` — insertion idempotente de 18 lignes dans `source` et de 59 traces dans `source_verification` (`ok200`, `department = '33'`).
- `bench/results/verification-sources-sante-33.json` — relevé des 59 URL contrôlées le 2026-11-22.

Contrôle en base après application : `sources=18`, `verifications=59`, `http200=59`.

## Sources retenues

| # | Organisation | Type | Page d'actualités | Flux |
|---|---|---|---|---|
| 1 | CHU de Bordeaux | CHU | `/Espace-media/Actualites/` | — |
| 2 | SAMU 33 — Centre 15 | SAMU | service SAMU-SMUR / Actualités | — |
| 3 | CPAM de la Gironde | CPAM | `/gironde/assure/actualites` | — |
| 4 | MSA Gironde | caisse agricole | `/lfp/actualites-particulier` | — |
| 5 | CH de Libourne | hôpital public | `/actualites/` | — |
| 6 | CH d'Arcachon | hôpital public | `/actualites/` | — |
| 7 | CH Charles Perrens | hôpital psychiatrique | `/actualites` | RSS |
| 8 | Clinique Saint-Augustin (Elsan) | clinique privée | Elsan / nos-actualites | — |
| 9 | ARS Nouvelle-Aquitaine | ARS | `/liste-actualites?archive=0` | RSS |
| 10 | FHF Nouvelle-Aquitaine | fédération hospitalière | `/nos-actualites` | — |
| 11 | EFS Nouvelle-Aquitaine | transfusion | presse EFS Nouvelle-Aquitaine | — |
| 12 | ESEA Nouvelle-Aquitaine | GRADeS e-santé | `/actualites` | — |
| 13 | Santé publique France NA | santé publique | `/regions/nouvelle-aquitaine/actualites` | RSS |
| 14 | Carsat Aquitaine | caisse de retraite | `/home/actif/actualites-actif.html` | — |
| 15 | Conseil de l'Ordre des médecins de Gironde | ordre professionnel | `/actualites/` | — |
| 16 | Institut Bergonié | centre de lutte contre le cancer | `/category/les-actualites/` | RSS |
| 17 | France Assos Santé Nouvelle-Aquitaine | association de patients | `/actualites/` | — |
| 18 | Vivalto Santé — Polyclinique Bordeaux-Nord | groupe hospitalier privé | `/un-groupe-engage/actualites` | RSS |

Onze sources sont explicitement girondines (CHU, SAMU 33, CPAM 33, MSA 33, CH Libourne, CH Arcachon, CH Perrens, clinique Saint-Augustin, Ordre 33, Bergonié, Polyclinique Bordeaux-Nord) ; sept sont des organismes régionaux ou nationaux dont la mission couvre la Gironde (ARS, FHF, EFS, ESEA, Santé publique France, Carsat, France Assos Santé).

## Exemples cyber observés

- CHU de Bordeaux : « Une vingtaine de cyber-attaques contre le CHU de Bordeaux chaque jour » (France 3 Nouvelle-Aquitaine, 2021-02-17).
- SAMU 33 : « FIN DE L'INCIDENT : le numéro d'urgence 15 est à nouveau joignable ! » (CHU de Bordeaux, 2025-09-09).
- Clinique Saint-Augustin / Elsan : cyberattaque du groupe, une centaine de patients bordelais alertés (Sud Ouest, 2023-08-22). Exemple également repris pour les CH sans fait cyber propre.
- CPAM de la Gironde : bilan 2025 de la lutte contre les fraudes (2026-04-30) ; MSA Gironde : « Fraude sur internet ou par téléphone » (2026-05-05) ; Carsat Aquitaine : « Courriels, SMS, sites et appels frauduleux » (2026-03-30).
- ARS Nouvelle-Aquitaine : incident de sécurité de la plateforme des autorisations parentales (2026-08-12) ; EFS : incident de cybersécurité chez un prestataire frigorifique (2026-11-03) ; ESEA : « Face aux risques cyber : tous vigilants ! » (2026-01-09).
- Ordre des médecins : « Tentatives d'hameçonnage » (exemple national, 2026-07-27) ; France Assos Santé NA : « # CYBER ATTAQUES » (2024-02-21) ; Vivalto Santé : « Alerte fraude ».

Les sources sans fait cyber propre vérifié portent une mention explicite dans `exemple_cyber` et renvoient à un fait départemental documenté.

## Méthode et exclusions

Recherche web menée sur annuaires et sites officiels, pages d'actualités et flux consultés en HTTP, complétée par Google News RSS pour les exemples d'incidents locaux (service Exa indisponible, quota 402 ; Bing trop bruité). Chaque URL a été contrôlée le 2026-11-22 avec `curl -L` et un user-agent navigateur ; Sud Ouest renvoie une redirection anti-bot 307 sans cookies et 200 avec un cookie jar, ce qui a été pris en compte.

Exclusions après contrôle : `www.ch-langon.fr`, `ch-langon.fr`, `www.ch-blaye.fr` et `www.urps-na.fr` (aucune réponse) ; `www.bergonié.fr` (IDN, 000) remplacé par `bergonie.fr` ; `www.efs.sante.fr/lefs-en-nouvelle-aquitaine` (000) remplacé par `www.efs.sante.fr` ; flux introuvables en 404 (`ch-libourne.fr/actualites/feed/`, `ch-arcachon.fr/rss.xml`, `conseil33.ordre.medecin.fr/actualites/les-bonnes-pratiques-de-cybersecurite`, `chu-bordeaux.fr/rss.xml`) — ces sources sont conservées en HTML.

## Prévol

Aucune PR ni branche distante n'existait pour le couple (santé, 33). Les PR sœures #461 (16), #490 (17), #492 (23), #493 (19) et #394 (Nouvelle-Aquitaine) couvrent d'autres périmètres. Base utilisée : `ext/src-sante-33` au même commit qu'`origin/main` (0 commit d'écart), conformément au worktree fourni. Aucun reset ni départ de `origin/main` n'a été effectué au-delà de cette base.
