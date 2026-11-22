# Sources du secteur « juridique » — Corrèze (19)

## Résultat

OBJECTIF : atteint — 10 / 5

**10 sources vérifiées en HTTP 200** pour le couple secteur `juridique` / département `19` (cible : au moins 5).

- Corpus : `bench/corpus/sources-juridique-19.jsonl` (10 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-juridique-19.json` — 19 URLs contrôlées, 19 en 200, le 2026-11-22.
- Intégration : `db/migrate-081-sources-juridique-19.sql` (10 lignes dans `source`, identifiants `corpus:juridique-19-*`, 19 traces dans `source_verification`).
- 3 flux RSS exploitables : Notaires de France, Sud Ouest justice, ICI Limousin.

## Organisations retenues

| Organisation | Type | Page actualités |
|---|---|---|
| Tribunal judiciaire de Tulle | juridiction | https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-tulle/actualites |
| Tribunal judiciaire de Brive-la-Gaillarde | juridiction | https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-brive-la-gaillarde/actualites |
| Notaires de France — annuaire des notaires de la Corrèze | annuaire professionnel notarial | https://www.notaires.fr/fr/actualites |
| Avocat.fr — annuaire du barreau de Tulle | annuaire professionnel d'avocats | https://www.avocat.fr/actualites |
| Sud Ouest — Corrèze (justice) | presse quotidienne régionale | https://www.sudouest.fr/justice/ |
| La Montagne — Corrèze | presse locale quotidienne | https://www.lamontagne.fr/correze/ |
| actu.fr — Brive-la-Gaillarde | média local en ligne | https://actu.fr/nouvelle-aquitaine/brive-la-gaillarde_19031/ |
| ICI Corrèze (Radio France) | radio locale | https://www.ici.fr/nouvelle-aquitaine/correze-19/actu |
| France 3 Nouvelle-Aquitaine — Corrèze | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/ |
| CMA Nouvelle-Aquitaine — Corrèze | chambre consulaire | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites |

## Exemples cyber associés

Les exemples `exemple_cyber` sont tirés de `bench/corpus/incidents-correze.jsonl` :

- **Mairie de Sarran** — 44 000 euros de budget perdus après cyberattaque (tribunal de Tulle, annuaire des avocats, France 3).
- **Collège privé La Salle de Brive-la-Gaillarde** — 8 000 euros de rançon, bulletins perdus (tribunal de Brive).
- **Novabio / site de Brive-Rivet** — fuite de données de santé de patients (notaires, actu.fr) : enjeu de responsabilité et de protection des données.
- **Intermarché d'Altillac** — cyberattaque d'une enseigne commerciale (Sud Ouest, La Montagne).
- **Corrèze Fermeture (Objat)** — 50 à 60 commandes perdues (ICI Corrèze, CMA Nouvelle-Aquitaine).

## Candidats écartés

- **Barreau de Tulle (sites dédiés)** : `avocats19.fr`, `barreaudetulle.fr`, `barreaudetulle.com` non résolus ; l'annuaire Avocat.fr du barreau de Tulle est retenu.
- **Chambres notariales / commissaires de justice de la Corrèze** : `notaires19.fr`, `notaires-correze.fr`, `chambre-notaires-correze.fr`, `cdhj19.fr`, `cdj19.fr` non résolus ; l'annuaire notaires.fr est retenu.
- **La Montagne — `/justice/`** : HTTP 404 ; l'édition Corrèze du quotidien sert de page d'actualités.
- **actu.fr — flux Brive** : HTTP 404 ; la page locale est retenue sans flux.
- **Conseil départemental de la Corrèze** : `/actualites/`, `/actualites` et `/actualites.html` répondent 404 ; pas de page d'actualités exploitable.

## Méthode

Recherche d'organisations juridiques en Corrèze (annuaires professionnels, juridictions, chambres consulaires, presse locale), identification des pages d'actualités et des flux RSS, puis contrôle GET de chaque URL avec User-Agent navigateur, suivi des redirections et délai maximal de 18 s. Seules les sources dont toutes les URLs ont répondu 200 et dont le contenu est exploitable ont été intégrées au corpus et à la base.
