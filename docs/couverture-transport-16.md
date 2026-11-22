# Sources d'information — secteur transport, département 16 (Charente)

OBJECTIF : atteint — 8 / 5 sources vérifiées en HTTP 200 pour le couple secteur « transport » / département 16 (Charente).

## Livrable

- `bench/corpus/sources-transport-16.jsonl` — 8 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-transport-16.json` — 31 URL contrôlées le 2026-11-22 (`curl -L`, redirections suivies, User-Agent navigateur), 31 × 200 ; 8/8 sources valides.
- `db/migrate-095-sources-transport-16.sql` — 8 sources `corpus:transport16-*` en `department='16'`, 28 URL uniques tracées dans `source_verification` en `ok200`. Migration appliquée à la base locale et rejouée sans doublon (8 sources / 28 traces avant et après).
- `bench/corpus/HASH` régénéré après ajout du corpus.

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | STGA — réseau de bus du Grand Angoulême | réseau de transport public (16) | `/actualites` | — |
| 2 | Aéroport Angoulême-Cognac | aéroport (16) | `/category/actualites/` | `/feed/` |
| 3 | GrandAngoulême — rubrique Mobilités | intercommunalité (16) | `/category/actualites/mobilites/` | `/feed/` |
| 4 | France 3 Nouvelle-Aquitaine — Charente | télévision publique locale | `/nouvelle-aquitaine/charente/` | `/rss` |
| 5 | ICI Charente | radio publique locale | `/nouvelle-aquitaine/charente-16/actu` | `/rss/la-rochelle/rubrique/infos.xml` |
| 6 | Grand Cognac — transports et mobilités | intercommunalité, réseau Transcom (16) | `/vivre-et-participer/transports-et-mobilites` | `/rss.xml` |
| 7 | actu.fr — Charente | presse en ligne (16) | `/nouvelle-aquitaine/charente_16/` | `/rss.xml` (flux vide au contrôle) |
| 8 | Le Journal des Entreprises — Nouvelle-Aquitaine | presse économique régionale | `/nouvelle-aquitaine` | `/rss-nouvelle-aquitaine` |

Quatre sources sont strictement départementales (STGA, aéroport, GrandAngoulême, Grand Cognac) ; quatre sont des médias régionaux ou locaux dont la couverture inclut la Charente.

## Limites du contrôle

- `charentelibre.fr` et `sudouest.fr/charente` renvoient une boucle 307/302 (protection anti-bot) au sondage : exclus faute de HTTP 200 observable, malgré leur couverture transport de la Charente.
- Le site de la CCI de Charente renvoie 403 et celui de SNCF/TER Nouvelle-Aquitaine 403 : exclus pour la même raison.
- Le corpus transport Nouvelle-Aquitaine de la PR #389 ne porte pas de champ `departement` et ne contient aucune source du 16 ; ce corpus départemental est donc distinct.
