# Couverture — sources « enseignement » des Deux-Sèvres (79)

12 sources vérifiées en HTTP 200 le 2026-11-22 (33 contrôles, 32 URL uniques, 9 flux RSS déclarés).

| Source | Type | Site | Actualités / flux |
| --- | --- | --- | --- |
| DSDEN 79 — pédagogie (Éducation nationale, Deux-Sèvres) | direction départementale de l'Éducation nationale | https://ww2.ac-poitiers.fr/dsden79-pedagogie/spip.php?m=1 | https://ww2.ac-poitiers.fr/dsden79-pedagogie/spip.php?rubrique374 — flux https://ww2.ac-poitiers.fr/dsden79-pedagogie/spip.php?page=backend |
| SUD éducation Deux-Sèvres | syndicat enseignant | https://www.sudeducation79.org/ | https://www.sudeducation79.org/category/actualites/ — flux https://www.sudeducation79.org/feed/ (10 items) |
| FCPE des Deux-Sèvres | fédération de parents d'élèves | https://79.fcpe.asso.fr/ | https://79.fcpe.asso.fr/actualites (aucun flux RSS exploitable) |
| Enseignement catholique du Poitou et Charentes | fédération de l'enseignement catholique | https://ec-poitou-charentes.fr/ | https://ec-poitou-charentes.fr/?post_type=post — flux https://ec-poitou-charentes.fr/feed/ (4 items) |
| Lycée Paul Guérin (Niort) | lycée professionnel et technologique public | https://lycee-paul-guerin.fr/ | https://lycee-paul-guerin.fr/c/actualites/ — flux https://lycee-paul-guerin.fr/feed/ (10 items) |
| Greta Poitou-Charentes — agence de Thouars | organisme de formation continue | https://www.greta-poitou-charentes.fr/ | https://www.greta-poitou-charentes.fr/actualites/ — flux https://www.greta-poitou-charentes.fr/feed/ (1 item) |
| Campus de Niort — Université de Poitiers | enseignement supérieur | https://niort.univ-poitiers.fr/ | https://niort.univ-poitiers.fr/accueil/evenements-toute-lannee/ — flux https://niort.univ-poitiers.fr/feed/ (6 items) |
| Terres et Paysages — CFA agricole des Deux-Sèvres | centre de formation d'apprentis agricole | https://terres-et-paysages.fr/ | https://terres-et-paysages.fr/actualites/ — flux https://terres-et-paysages.fr/feed/ |
| Diocèse de Poitiers (Vienne et Deux-Sèvres) | enseignement catholique diocésain | https://www.poitiers.catholique.fr/ | https://www.poitiers.catholique.fr/actualites/ — flux https://www.poitiers.catholique.fr/feed/ (16 items) |
| CFA académique de Poitiers | centre de formation d'apprentis | https://www.cfa-acad-poitiers.fr/ | https://www.cfa-acad-poitiers.fr/actualites — flux https://www.cfa-acad-poitiers.fr/rss.xml (4 items) |
| CMA Formation Niort — CFA 79 | centre de formation d'apprentis consulaire | https://formation.cma-nouvelleaquitaine.fr/nos-centres-de-formation/niort | https://formation.cma-nouvelleaquitaine.fr/actualites |
| Annuaire de l'enseignement — Deux-Sèvres | annuaire professionnel | https://annuaire-education.fr/departement/deux-sevres/079.html | 455 établissements répertoriés ; accueil = annuaire (pas de flux) |

## Preuve

- Corpus : `bench/corpus/sources-enseignement-79.jsonl` (champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Relevé HTTP : `bench/results/verification-sources-enseignement-79.json` — 33 contrôles, 32 URL uniques, tous en code 200, avec types de contenu, URL finales et nombres d'items RSS.
- Méthode : GET réel avec redirections suivies et User-Agent navigateur, délai 25 s, relevé effectué le 2026-11-22.
- Migration : `db/migrate-161-sources-enseignement-79.sql` — 12 lignes `source` et 32 traces `source_verification` en `ok200` (vérifié en base locale).
- Exemples cyber vérifiés en HTTP 200 :
  - « Enquête Éducation nationale sur la connaissance de la cyber auprès des élèves du CM1 à la 6e » — 2025-09-29 — https://www.cybermalveillance.gouv.fr/tous-nos-contenus/actualites/cp-enquete-cybersecurite-education-nationale-2025
  - « Hackathon CyberEnJeux » — 2026-01-09 — https://lycee-paul-guerin.fr/hackathon-cyberenjeux/ (cas propre au lycée Paul Guérin)

## Candidats écartés

- https://www.ac-poitiers.fr/DSDEN79 : HTTP 403 anti-bot ; le site SPIP de la DSDEN 79 est retenu à la place.
- https://www.lanouvellerepublique.fr/deux-sevres/education : HTTP 403 anti-bot ; presse locale non retenue faute de 200 observable.
- https://www.education.gouv.fr/cyberattaques-… et .../incident-de-securite-affectant-... : HTTP 403 anti-bot ; exemples cyber remplacés par cybermalveillance.gouv.fr.
- https://79.fcpe.asso.fr/index.php?format=feed&type=rss, /rss.xml et /actualites/rss.xml : HTTP 200 mais HTML, pas de flux ; `url_flux` laissée vide.
- https://niort.univ-poitiers.fr/flux-rss/ et /actualites/ : 404 ; `/feed/` et `/accueil/evenements-toute-lannee/` retenus.
- https://www.cfa-acad-poitiers.fr/feed : 404 ; `/rss.xml` retenu.
- https://ec-poitou-charentes.fr/actualites/ et https://lycee-paul-guerin.fr/actualites/ : 404 ; archives WordPress retenues.
- https://terres-et-paysages.fr/feed/ et le backend SPIP DSDEN 79 : HTTP 200 mais sans item au relevé ; flux déclarés conservés.

Limite de périmètre : certaines organisations sont régionales (enseignement catholique Poitou-Charentes, Greta, CFA académique, diocèse de Poitiers, CMA Nouvelle-Aquitaine) ou nationales (annuaire de l'enseignement, cybermalveillance) mais couvrent explicitement les Deux-Sèvres, aux côtés d'acteurs strictement départementaux (DSDEN 79, SUD 79, FCPE 79, lycée de Niort, CFA agricole 79).
