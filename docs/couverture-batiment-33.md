# Couverture « bâtiment » — Gironde (33)

18 sources vérifiées, 33 URLs distinctes contrôlées en HTTP 200 le 2026-11-22
(sites, pages d'actualités et flux RSS/Atom). Aucune URL en échec retenue.

Corpus : `bench/corpus/sources-batiment-33.jsonl` — preuve HTTP :
`bench/results/verification-sources-batiment-33.json` — intégration :
`db/migrate-093-sources-batiment-33.sql` (ids `corpus:batiment-33-*`,
`department='33'`).

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CAPEB Gironde — section départementale du bâtiment | syndicat professionnel du bâtiment | https://www.capeb.fr/gironde/actualites | — |
| CMA Nouvelle-Aquitaine — chambre des métiers et de l'artisanat (Gironde 33) | chambre des métiers et de l'artisanat | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Gironde | — |
| Pro-RGE — entreprises RGE en Gironde (33) | annuaire professionnel public (artisans RGE) | https://pro-rge.fr/entreprises/gironde-33/ | — |
| Annuaire des artisans — Gironde (33) | annuaire d'artisans du bâtiment | https://annuaire-des-artisans.fr/actualites/ | — |
| Societe.com — entreprises de la Gironde (33) | annuaire d'entreprises | https://blog.societe.com/ | — |
| Préfecture de la Gironde — services de l'État (urbanisme et construction) | administration (DDTM, urbanisme et construction) | https://www.gironde.gouv.fr/Actualites | — |
| Conseil départemental de la Gironde — habitat et logement | collectivité (habitat, logement) | https://www.gironde.fr/actualites | — |
| Bordeaux Métropole — urbanisme, travaux et habitat | intercommunalité (travaux, urbanisme) | https://www.bordeaux-metropole.fr/actualites | https://www.bordeaux-metropole.fr/rss.xml |
| Ville de Bordeaux — actualités (urbanisme, habitat) | collectivité (urbanisme, habitat) | https://www.bordeaux.fr/rss.xml | https://www.bordeaux.fr/rss.xml |
| ICI Gironde — Radio France | radio et presse locale | https://www.ici.fr/radio/gironde/actu | https://www.ici.fr/rss/gironde/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine — Gironde | télévision publique locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/rss |
| actu.fr — Bordeaux (33) | presse en ligne locale | https://actu.fr/nouvelle-aquitaine/bordeaux_33063/ | — |
| 20 Minutes Bordeaux | presse quotidienne locale | https://www.20minutes.fr/bordeaux/ | — |
| BFM Bordeaux | presse en ligne locale | https://www.bfmtv.com/bordeaux/ | — |
| Qualibat — certification et annuaire des entreprises du bâtiment | organisme de certification et annuaire professionnel | https://www.qualibat.com/actualites | — |
| Artisanat.fr — magazine d'actualités de l'artisanat (CMA) | réseau consulaire et magazine d'actualités des artisans | https://www.artisanat.fr/magazine/actus | — |
| SiteArtisan — annuaire des artisans | annuaire d'artisans du bâtiment | https://www.siteartisan.fr/blog/ | https://www.siteartisan.fr/blog/feed.xml |
| Artisans Réunis — artisans de Gironde (33) | réseau d'artisans et annuaire départemental | https://artisansreunis.fr/blog | — |

## Mesure rejouable

```sh
jq -s '[.[] | select(.secteur=="bâtiment" and .departement=="33" and .code_http==200)] | length' bench/corpus/sources-batiment-33.jsonl
jq -r '"\(.urls_200)/\(.urls_verifiees)"' bench/results/verification-sources-batiment-33.json
```

Résultat : `18` sources et `33/33` URLs en HTTP 200, 0 anomalie.

OBJECTIF : atteint — 18 / 5 sources vérifiées en HTTP 200 pour le couple secteur « bâtiment » / département 33 (Gironde).
