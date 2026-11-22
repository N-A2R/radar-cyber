# Couverture des sources d'information — santé — Pyrénées-Atlantiques (64)

**Livrable du 2026-11-22.** 21 sources vérifiées, 63 contrôles HTTP, 63 réponses 200, 58 URL uniques.

| Élément | Valeur |
| --- | --- |
| Secteur | santé |
| Département | 64 — Pyrénées-Atlantiques |
| Sources retenues | 21 |
| Contrôles HTTP | 63 (site, page d'actualités, flux pour chaque source) |
| Réponses 200 | 63 / 63 |
| URL uniques | 58 |
| Corpus | `bench/corpus/sources-sante-64.jsonl` |
| Preuve HTTP | `bench/results/verification-sources-sante-64.json` |
| Intégration | `db/migrate-151-sources-sante-64.sql` (21 lignes `source`, 59 lignes `source_verification` — 63 contrôles moins 4 doublons site/actus dans la même source) |

## Familles couvertes

- **Établissements** : Centre hospitalier universitaire de Pau, Centre hospitalier d'Oloron-Sainte-Marie.
- **Agences et réseaux** : ARS Nouvelle-Aquitaine (délégation 64), Santé publique France Nouvelle-Aquitaine, ESEA/GRADeS e-santé, AVECSanté Nouvelle-Aquitaine.
- **Ordres et unions professionnelles** : Ordre des médecins, Ordre des sages-femmes (conseil départemental 64), Ordre national des infirmiers, Ordre national des pharmaciens, URPS pharmaciens Nouvelle-Aquitaine.
- **Fédérations et mutuelles** : FHF Nouvelle-Aquitaine, FHP Nouvelle-Aquitaine, Mutualité française Nouvelle-Aquitaine.
- **Presse et médias locaux** : La Semaine des Pyrénées, actu.fr Pau, ici Béarn Bigorre, ici Pays Basque, France 3 Pyrénées-Atlantiques, Le Parisien 64, Mediabask.

Chaque ligne du corpus porte les neuf clés `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`. Les flux qui n'existent pas en natif sont remplacés par un flux Google News ciblé sur l'organisation et le territoire, comme dans les tranches précédentes.

## Exemples de contenu cyber observés

- *Béarn : l'hôpital d'Oloron Sainte-Marie victime d'une cyberattaque, le parquet de Paris saisi* — Sud Ouest, 2021-03-09.
- *Un hôpital des Pyrénées-Atlantiques visé à son tour par une cyberattaque* — Le Monde, 2021-03-09.
- *Incident de sécurité concernant la plateforme de recueil des autorisations parentales* — ARS Nouvelle-Aquitaine, dans le flux RSS de l'ARS.
- *Cyberattaque du logiciel WEDA : que s'est-il passé et comment réagir pour une MSP ?* — AVECSanté Nouvelle-Aquitaine.

## Candidats écartés (preuve HTTP)

- `https://www.chu-pau.fr/`, `https://www.ch-bayonne.fr/`, `https://www.clinique-marzet.fr/`, `https://www.sante64.fr/` : NXDOMAIN — les établissements concernés publient sous `ch-pau.fr` et `ch-oloron.fr`.
- `https://www.ameli.fr/pyrenees-atlantiques/assure/` et `https://www.ameli.fr/64/assure/` : HTTP 404 ; la CPAM n'est donc pas revendiquée dans ce corpus.
- `https://www.sudouest.fr/pyrenees-atlantiques/` et `https://www.sudouest.fr/sante/` : boucles de redirections (curl `Maximum (50) redirects followed`) ; non retenues.
- `https://www.esea-na.fr/feed/`, `https://www.ici.fr/rss/bearn/rubrique/sante.xml`, `https://www.lasemainedespyrenees.fr/category/sante/` : HTTP 404 ; flux de remplacement vérifié en 200 pour ces sources.

## Méthode

Recherche web par familles (annuaires professionnels, agences sanitaires, ordres, fédérations, hôpitaux, presse locale), identification de la page d'actualités et du flux de chaque organisation, puis contrôle GET des trois URL avec un User-Agent navigateur, suivi des redirections et délai maximal de 25 s. Le nombre d'items est lu dans le flux lorsque le format est RSS/Atom. Les URL répondant 200 mais redirigeant vers une page d'erreur (`ch-pau.fr/rss.xml` → `page-non-trouvee/`) ont été écartées. La migration SQL est idempotente : `ON CONFLICT (id) DO UPDATE` pour `source`, `WHERE NOT EXISTS` pour `source_verification`.

Objectif chiffré : au moins 5 sources vérifiées en 200 pour santé/64. **Résultat : 21/21 sources vérifiées en 200 (63/63 URL).**

OBJECTIF : atteint — 21 / 5
