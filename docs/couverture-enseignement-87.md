# Couverture — sources « enseignement » de la Haute-Vienne (87)

12 sources vérifiées en HTTP 200 le 2026-11-22 (31 contrôles, 28 URL uniques, 7 flux RSS déclarés).

| Source | Type | Site | Actualités / flux |
| --- | --- | --- | --- |
| Université de Limoges | université (enseignement supérieur) | https://www.unilim.fr/ | https://www.unilim.fr/category/actualites/ — flux https://www.unilim.fr/feed/ (20 items) |
| IAE Limoges — École universitaire de management | école de management | https://www.iae.unilim.fr/ | https://www.iae.unilim.fr/actualites/ — flux https://www.iae.unilim.fr/feed/ (10 items) |
| Direction de la Formation Continue et de l'Apprentissage | service universitaire de formation continue | https://www.unilim.fr/dfca/ | https://www.unilim.fr/dfca/ — flux https://www.unilim.fr/dfca/feed/ (8 items) |
| CROUS de Limoges | établissement public de la vie étudiante | https://www.crous-limoges.fr/ | https://www.crous-limoges.fr/actualites/ — flux https://www.crous-limoges.fr/feed/ (10 items) |
| Lycée Turgot (Limoges) | lycée professionnel — BTS cybersécurité | https://www.lyc-turgot.ac-limoges.fr/ | https://www.lyc-turgot.ac-limoges.fr/?post_type=post — flux https://www.lyc-turgot.ac-limoges.fr/feed/ (0 item au relevé) |
| SNES-FSU Limoges | syndicat enseignant | https://www.limoges.snes.edu/ | https://www.limoges.snes.edu/spip.php?rubrique2 — flux https://www.limoges.snes.edu/spip.php?page=backend (10 items) |
| FCPE Haute-Vienne | fédération de parents d'élèves | https://87.fcpe.asso.fr/ | https://87.fcpe.asso.fr/actualites (aucun flux RSS exploitable) |
| GRETA du Limousin | organisme de formation continue | https://www.greta-du-limousin.fr/ | https://www.greta-du-limousin.fr/actualites/ (flux /feed/ en HTTP 500) |
| Annuaire de l'enseignement — Haute-Vienne | annuaire professionnel | https://annuaire-education.fr/departement/haute-vienne/087.html | la page d'annuaire est aussi la page d'actualités ; pas de flux |
| Le Populaire du Centre — Éducation | presse locale | https://www.lepopulaire.fr/ | https://www.lepopulaire.fr/actualites/education (flux RSS non public) |
| ICI Limousin — Haute-Vienne | média local (Radio France) | https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87 | même page — flux https://www.ici.fr/rss/limousin/a-la-une.xml (40 items) |
| CMA Nouvelle-Aquitaine — Haute-Vienne | chambre consulaire — formation et apprentissage | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-haute-vienne | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/evenements/rendez-vous-artisanat-haute-vienne |

## Preuve

- Corpus : `bench/corpus/sources-enseignement-87.jsonl` (champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Relevé HTTP : `bench/results/verification-sources-enseignement-87.json` — 31 contrôles, 28 URL uniques, tous en code 200, avec types de contenu, URL finales et nombres d'items RSS.
- Méthode : GET réel avec redirections suivies et User-Agent navigateur, délai 25 s, relevé effectué le 2026-11-22.
- Migration : `db/migrate-162-sources-enseignement-87.sql` — 12 lignes `source` et 28 traces `source_verification` en `ok200`, vérifié en base locale (`schema_migrations` contient la migration ; 12 sources `corpus:enseignement-87-%` pour le département 87, 28/28 vérifications en code 200).
- Exemples cyber vérifiés en HTTP 200 :
  - « VIDÉO. Des étudiants formés aux métiers de la cybersécurité à l'Université de Limoges » — 2023-04-24 — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/video-des-etudiants-formes-aux-metiers-de-la-cybersecurite-a-l-universite-de-limoges-2749054.html
  - « BTS Cybersécurité, Informatique et réseaux, ELectronique (CIEL) » — https://www.lyc-turgot.ac-limoges.fr/les-formations/bts-systemes-numeriques-informatique-et-reseaux/
  - « Enquête Éducation nationale sur la connaissance de la cyber auprès des élèves du CM1 à la 6e » — 2025-09-29 — https://www.cybermalveillance.gouv.fr/tous-nos-contenus/actualites/cp-enquete-cybersecurite-education-nationale-2025

## Candidats écartés

- https://www.ac-limoges.fr/ (rectorat et DSDEN 87) : HTTP 403 anti-bot ; le site SPIP du SNES-FSU Limoges et l'annuaire de l'enseignement couvrent le même secteur en HTTP 200 observable.
- https://enseignementcatho-limousin.fr/actualites/ (DDEC 87 — enseignement catholique du Limousin) : HTTP 403 anti-bot, y compris pour le flux.
- https://www.limoges.cci.fr/ et ses pages formation/actualités : HTTP 403 anti-bot ; la CMA Nouvelle-Aquitaine — Haute-Vienne est retenue comme chambre consulaire observable en 200.
- https://www.greta-du-limousin.fr/feed/ : HTTP 500 ; `url_flux` laissée vide pour le GRETA.
- https://87.fcpe.asso.fr/index.php?format=feed&type=rss : HTTP 200 mais corps HTML sans item ; `url_flux` laissée vide pour la FCPE 87.
- https://www.lepopulaire.fr/rss.xml, /rss/, /rss/limoges.xml : HTTP 404 ; `url_flux` laissée vide pour Le Populaire du Centre.
- https://www.unilim.fr/tous-les-articles/ et /?post_type=post : HTTP 500 ; l'archive `/category/actualites/` est retenue.
- https://www.lyc-turgot.ac-limoges.fr/feed/ : HTTP 200 sans item au relevé ; flux déclaré conservé comme point de sortie officiel.

Limite de périmètre : le GRETA du Limousin, l'enseignement catholique limousin et la CMA Nouvelle-Aquitaine sont des structures régionales, mais disposent d'une agence ou d'une page dédiée à la Haute-Vienne ; les universités, le CROUS, le lycée Turgot, le SNES Limoges, la FCPE 87 et la presse locale sont strictement ancrés dans le département 87.

OBJECTIF : atteint — 12 sources vérifiées en HTTP 200 / 5 sources vérifiées en HTTP 200 pour le couple secteur « enseignement » / département 87 (Haute-Vienne).
