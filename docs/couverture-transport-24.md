# Sources d'information — secteur transport, département 24 (Dordogne)

OBJECTIF : atteint — 20 / 5 sources vérifiées en HTTP 200 pour le couple secteur « transport » / département 24 (Dordogne).

## Livrable

- `bench/corpus/sources-transport-24.jsonl` — 20 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-transport-24.json` — 77 URL contrôlées le 2026-11-22 (`curl -L`, redirections suivies, User-Agent navigateur), 77 × 200 ; 20/20 sources valides.
- `db/migrate-191-sources-transport-24.sql` — 20 sources `corpus:transport24-*` en `department='24'`, 72 couples source/URL uniques tracés dans `source_verification` (`ok200`). Migration appliquée à la base locale puis rejouée sans doublon (1 747 sources et 3 688 traces avant, 1 767 et 3 760 après).
- `scripts/verif-corpus-transport-24.py` — rejeu du contrôle HTTP du corpus.
- `bench/corpus/HASH` régénéré après ajout du corpus : `992d1c821c2dd4ea111e2bcf9540dbd8c50368d470fa29efc299b4b65c9e1804`.

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | Péribus — Grand Périgueux | bus urbains (24) | `/actualites/` | `/actualites/feed/` |
| 2 | TUB — Transports Urbains Bergeracois | bus urbains (24) | `/actus-de-la-cab/` | `/feed/` |
| 3 | CLAS Transports (Sanilhac) | transport frigorifique (24) | `/actualites/` | `/feed/` |
| 4 | DOUMEN (Boulazac) | transport/logistique (24) | `/actualites-et-presse/` | `/feed/` |
| 5 | Transports Gauthier (Trélissac) | transporteur routier (24) | `/actualites/` | `/feed/` |
| 6 | Aéroport Bergerac Dordogne Périgord | aéroport (24) | `/blog/` | `/feed/` |
| 7 | Aéroport Périgueux-Bassillac | aéroport (24) | `/actualites/` | `/feed/` |
| 8 | CCI Dordogne | chambre consulaire (24) | `/actualites/` | `/feed/` |
| 9 | CMA Nouvelle-Aquitaine — Dordogne | chambre consulaire (24) | page Dordogne / actualités | — |
| 10 | OTRE Dordogne-Limousin | fédération transporteurs (24) | `/actualites/` | `/feed/` |
| 11 | VERBUS Osicars (Terrasson-Lavilledieu) | transport de voyageurs (24) | `/actualites` | — |
| 12 | Cars régionaux Nouvelle-Aquitaine — Dordogne | réseau interurbain (24) | `/toute-lactualite-des-transports` | `/liste-rss/naq_actualite` |
| 13 | Sud Ouest — Dordogne | presse locale (24) | `/dordogne/` | `/dordogne/rss.xml` |
| 14 | actu.fr — Dordogne | presse en ligne (24) | `/nouvelle-aquitaine/dordogne_24/` | `/rss.xml` |
| 15 | ICI Périgord | radio publique locale (24) | `/nouvelle-aquitaine/dordogne-24/actu` | `/rss/perigord/a-la-une.xml` |
| 16 | France 3 Nouvelle-Aquitaine — Dordogne | télévision publique locale (24) | `/nouvelle-aquitaine/dordogne` | `/rss` |
| 17 | Dordogne Libre | presse hebdomadaire (24) | accueil | `/rss.xml` |
| 18 | Happy Radio | radio locale Bergerac (24) | `/news` | `/feed` |
| 19 | Département de la Dordogne | collectivité, mobilités (24) | `/information-transversale/actualites` | `/rss` |
| 20 | Mairie.com — transport routier 24 | annuaire professionnel (24) | page Dordogne | — |

Douze sources (1–12) appartiennent directement au secteur transport : réseaux de bus, transporteurs, aéroports, chambres consulaires, fédération et collectivité. Les huit autres (13–20) sont des médias ou annuaires locaux de Dordogne qui couvrent l'actualité des mobilités et du transport.

## Exemples cyber

Chaque ligne porte un `exemple_cyber` au format « titre — URL », dont l'URL a elle aussi été contrôlée en HTTP 200 : six attaques informatiques relevées par la CCI de Dordogne (ICI), cyberattaques dans le transport routier de marchandises et continuité d'activité (Transport Info), transporteurs girondins victimes d'une cyberattaque (Sud Ouest), logistique cible des cyberattaques (LeMagIT), panne des aéroports européens (franceinfo).

## Limites du contrôle

- Le contrôle porte sur le code HTTP final après redirections, le type de contenu et la présence d'URL ; il ne garantit pas la fraîcheur éditoriale d'un flux ni l'absence de contenu payant derrière un mur.
- `https://www.sudouest.fr/dordogne-24/` répond 404 : l'édition Dordogne est suivie via `/dordogne/`.
- Aucun flux RSS dédié au transport n'a été trouvé pour la CMA Dordogne, VERBUS Osicars ou l'annuaire Mairie.com ; leurs pages d'actualités HTML sont suivies à la place.
- Les flux de Sud Ouest, ICI, France 3, du Département et de la CAB couvrent toute l'actualité locale ; les sujets transport y sont filtrés à la collecte.
- Les exemples cyber d'actualité régionale (Gironde) ou nationale sont des illustrations de risque pour le secteur, pas des incidents déclarés par les organisations listées.

## Contrôles rejouables

```bash
python3 scripts/verif-corpus-transport-24.py
jq 'select(.secteur=="transport" and .departement=="24" and .code_http==200) | .nom' \
  bench/corpus/sources-transport-24.jsonl | wc -l   # 20
jq '{sources, sources_valides, urls_sondees, urls_200}' \
  bench/results/verification-sources-transport-24.json
pnpm corpus:hash
```
