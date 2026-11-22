# Couverture — sources « enseignement » de la Creuse (23)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **17 sources en HTTP 200**, 44 contrôles HTTP tous en 200 (sites, pages d'actualités, flux et articles d'exemple), le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Cité scolaire Raymond Loewy (Guéret) | cité scolaire | https://www.cite-loewy.org/ | https://www.cite-loewy.org/college/blog-college | https://www.cite-loewy.org/feed |
| Cité scolaire Eugène Jamot / Jean Jaurès (Aubusson) | cité scolaire | https://www.cite-scolaire-aubusson.fr/ | https://www.cite-scolaire-aubusson.fr/actualites/ | https://www.cite-scolaire-aubusson.fr/feed/ |
| Lycée polyvalent Jean Favard (La Souterraine) | lycée | https://lyceejeanfavard.fr/ | https://lyceejeanfavard.fr/actualites/ | https://lyceejeanfavard.fr/feed/ |
| Lycée agricole Alphonse Defumade (Ahun) | lycée agricole / CFA | https://ahun.educagri.fr/ | https://ahun.educagri.fr/actualites/ | https://ahun.educagri.fr/rss.xml |
| Lycée professionnel Louis-Gaston Roussillat (Guéret) | lycée professionnel | https://lproussillat.fr/ | https://lproussillat.fr/actualites/ | https://lproussillat.fr/feed/ |
| Lycée polyvalent des métiers du bâtiment (Felletin) | lycée professionnel | https://lmb-felletin.fr/ | https://lmb-felletin.fr/blog/actualites | — |
| Lycée Pierre Bourdan (Guéret) | lycée | https://etablissement.ac-limoges.fr/lyc-pierre-bourdan/index.php | idem | flux SPIP `spip.php?page=backend` |
| Campus de Guéret — Université de Limoges (IUT, Inspé) | enseignement supérieur | https://gueret.unilim.fr/ | https://gueret.unilim.fr/category/actualite/ | https://gueret.unilim.fr/feed/ |
| GRETA du Limousin — antenne de la Creuse | formation continue | https://www.greta-du-limousin.fr/ | https://www.greta-du-limousin.fr/actualites/ | — |
| CFA de la CCI de la Creuse (Guéret) | CFA consulaire | https://www.cfa-cci-creuse.com/ | https://www.cfa-cci-creuse.com/actualites | — |
| FSU-SNUipp 23 (Creuse) | syndicat enseignant | https://23.fsu-snuipp.fr/ | idem | flux SPIP `spip.php?page=backend` |
| FCPE de la Creuse (23) | fédération de parents | https://fcpe23.org/ | https://fcpe23.org/actualites | — |
| Annuaire des établissements — Éducation nationale (Creuse) | annuaire professionnel | https://data.education.gouv.fr/pages/recherche-etablissement/ | idem | API JSON `fr-en-annuaire-education`, requête Creuse |
| La Montagne — Creuse | presse locale | https://www.lamontagne.fr/creuse/ | https://www.lamontagne.fr/actualites/education | — |
| actu.fr — Actu Creuse | presse locale | https://actu.fr/nouvelle-aquitaine/creuse_23/ | idem | https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml |
| ici Creuse — Radio France | média public local | https://www.ici.fr/radio/creuse | https://www.ici.fr/nouvelle-aquitaine/creuse-23/actu | — |
| Le Populaire du Centre — Guéret | presse locale | https://www.lepopulaire.fr/gueret-23000/ | https://www.lepopulaire.fr/actualites/education | — |

Toutes ces organisations sont ancrées dans le département 23 : Guéret, Aubusson, Ahun, La Souterraine et Felletin pour les établissements, campus universitaire de Guéret, antenne GRETA et CFA consulaire de la Creuse, sections départementales FSU-SNUipp et FCPE, annuaire interrogé sur la Creuse et quatre titres de presse locale (dont deux rubriques Éducation dédiées).

## Exemples cyber associés

Le champ `exemple_cyber` s'appuie sur des articles vérifiés en HTTP 200 : piratage Pronote dans un lycée d'Agen (Sud Ouest, 11/09/2026), rançongiciel au collège La Salle de Brive (France 3, 12/02/2025, 8 000 € de rançon), piratage du compte Pronote d'un élève à Anglet (Sud Ouest, 31/05/2024) et cyberattaque de l'école de commerce de Pau (Sud Ouest, 15/05/2024). L'annuaire n'a pas d'article dédié : le champ est vide.

## Candidats écartés

- `www.ac-limoges.fr` (rectorat, DSDEN 23, CIO de la Creuse) : HTTP 403 sous curl (protection Cloudflare), malgré un contenu accessible via un lecteur distant ; non retenu comme URL vérifiée en direct.
- `https://www.greta-du-limousin.fr/feed/` : HTTP 500 ; `/rss.xml` : 404.
- `https://fcpe23.org/rss.xml`, `https://www.lamontagne.fr/rss/creuse.xml`, `https://www.ici.fr/radio/creuse/rss.xml` : 404.
- `https://iut-gueret.unilim.fr/` : NXDOMAIN ; `https://www.unilim.fr/iut-gueret/` : 404 (le campus est couvert par `gueret.unilim.fr`).
- `https://www.cite-loewy.org/actualites/` et `/rss.xml` : 404 ; le blog du collège et le flux `/feed` ont été retenus.
- `https://fcpe.fr`, `https://23.snuipp.fr`, `https://www.fcpe-limousin.fr` : NXDOMAIN ou certificat expiré.

## Méthode et intégration

Découverte par recherche web, annuaire officiel de l'Éducation nationale (requête Creuse), sites d'établissements et presse locale, puis identification des pages d'actualités et des flux. Chaque URL a été contrôlée par un GET `curl -L` avec User-Agent navigateur et suivi des redirections (délai 25 s) : 44 URL, toutes en HTTP 200. Preuve détaillée dans `bench/results/verification-enseignement-23.json`.

Corpus : `bench/corpus/sources-enseignement-23.jsonl` (17 lignes, empreinte recalculée dans `bench/corpus/HASH`).
Base : `db/migrate-080-sources-enseignement-23.sql` insère 17 lignes dans `source` (parser pointant vers le corpus) et 17 traces `source_verification` en état `ok200`.
