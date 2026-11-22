# Sources d'information — secteur transport, département 47 (Lot-et-Garonne)

OBJECTIF : atteint — 22 / 5 sources vérifiées en HTTP 200 pour le couple secteur « transport » / département 47 (Lot-et-Garonne).

## Livrable

- `bench/corpus/sources-transport-47.jsonl` — 22 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-transport-47.json` — 80 URL contrôlées le 2026-11-22 (GET réel, redirections suivies, User-Agent navigateur, timeout 25 s), 80 × 200 ; 22/22 sources valides.
- `db/migrate-171-sources-transport-47.sql` — 22 sources `corpus:transport47-*` en `department='47'`, 80 URL tracées dans `source_verification` en `ok200`. Migration appliquée à la base locale puis rejouée sans doublon (22 sources et 80 traces avant et après le rejeu, `psql_exit=0`).

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | OTRE Lot-et-Garonne | fédération transporteurs routiers (antenne 47, Agen) | `/actualites/` | — |
| 2 | FNTV Nouvelle-Aquitaine — antenne 47 | fédération transports de voyageurs (Agen) | `/actualites-de-la-federation` | — |
| 3 | Union TLF Sud-Ouest | union transport/logistique (liste départementale 47, annuaire) | `/nos-actualites/` | `/feed/` |
| 4 | AFT — délégation Aquitaine Nord | organisme de formation transport (47 cité) | `/actualites` | `/actualites/rss` |
| 5 | ABSKILL / AFTRAL Agen | formation transport/logistique (M.I.N. Agen-Boé) | `/actualites/` | — |
| 6 | Aéroport Agen-La Garenne | infrastructure aéroportuaire (Le Passage, 47) | `/blog/` | `/feed/` |
| 7 | Tempobus / réseau Tempo | transport public urbain et sur réservation (Agen, 44 communes) | `/actualites` | `/rss.xml` |
| 8 | TÉMOB | mobilités durables et station BioGNV (Agen-Boé, 47) | `/temob-actus/` | `/feed/` |
| 9 | Technopole Agen-Garonne | zone logistique et d'activités (47) | `/actualites/` | `/feed/` |
| 10 | Agglomération d'Agen — Transports et Mobilités | autorité organisatrice de la mobilité (47) | `/en-ce-moment/actualites` | — |
| 11 | VINCI Autoroutes A62/A66 | infrastructure autoroutière traversant le 47 | `/fr/actualites/` | — |
| 12 | Aquidem Déménagements | déménageur (Virazeil, 47) | `/category/blog/` | `/feed/` |
| 13 | AMDT Déménagement | déménageur national/militaire (Fourques-sur-Garonne, 47) | `/conseils/` | `/feed/` |
| 14 | Transports C. Guéry | transport frigorifique (Agen, 47) | page transport/logistique | — |
| 15 | Kuehne+Nagel — agence Road Logistics d'Agen | logisticien (Technopole Agen-Garonne, 47) | newsroom `/media-releases/` | `/tagfeed/.../global,trade` |
| 16 | France Express — agence d'Agen | messagerie express dernier kilomètre (47) | `/actualites` | `/rss.xml` |
| 17 | CCI de Lot-et-Garonne | chambre consulaire (Agen, appui transport/logistique) | `/actualites/` | — |
| 18 | CMA Nouvelle-Aquitaine — Lot-et-Garonne | chambre des métiers et de l'artisanat (antenne 47) | `/a-cote-de-chez-vous/actualites` | — |
| 19 | La Dépêche du Midi | presse locale, rubrique Économie/Transports | `/economie/transports/` | `/rss.xml` |
| 20 | Sud Ouest | presse locale, rubrique Transports (édition 47) | `/economie/transports/` | `/economie/transports/rss.xml` |
| 21 | ICI Gascogne | radio/presse locale (édition Lot-et-Garonne) | `/nouvelle-aquitaine/lot-et-garonne-47` | `/rss/gascogne/rubrique/infos.xml` |
| 22 | actu.fr — Le Républicain Lot-et-Garonne | presse locale (47) | `/nouvelle-aquitaine/lot-et-garonne_47` | `/rss.xml` |

La majorité des sources est strictement départementale ou locale ; les fédérations, organismes et médias régionaux ou nationaux (3, 4, 5, 19, 20) couvrent explicitement le 47.

## Limites du contrôle

- `lot-et-garonne.cci.fr` et `tempo47.fr` ne répondent pas (DNS) ; les sites actifs `cci47.fr` et `tempobus.fr` les remplacent.
- Le lien « RSS » de la CCI 47 renvoie du HTML : aucun flux déclaré pour cette source.
- `otre.fr`, `tls47.com`, `tsp47.com` : domaines morts ou détournés ; `otre.org`, `e-tlf.com` et les autres sources retenues sont utilisés à la place.
- PagesJaunes et Kompass renvoient 403 ; l'annuaire professionnel retenu est celui d'Union TLF (`e-tlf.com/annuaire/`, mention explicite du 47).
- Aucun site dédié actif trouvé pour le port fluvial d'Agen : l'information passe par la presse locale, la CCI 47 et VNF.
- L'URL d'article de la FNTV est tronquée sur le site d'origine mais répond 200 ; l'exemple ICI Gascogne porte sur la logistique/distribution (Gifi, Villeneuve-sur-Lot) plutôt que sur un fait de cybersécurité.
- Les crédits Exa se sont épuisés en fin de recherche ; les dernières découvertes ont été faites en parcourant les pages HTML réelles, et toutes les URL retenues ont été vérifiées en HTTP de façon indépendante.

Recherche des organisations du transport dans le Lot-et-Garonne (fédérations et syndicats, chambres consulaires, annuaires professionnels, infrastructures portuaires/aéroportuaires/autoroutières, opérateurs de mobilité, transporteurs et logisticiens locaux, presse locale), lecture des pages publiques pour repérer les rubriques d'actualités et les flux, puis contrôle HTTP de chaque URL retenue (`GET`, redirections suivies, code final, type de contenu et nombre d'items RSS). Aucune URL n'est inventée : toutes proviennent de pages trouvées ou de liens présents dans ces pages.
