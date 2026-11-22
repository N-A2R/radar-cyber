# Couverture — sources « enseignement » de la Vienne (86)

15 sources vérifiées en HTTP 200 le 2026-11-22 (42 contrôles, 42 URL uniques, 39 URL de sources, 10 flux RSS avec items).

| Source | Type | Site | Actualités / flux |
| --- | --- | --- | --- |
| DSDEN 86 — espace pédagogique | direction départementale de l'Éducation nationale | https://ww2.ac-poitiers.fr/dsden86-pedagogie/ | https://ww2.ac-poitiers.fr/dsden86-pedagogie/ — flux https://ww2.ac-poitiers.fr/dsden86-pedagogie/spip.php?page=backend |
| Université de Poitiers | université | https://www.univ-poitiers.fr/ | https://www.univ-poitiers.fr/c/actualites/ — flux https://www.univ-poitiers.fr/feed/ (10 items) |
| IUT de Poitiers | institut universitaire de technologie | https://iutp.univ-poitiers.fr/ | https://iutp.univ-poitiers.fr/c/actualites/ — flux https://iutp.univ-poitiers.fr/feed/ (10 items) |
| INSPÉ de l'académie de Poitiers | école supérieure du professorat et de l'éducation | https://inspe.univ-poitiers.fr/ | https://inspe.univ-poitiers.fr/c/actualites/ — flux https://inspe.univ-poitiers.fr/feed/ (10 items) |
| ISAE-ENSMA (Poitiers) | école d'ingénieurs | https://www.ensma.fr/ | https://www.ensma.fr/actualites/ — flux https://www.ensma.fr/actualites/feed/ (0 item au relevé) |
| Lycée professionnel Le Dolmen (Poitiers) | lycée professionnel public | https://www.lycee-dolmen.fr/ | https://www.lycee-dolmen.fr/category/actualites/ — flux https://www.lycee-dolmen.fr/feed/ (10 items) |
| Ensemble scolaire La Providence — La Salle (Poitiers) | établissement scolaire privé | https://www.laprovidence-poitiers.fr/ | https://www.laprovidence-poitiers.fr/l-etablissement/actualites |
| FCPE de la Vienne (86) | fédération de parents d'élèves | https://86.fcpe.asso.fr/ | https://86.fcpe.asso.fr/actualites |
| SNASUB-FSU — académie de Poitiers | syndicat de l'Éducation nationale | https://www.snasub-fsu-poitiers.com/ | https://www.snasub-fsu-poitiers.com/archive/2026-10/ — flux https://www.snasub-fsu-poitiers.com/rss (25 items) |
| Campus 120 — CCI Vienne | centre de formation / CFA | https://www.campus120.fr/ | https://www.campus120.fr/categorie/actualite/ — flux https://www.campus120.fr/categorie/actualite/feed/ (10 items) |
| Greta Poitou-Charentes — agence de Poitiers | formation continue | https://www.greta-poitou-charentes.fr/les-agences-du-greta/agence-de-poitiers/ | https://www.greta-poitou-charentes.fr/actualites/ — flux https://www.greta-poitou-charentes.fr/feed/ (1 item) |
| CFA académique de Poitiers | centre de formation d'apprentis | https://www.cfa-acad-poitiers.fr/ | https://www.cfa-acad-poitiers.fr/actualites/ — flux https://www.cfa-acad-poitiers.fr/rss.xml (4 items) |
| Enseignement catholique du Poitou et Charentes | fédération de l'enseignement catholique | https://ec-poitou-charentes.fr/ | https://ec-poitou-charentes.fr/?post_type=post — flux https://ec-poitou-charentes.fr/feed/ (4 items) |
| Annuaire de l'enseignement — Vienne | annuaire professionnel | https://annuaire-education.fr/departement/vienne/086.html | page unique, sans flux |
| La Nouvelle République — Éducation dans la Vienne | presse locale (rubrique éducation) | https://www.lanouvellerepublique.fr/vienne/education | idem — flux https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c (40 items) |

## Preuve

- Corpus : `bench/corpus/sources-enseignement-86.jsonl` (champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Relevé HTTP : `bench/results/verification-sources-enseignement-86.json` — 42 contrôles, 42 URL uniques, tous en code 200, avec types de contenu, URL finales et nombres d'items RSS.
- Méthode : GET réel avec redirections suivies et User-Agent navigateur, délai 25 s, relevé effectué le 2026-11-22.
- Migration : `db/migrate-180-sources-enseignement-86.sql` — 15 lignes `source` et 39 traces `source_verification` en `ok200` (appliquée en base locale et vérifiée en SQL).
- Exemples cyber vérifiés en HTTP 200 :
  - « [POITIERS] Cyberattaque à l'académie de Poitiers : le recteur fait le point » — 2026-08-31 — https://www.unsa-education.com/articles-regional-/poitiers-cyberattaque-a-lacademie-de-poitiers-le-recteur-fait-le-point/
  - « Vulnérabilité GLPI, accès restreint au VPN » — 2024-12-20 — https://status.univ-poitiers.fr/issues/2024-12-20-glpi/
  - « 8 000 € de rançon réclamés, bulletins scolaires perdus (collège La Salle, Brive) » — 2025-02-12 — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/le-montant-de-la-rancon-qui-etait-de-8-000-euros-ce-college-perd-tous-les-bulletins-des-eleves-apres-une-cyberattaque-3107128.html

## Candidats écartés

- https://www.ac-poitiers.fr/ , https://www.ac-poitiers.fr/DSDEN86 et https://www.ac-poitiers.fr/Actualites : HTTP 403 anti-bot (Cloudflare) ; le site SPIP de la DSDEN 86 est retenu à la place.
- https://www.iut-poitiers.fr/ , https://www.cci-poitiers.fr/ , https://www.cma-poitiers.fr/ , https://www.sudeducation86.fr/ : erreur réseau ou domaine inexistant ; les équivalents `univ-poitiers.fr` et `campus120.fr` sont retenus.
- https://86.fcpe.asso.fr/feed/ : HTTP 404 ; `url_flux` laissée vide.
- https://www.ensma.fr/actualites/feed/ et https://ww2.ac-poitiers.fr/dsden86-pedagogie/spip.php?page=backend : HTTP 200 mais 0 item au relevé ; flux déclarés et comptés comme tels.
- https://www.cybermalveillance.gouv.fr/tous-nos-contenus/actualites : HTTP 410 ; exemples cyber ci-dessus vérifiés en 200.

Limite de périmètre : quelques organisations sont académiques ou régionales (INSPÉ, Greta, enseignement catholique Poitou-Charentes, SNASUB, annuaire national décliné pour la Vienne) mais couvrent explicitement la Vienne, aux côtés d'acteurs strictement départementaux (DSDEN 86, Université et IUT de Poitiers, lycée Le Dolmen, Campus 120, FCPE 86, presse locale).

OBJECTIF : atteint — 15 / 5
