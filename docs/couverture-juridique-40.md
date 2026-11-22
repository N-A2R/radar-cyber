# Sources du secteur « juridique » — Landes (40)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **17 sources, 42 URL distinctes toutes en HTTP 200** (42 contrôles GET réels) le 2026-11-22.

- Corpus : `bench/corpus/sources-juridique-40.jsonl` (17 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`). Empreinte du corpus consolidé : `0c7bdedca42aad1be1d652797041703224b80e3311a770b113d08d23b7f90c21` (`bench/corpus/HASH`).
- Preuve HTTP : `bench/results/verification-juridique-40.json` — code, type de contenu, URL finale et nombre d'items RSS pour chaque URL (sites, pages d'actualités, flux et articles cyber). Sept flux RSS réels vérifiés (barreau de Dax, notaires.fr, commissaire-justice.fr/CNCJ, avocat.fr/CNB, WE NEWS, actu.fr, ICI Gascogne) ; quand aucun flux n'est publié, `url_flux` désigne la page d'actualités monitorée, comme dans les autres tranches du corpus.
- Intégration : `db/migrate-122-sources-juridique-40.sql` — 17 lignes dans `source` (identifiants `corpus:juridique-40-*`), 41 traces `ok200` dans `source_verification`. Migration appliquée le 2026-11-22 sur la base locale ; contrôle d'import sans écriture (`scripts/importer-corpus.mts --no-probe`) : 17/17 lignes acceptées, 0 rejet.
- Exemples cyber : fuite de données chez Gueguen & Avocats (Cyberattaque.org, 20/04/2026), fraudes et cyberattaques notariales (notaires.fr, 26/05/2026), cyberharcèlement et preuve (commissaire-justice.fr, 13/01/2023), fuite de données du greffe du tribunal de Paris (Cyberattaque.org, 17/09/2026) — quatre articles vérifiés en 200.

## Organisations retenues

| Nom | Type | Site | Actualités | Flux / suivi |
|---|---|---|---|---|
| Ordre des avocats de Mont-de-Marsan | ordre professionnel d'avocats | https://www.barreau-montdemarsan.org/ | accueil (rubrique Actualités) | idem |
| Barreau de Dax | ordre professionnel d'avocats | https://www.ordredesavocatsdedax.fr/fr/ | https://www.ordredesavocatsdedax.fr/fr/actualites | https://www.ordredesavocatsdedax.fr/fr/actualites?rss |
| Chambre interdépartementale des notaires Atlantique et Pyrénées | chambre notariale (40/64/65) | https://cr-pau.notaires.fr/ | https://cr-pau.notaires.fr/actualite?type=1 | idem |
| Notaires de France — annuaire Landes | annuaire notarial | https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/landes | https://www.notaires.fr/fr/actualites | https://www.notaires.fr/rss/actualites |
| Chambre nationale des commissaires de justice | chambre professionnelle | https://commissaire-justice.fr/ | https://commissaire-justice.fr/actualites/ | https://commissaire-justice.fr/feed/ |
| Avocat.fr — annuaire du barreau de Mont-de-Marsan | annuaire d'avocats | https://consultation.avocat.fr/avocats/barreau-mont-de-marsan.html | https://www.avocat.fr/actualites | https://www.avocat.fr/rss.xml |
| Avocat.fr — annuaire du barreau de Dax | annuaire d'avocats | https://consultation.avocat.fr/avocats/barreau-dax.html | https://www.avocat.fr/actualites | fiche du barreau de Dax |
| Village de la Justice — fiche Mont-de-Marsan | média et annuaire du droit | https://www.village-justice.com/articles/Marsan,765.html | https://www.village-justice.com/articles/ | idem |
| Village de la Justice — fiche Dax | média et annuaire du droit | https://www.village-justice.com/articles/article718,718.html | https://www.village-justice.com/articles/ | fiche du barreau de Dax |
| CDAD des Landes | conseil départemental de l'accès au droit | https://www.cdad-courdappel-pau.fr/ | https://www.cdad-courdappel-pau.fr/votre-cdad/actualites | idem |
| Cour d'appel de Pau | juridiction | https://www.cours-appel.justice.fr/pau/ | https://www.cours-appel.justice.fr/pau/actualites | idem |
| Tribunal judiciaire de Mont-de-Marsan | juridiction | https://www.cours-appel.justice.fr/pau/tribunal-judiciaire-de-mont-de-marsan | .../actualites | idem |
| Tribunal judiciaire de Dax | juridiction | https://www.cours-appel.justice.fr/pau/tribunal-judiciaire-de-dax | .../actualites | idem |
| Tribunal administratif de Pau | juridiction (ressort 40) | https://pau.tribunal-administratif.fr/ | https://pau.tribunal-administratif.fr/actualites | idem |
| WE NEWS — Landes faits-divers | presse locale | https://we-news.com/fr/40-landes | https://we-news.com/fr/40-landes/faits-divers | https://we-news.com/fr/feed?p=dept-40-landes |
| actu.fr — Landes | presse locale | https://actu.fr/landes/ | https://actu.fr/landes/dernieres-actus | https://actu.fr/landes/rss.xml |
| ICI Landes | radio locale (faits divers et justice) | https://www.ici.fr/nouvelle-aquitaine/landes-40 | https://www.ici.fr/infos/faits-divers-justice | https://www.ici.fr/rss/gascogne/rubrique/infos.xml |

## Candidats écartés

- `barreau-mont-de-marsan.fr`, `barreau-dax.fr`, `chambre-landes.notaires.fr` : domaines inexistants ; sites officiels observés et retenus à la place.
- `https://www.cdad-landes.justice.fr/` : certificat TLS invalide au contrôle ; la redirection `cdad-courdappel-pau.fr` répond 200 et porte bien les actualités du CDAD 40.
- `https://www.landes.fr/actualites` : HTTP 403 ; `https://www.sudouest.fr/landes/` : redirection 302 sans 200 vérifiable.
- `https://cr-pau.notaires.fr/feed/` et `https://www.barreau-montdemarsan.org/actualites.htm` : HTTP 404 ; pages d'actualités existantes retenues.
- Exa MCP indisponible (HTTP 402, crédits épuisés) : découverte via Bing, annuaires professionnels et pages officielles, puis vérification HTTP de chaque URL retenue.

## Méthode

Recherche des organisations du droit dans les Landes (barreaux, notariat, commissaires de justice, CDAD, juridictions, annuaires et presse locale avec rubrique justice), lecture des pages officielles pour trouver les rubriques d'actualités et les flux, puis contrôle GET réel de chaque URL (redirections suivies, délai 20 s) avec enregistrement du code HTTP, du type de contenu, de l'URL finale et du nombre d'items RSS. Aucune URL n'a été retenue sans observation préalable de la page ou du flux.

OBJECTIF : atteint — 17 / 5
