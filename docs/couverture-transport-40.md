# Sources d'information — secteur transport, département 40 (Landes)

Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple transport / 40.
Livré : **13 sources**, **45 URL contrôlées**, **45 en HTTP 200** (cible dépassée).

## Livrable

- Corpus : `bench/corpus/sources-transport-40.jsonl` (13 lignes).
- Contrôle HTTP : `bench/results/verification-sources-transport-40.json`.
- Base : `db/migrate-200-sources-transport-40.sql` (13 `source`, 45 `source_verification`).

Contrôle du 2026-11-22 : `curl -L GET`, redirections suivies, code final, User-Agent navigateur. Chaque source a son site, sa page d'actualités et, quand elle existe, son flux RSS vérifiés en 200 ; l'URL d'exemple cyber l'est aussi.

| # | Source | Type | Page d'actualités | Flux |
|---|--------|------|-------------------|------|
| 1 | Trans-Landes | réseau de transport public interurbain | `/nous/actualites/` | — |
| 2 | RRTL — Régie Régionale des Transports des Landes | opérateur Cars Région / Couralin | `/infos/actualites/` | — |
| 3 | Movima — Pays de Marsan | réseau de bus urbain | `/actualites/` | — |
| 4 | OTRE Pays Adour | syndicat de transporteurs routiers | `/actualites/` | `/feed/` |
| 5 | CCI des Landes | chambre consulaire | `/presse/` | — |
| 6 | CMA Nouvelle-Aquitaine — Landes | chambre des métiers | `/a-cote-de-chez-vous/actualites` | — |
| 7 | Grand Dax — Couralin | autorité organisatrice de transports | `/connaitre-lagglo/actualite-agenda/` | `/feed/` |
| 8 | Union des Pêcheurs de Capbreton | transport maritime et pêche | `/actualites/` | — |
| 9 | Port de Capbreton — CC MACS | port de pêche et de plaisance | `/actualites/` | `/rss.xml` |
| 10 | Sud Ouest — Landes | presse locale | `/landes/` | `/landes/rss.xml` |
| 11 | ICI Gascogne — Landes 40 | radio locale | `/nouvelle-aquitaine/landes-40` | `/rss/gascogne/rubrique/infos.xml` |
| 12 | Groupe Peixoto | transporteur frigorifique (40) | `/actualites/` | `/feed/` |
| 13 | Transports Brocas | transporteur routier (40) | `/actualites/` | — |

## Limites du contrôle

- `www.cci-landes.fr` (ancien domaine) n'a pas de DNS : le domaine actif est `landes.cci.fr`.
- `/actualites/` sur `landes.cci.fr` renvoie 404 ; la page `presse/` est utilisée. Le flux `/feed/` renvoie 500 et n'est pas retenu.
- `www.landes.fr/agit-au-quotidien/mobilites-et-infrastructures` renvoie 403 (botstopper) : le conseil départemental est écarté.
- Aucun flux RSS n'a été trouvé pour Trans-Landes, RRTL, Movima, la CCI, la CMA, l'UNPC ou Transports Brocas ; leurs pages HTML sont suivies.
- Les médias régionaux (Sud Ouest, ICI, France 3, actu.fr) couvrent les transports dans les Landes sans être strictement départementaux ; Sud Ouest et ICI sont retenus ici pour leurs rubriques 40, avec des exemples d'articles locaux (SNCF Dax–Ychoux, fraude aux cryptomonnaies à Rion-des-Landes).
- Les URL d'exemple cyber sont des articles contextuels (cybersécurité des entreprises landaises, fraude au fret, logistique) et non des incidents subis par chaque organisation listée.

OBJECTIF : atteint — 13 / 5
