# Sources d'information — secteur transport, département 33 (Gironde)

OBJECTIF : atteint — 15 / 5 sources vérifiées en HTTP 200 pour le couple secteur « transport » / département 33 (Gironde).

## Livrable

- `bench/corpus/sources-transport-33.jsonl` — 15 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-transport-33.json` — 56 URL contrôlées le 2026-11-22 (`curl -L`, redirections suivies, User-Agent navigateur), 56 × 200 ; 15/15 sources valides (55 URL uniques, le site et la page actualités d'ICI Gironde étant identiques).
- `scripts/verif-corpus-transport-33.py` — rejoue le contrôle : `python3 scripts/verif-corpus-transport-33.py` régénère le rapport ci-dessus.
- `db/migrate-171-sources-transport-33.sql` — 15 sources `corpus:transport33-*` en `department='33'`, 55 URL uniques tracées dans `source_verification` en `ok200`. Migration appliquée dans le PostgreSQL local du projet (`radar-cyber-db-1`, port 5433) puis rejouée sans doublon (15 sources / 55 traces avant et après).
- `bench/corpus/HASH` régénéré après ajout du corpus : `f0cab4e8756229450160e91f21235260d34337ff954c24dfd62815b0b2901659`.

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | Grand Port Maritime de Bordeaux | port public, fret et logistique (33) | `/fil-dactualite/` | `/feed/` |
| 2 | Bordeaux Aéroport (Bordeaux-Mérignac) | opérateur aéroportuaire (33) | `/laeroport/presse/communiques-presse` | — |
| 3 | Union Maritime et Portuaire de Bordeaux (UMPBX) | fédération maritime et portuaire (33) | `/actualites/` | `/feed/` |
| 4 | Transports Bordeaux Métropole (TBM) | opérateur de transports publics (33) | `/fr/toutes-les-actualites` | `/fr/rss.xml` |
| 5 | Conseil départemental de la Gironde — Inforoutes | collectivité, information routière (33) | `/les-mobilites/inforoutes-les-travaux-sur-nos-routes` | — |
| 6 | Bordeaux Métropole — Se Déplacer | autorité métropolitaine des mobilités (33) | `/actualites-se-deplacer` | `/rss.xml` |
| 7 | AETL — Antenne de Bordeaux | association professionnelle formation transport/logistique (33) | `/antennes/18-bordeaux/articles/` | — |
| 8 | Union TLF Sud-Ouest | fédération régionale transport et logistique (33) | `/nos-actualites/` | `/feed/` |
| 9 | Transports Nouvelle-Aquitaine | autorité régionale TER et cars (33) | `/toute-lactualite-des-transports` | `/liste-rss/naq_actualite` |
| 10 | Sud Ouest — Transports | presse quotidienne régionale (33) | `/economie/transports/` | `/economie/transports/rss.xml` |
| 11 | Rue89 Bordeaux — Transports | presse locale en ligne (33) | `/tag/transports/` | `/tag/transports/feed/` |
| 12 | actu.fr — Gironde | presse locale en ligne (33) | `/bordeaux/dernieres-actus` | — |
| 13 | ICI Gironde | radio publique locale (33) | `/nouvelle-aquitaine/gironde-33/actu` | `/rss/gironde/rubrique/infos.xml` |
| 14 | L'Échoppe — Transports Bordeaux | presse locale en ligne (33) | `/dossier/transports-bordeaux/` | `/rss.xml` |
| 15 | Voxlog — Bordeaux logistique | presse spécialisée transport/logistique (33) | `/recherche/Bordeaux/` | `/rss.php` |

## Limites du contrôle

- CCI Bordeaux Gironde et Sud Gironde Mobilités renvoient HTTP 403 au sondage : exclues malgré leur couverture transport du département.
- `www.tbm.fr` est un fabricant de machines à bois, pas le réseau de transports : le réseau TBM est `infotbm.com`.
- `bordeaux.port.fr`, `bordeaux-merignac.aeroport.fr` et `gironde.cci.fr` ne résolvent pas depuis cet hôte ; les domaines officiels actuels (`bordeaux-port.fr`, `bordeaux.aeroport.fr`) ont été retenus.
- Le flux `e-tlf.com/feed/` répond 200 mais ne contient pas d'item ; la page `/nos-actualites/` reste le point d'entrée exploitable.
- `actu.fr/bordeaux/` renvoie 403 ; la rubrique Gironde et `/bordeaux/dernieres-actus` répondent 200 et ont été retenues.
- Le corpus transport Nouvelle-Aquitaine de la PR #389 ne porte pas de champ `departement` ; celui-ci est spécifique au couple transport / 33.
