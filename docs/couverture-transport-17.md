# Sources d'information — secteur transport, département 17 (Charente-Maritime)

OBJECTIF : atteint — 11 / 5 sources vérifiées en HTTP 200 pour le couple secteur « transport » / département 17 (Charente-Maritime).

## Livrable

- `bench/corpus/sources-transport-17.jsonl` — 11 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-transport-17.json` — 42 URL contrôlées le 2026-11-22 (`curl -L`, redirections suivies, User-Agent navigateur), 42 × 200 ; 11/11 sources valides (41 URL uniques, le site et la page actualités d'actu.fr étant identiques).
- `scripts/verif-corpus-transport-17.py` — rejoue le contrôle : `python3 scripts/verif-corpus-transport-17.py` régénère le rapport ci-dessus.
- `db/migrate-097-sources-transport-17.sql` — 11 sources `corpus:transport17-*` en `department='17'`, 41 URL uniques tracées dans `source_verification` en `ok200`. Migration appliquée dans un PostgreSQL 16 temporaire et rejouée sans doublon (11 sources / 41 traces avant et après).
- `bench/corpus/HASH` régénéré après ajout du corpus.

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | Union Maritime de La Rochelle (UMLR) | fédération maritime et portuaire (17) | `/category/actualites/` | `/feed/` |
| 2 | Port Atlantique La Rochelle | port public, fret et logistique (17) | `/nos-engagements/actualites/` | — |
| 3 | Port Charente Atlantique | port de commerce de Rochefort/Tonnay-Charente (17) | `/actualites-du-port-charente-atlantique/` | `/feed/` |
| 4 | Atlantic Cluster | cluster maritime et logistique (17) | `/actualites/` | `/feed/` |
| 5 | Groupe SICA Atlantique | logistique et manutention céréalière (17) | `/notre-actualite/` | `/feed/` |
| 6 | Groupe Sarrion | transport routier et logistique (17) | `/le-blog/` | `/feed/` |
| 7 | Ferrocampus | mobilité et innovation ferroviaire, Saintes (17) | `/les-actualites/` | `/feed/` |
| 8 | Cara'bus — réseau de bus de Royan | réseau de transport public (17) | `/actualites/` | — |
| 9 | Yélo Mobilités — Agglo La Rochelle | opérateur bus/vélos/TAD (17) | `/actualites/` | `?feed=rss2&post_type=news` |
| 10 | actu.fr — Charente-Maritime | presse locale (17) | `/nouvelle-aquitaine/charente-maritime_17/` | `/rss.xml` |
| 11 | ICI Charente-Maritime | radio publique locale (17) | `/nouvelle-aquitaine/charente-maritime-17/actu` | `/rss/la-rochelle/rubrique/infos.xml` |

Neuf sources sont strictement départementales ou basées dans le 17 (UMLR, ports, cluster, entreprises, Ferrocampus, réseaux de bus) ; deux sont des médias locaux dont la rubrique couvre explicitement la Charente-Maritime.

## Limites du contrôle

- `charente-maritime.cci.fr` (CCI 17) renvoie 403 au sondage HTTP : exclue malgré sa couverture transport/économie du département.
- `sudouest.fr/charente-maritime/` renvoie 302 en fin de chaîne de redirections (protection anti-bot) : exclue faute de HTTP 200 observable.
- `port-larochelle.fr`, `ctac.fr` et `carcharente-maritime.fr` (anciens domaines pressentis) ne répondent pas ; les sites officiels actuels (`larochelle.port.fr`, `yelo-larochelle.fr`, `transports.nouvelle-aquitaine.fr`) ont été retenus à leur place.
- Le corpus transport Nouvelle-Aquitaine de la PR #389 ne porte pas de champ `departement` ; celui-ci est spécifique au couple transport / 17.
