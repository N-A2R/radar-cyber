# Sources du secteur « juridique » — Gironde (33)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **11 sources, 31 URL distinctes toutes en HTTP 200** (31 contrôles) le 2026-11-22.

- Corpus : `bench/corpus/sources-juridique-33.jsonl` (11 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`). Empreinte du corpus consolidé : `076f004881d2ba898f9e179cc8553afca276935f92a923dad1f317d204a5acf9` (`bench/corpus/HASH`).
- Preuve HTTP : `bench/results/verification-juridique-33.json` — code, type de contenu, URL finale et nombre d'items RSS pour chaque URL (sites, pages d'actualités, flux et articles cyber). Six flux RSS réels vérifiés (barreau de Bordeaux, barreau de Libourne, chambre des notaires de la Gironde, notaires.fr, avocat.fr, Alertcys/CNCJ) ; quand aucun flux n'est publié, `url_flux` désigne la page d'actualités monitorée, comme dans les autres tranches du corpus.
- Intégration : `db/migrate-095-sources-juridique-33.sql` — 11 lignes dans `source` (identifiants `corpus:juridique-33-*`), 26 traces `ok200` dans `source_verification`. Le contrôle d'import (`scripts/importer-corpus.mts --dir … --no-probe`) accepte 11/11 lignes, 0 rejet.
- Exemples cyber : hameçonnage de cabinets d'avocats (La Presse, 29/10/2026), fraudes et cyberattaques notariales (notaires.fr, 26/05/2026), piratage de notaires (Yahoo, 04/09/2026), cyberharcèlement et preuve (commissaire-justice.fr, 13/01/2023), fraude à la location saisonnière (commissaire-justice.fr, 22/07/2025) — cinq articles vérifiés en 200.
- Contrôle complémentaire `scripts/valider-corpus.mts` : 11/11 URL accessibles, 8 jugeables cohérentes avec le nom déclaré. Trois restent « incohérentes » tout en répondant 200 : le flux du barreau de Libourne ne contient actuellement qu'un item « No feed items at the moment », et les deux pages `cours-appel.justice.fr/bordeaux` affichent un écran de maintenance ; ces pages sont conservées parce qu'elles sont les URL officielles de suivi.

## Organisations retenues

| Nom | Type | Site | Actualités | Flux / suivi |
|---|---|---|---|---|
| Ordre des avocats — Barreau de Bordeaux | ordre professionnel d'avocats | https://www.barreau-bordeaux.com/ | https://www.barreau-bordeaux.com/qui-sommes-nous/actualites/ | https://www.barreau-bordeaux.com/feed/ |
| Barreau de Libourne | ordre professionnel d'avocats | https://www.barreaulibourne.fr/ | https://www.barreaulibourne.fr/ | https://www.barreaulibourne.fr/rss/blog |
| Chambre des notaires de la Gironde | chambre professionnelle notariale | https://chambre-gironde.notaires.fr/ | https://chambre-gironde.notaires.fr/actualites/ | https://chambre-gironde.notaires.fr/feed/ |
| Conseil régional des notaires de la Cour d'appel de Bordeaux | conseil régional notarial — Gironde | https://cr-bordeaux.notaires.fr/ | https://cr-bordeaux.notaires.fr/actualite | https://cr-bordeaux.notaires.fr/actualite |
| Cour d'appel de Bordeaux | juridiction — cour d'appel | https://www.cours-appel.justice.fr/bordeaux/ | https://www.cours-appel.justice.fr/bordeaux/actualites | https://www.cours-appel.justice.fr/bordeaux/actualites |
| Tribunal judiciaire de Bordeaux | juridiction — tribunal judiciaire | https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-bordeaux | https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-bordeaux/actualites | idem |
| Lenoir & Tostain — commissaires de justice à Bordeaux | cabinet de commissaires de justice | https://www.scp-lenoir.fr/ | https://www.scp-lenoir.fr/actualites/ | idem |
| Notaires de France — annuaire des notaires de la Gironde | annuaire professionnel notarial | https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/gironde | https://www.notaires.fr/fr/actualites | https://www.notaires.fr/rss/actualites |
| Avocat.fr — annuaire du barreau de Bordeaux | annuaire professionnel d'avocats | https://consultation.avocat.fr/avocats/barreau-bordeaux.html | https://www.avocat.fr/actualites | https://www.avocat.fr/rss.xml |
| Village de la Justice — actualités juridiques et annuaire des barreaux | média et annuaire professionnels du droit | https://www.village-justice.com/articles/ | https://www.village-justice.com/articles/ | idem |
| Alertcys — service d'alertes professionnelles de la CNCJ | service d'alertes des commissaires de justice | https://alertcys.io/ | https://alertcys.io/actualites-lanceur-dalerte/ | https://alertcys.io/feed/ |

## Candidats écartés

- `https://www.sudouest.fr/gironde/` : redirection 302 en boucle, aucun 200 vérifiable.
- `https://www.legifrance.gouv.fr/actualites` : HTTP 403 au contrôle.
- `https://www.barreaudebordeaux.fr/` : aucune réponse exploitable ; le site officiel observé `barreau-bordeaux.com` a été retenu à la place.
- `https://cr-bordeaux.notaires.fr/feed/` et `https://www.barreaulibourne.fr/actualites/` : HTTP 404 ; pages d'actualités ou flux disponibles retenus à la place.
- Exa MCP indisponible (HTTP 402, crédits épuisés) : découverte par pages officielles et moteurs HTML accessibles, puis vérification HTTP de chaque URL retenue.

## Méthode

Recherche des organisations du droit en Gironde (barreaux, juridictions, notariat, commissaires de justice, annuaires et média juridique), lecture des pages officielles pour trouver les rubriques d'actualités et les flux, puis contrôle GET réel de chaque URL (redirections suivies, délai 20 s) avec enregistrement du code HTTP, du type de contenu, de l'URL finale et du nombre d'items RSS. Aucune URL n'a été retenue sans observation préalable de la page ou du flux.
OBJECTIF : atteint — 11 sources vérifiées en 200 / 5 sources vérifiées en 200
