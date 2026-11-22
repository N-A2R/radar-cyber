# Couverture des sources « transport » — département 87 (Haute-Vienne)

Relevé du 2026-11-22. Le corpus livré est `bench/corpus/sources-transport-87.jsonl`
(15 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`,
`url_actualites`, `url_flux`, `code_http`, `exemple_cyber`). Empreinte du corpus
consolidé : `39f486ddbb3cc5701b075e7eefacc00d1c9a81926683b0636a96cb7ccb1fa936`.

## Méthode

Recherche web ciblée (annuaires professionnels, chambres consulaires,
fédérations et syndicats, collectivités, opérateurs et presse locale), puis
contrôle GET réel de chaque URL déclarée : `python3
scripts/verif-corpus-transport-87.py` (redirections suivies, User-Agent
navigateur, délai 20 s, comptage des items RSS). Résultat : **15 sources,
53 URLs contrôlées, 53 en HTTP 200, 8 flux RSS actifs**. Rapport détaillé :
`bench/results/verification-transport-87.json`.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| MyTCL — transports en commun de Limoges Métropole | opérateur de transports urbains | https://www.stcl.fr/ | https://www.stcl.fr/actualite-tcl/ | https://www.stcl.fr/feed/ (9 items) |
| Aéroport de Limoges-Bellegarde | opérateur aéroportuaire | https://www.aeroportlimoges.com/ | https://www.aeroportlimoges.com/infos-passagers/actualites | — |
| Roulaud Transports (Limoges) | transporteur routier et logistique | https://www.roulaud.com/ | https://www.roulaud.com/category/actualites/ | https://www.roulaud.com/feed/ (10 items) |
| APAN-Océalim — parc d'activités Limoges Nord | zone logistique | https://apanord.fr/ | https://apanord.fr/actualites/ | https://apanord.fr/feed/ (6 items) |
| FNTR Limousin | fédération des transporteurs routiers | https://www.fntr.fr/limousin | https://www.fntr.fr/taxonomy/fntr-limousin | https://www.fntr.fr/rss.xml (4 items) |
| CFTC Transport du Limousin | syndicat professionnel | https://www.cftc-nouvelle-aquitaine.fr/fiche_de_contact/syndicat-cftc-transport-du-limousin/ | https://www.cftc-nouvelle-aquitaine.fr/type_contact/transports/ | — |
| Limoges Métropole — mobilités | autorité organisatrice de la mobilité | https://www.limoges-metropole.fr/ | https://www.limoges-metropole.fr/informations-transversales/actualites | https://www.limoges-metropole.fr/informations-transversales/actualites/rss (73 items) |
| Le Populaire du Centre — Limoges | presse locale | https://www.lepopulaire.fr/limoges-87000/ | https://www.lepopulaire.fr/economie/transport | — |
| ICI Limousin — Haute-Vienne | radio locale | https://www.ici.fr/radio/limousin | https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87/limoges | https://www.ici.fr/rss/limousin/rubrique/infos.xml (20 items) |
| La Montagne — Limoges | presse locale | https://www.lamontagne.fr/limoges-87000/ | https://www.lamontagne.fr/actualites/ | — |
| Limoges Infos 87 | presse locale | https://www.limogesinfos87.fr/ | https://www.limogesinfos87.fr/actualites.html | — |
| Cyberattaque.org | presse cyber | https://www.cyberattaque.org/ | https://www.cyberattaque.org/type/attaque/ | https://www.cyberattaque.org/feed/ (10 items) |
| France 3 Nouvelle-Aquitaine — Haute-Vienne | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/ | idem | — |
| Conseil départemental 87 — transport scolaire | service départemental | https://www.haute-vienne.fr/nos-actions/deplacement-routes/transport-scolaire-deleves-et-etudiants-en-situation-de-handicap | https://www.haute-vienne.fr/tous-les-actualites-et-evenements | — |
| DREAL Nouvelle-Aquitaine (DDT 87) | administration des transports | https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/ | https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/actualites-r2.html | https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend (10 items) |

## Exemples cyber vérifiés en HTTP 200

- Usurpation de MyTCL sur Facebook : faux abonnements gratuits et données
  bancaires visées — https://www.lepopulaire.fr/limoges-87000/actualites/arnaque-sur-facebook-non-la-societe-de-transports-en-commun-de-limoges-metropole-n-offre-pas-d-abonnements-gratuits_14500861/
- Alerte de Limoges Métropole sur une fausse carte de bus gratuite —
  https://www.lepopulaire.fr/limoges-87000/actualites/limoges-metropole-alerte-sur-une-tentative-d-escroquerie-a-la-carte-de-bus_14546518/
- Cyberattaques contre les PME et TPE de Haute-Vienne (30 à 35 % des victimes
  paient la rançon) — https://www.limogesinfos87.fr/actualite-22011-lutter-contre-le-fleau-des-cyberattaques.html
- Cyberattaques à Limoges : sites de la Ville temporairement coupés —
  https://www.lepopulaire.fr/limoges-87000/faits-divers/cyberattaques-a-limoges-pourquoi-plusieurs-sites-internet-de-la-ville-ont-ete-temporairement-coupes_15067936/
- Climb Up Limoges : 151 000 profils en vente sur le darkweb —
  https://www.cyberattaque.org/climb-up-pres-de-151-000-profils-en-vente-sur-le-darkweb-apres-une-cyberattaque/

## Candidats écartés

- `https://www.ter.sncf.com/nouvelle-aquitaine/se-deplacer/info-trafic` et
  `https://www.ter.sncf.com/nouvelle-aquitaine/` : HTTP 403 (protection anti-bot)
  au GET avec User-Agent navigateur.
- `https://www.limoges.cci.fr/actualites` : HTTP 403, malgré la pertinence de la
  CCI Limoges-Haute-Vienne pour l'aéroport et le fret.
- Préfecture de la Haute-Vienne, DDT 87 (`haute-vienne.gouv.fr`,
  `haute-vienne.developpement-durable.gouv.fr`) : échecs TLS/réseau ; la DREAL
  Nouvelle-Aquitaine, qui couvre la DDT 87, est retenue à leur place.
- CMA Haute-Vienne (`cma-haute-vienne.fr`, `cma87.fr`) et CLCA : noms de domaine
  non résolus ; UNOSTRA : 200 mais sans antenne Limousin identifiable.
- `https://www.cftc-nouvelle-aquitaine.fr/feed/` : HTTP 200 mais zéro item au
  relevé ; `url_flux` laissée vide pour ce syndicat.

Périmètre : MyTCL, l'aéroport, Roulaud, l'APAN-Océalim, la CD87, Limoges
Métropole et la presse locale sont strictement ancrés dans le département 87.
La FNTR Limousin, la CFTC Transport du Limousin et la DREAL Nouvelle-Aquitaine
sont des structures régionales disposant d'une page ou d'un service dédié au
Limousin / à la Haute-Vienne.

## Intégration en base

Migration `db/migrate-171-sources-transport-87.sql` : 15 lignes dans `source`
(`department = '87'`, `region = 'Nouvelle-Aquitaine'`) et 52 traces
`source_verification` en `code_http = 200`, `etat = 'ok200'`. Contrôle en base
locale PostgreSQL : 15 sources `corpus:transport-87-%`, 52 URL distinctes,
52 traces 200.

OBJECTIF : atteint — 15 sources vérifiées en HTTP 200 / 5 sources vérifiées en HTTP 200 pour le couple secteur « transport » / département 87 (Haute-Vienne).
