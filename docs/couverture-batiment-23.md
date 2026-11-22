# Couverture « bâtiment » — Creuse (23)

19 sources du secteur `bâtiment` pour le département 23, vérifiées en HTTP 200 le 2026-11-22 ; 43 URL distinctes contrôlées, toutes en HTTP 200, 0 anomalie.

Corpus : `bench/corpus/sources-batiment-23.jsonl` — preuve HTTP :
`bench/results/verification-sources-batiment-23.json` — intégration :
`db/migrate-090-sources-batiment-23.sql` (19 sources, ids `corpus:batiment-23-*`, `department='23'`).

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CAPEB Creuse — section départementale du bâtiment | syndicat professionnel du bâtiment | https://www.capeb.fr/creuse/actualites | — |
| CAUE 23 — Conseil d'architecture, d'urbanisme et de l'environnement de la Creuse | conseil architecture/urbanisme | https://www.caue23.fr/actualite/ | https://www.caue23.fr/feed/ |
| CMA Nouvelle-Aquitaine — chambre des métiers et de l'artisanat (Creuse 23) | chambre des métiers et de l'artisanat | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Creuse | — |
| Préfecture de la Creuse — services de l'État (urbanisme et construction) | administration (DDT, urbanisme et construction) | https://www.creuse.gouv.fr/Actualites | — |
| Conseil départemental de la Creuse — habitat et logement | collectivité (habitat, logement) | https://www.creuse.fr/A-la-une | — |
| Ville de Guéret — actualités urbanisme et habitat | collectivité (urbanisme, habitat) | https://www.ville-gueret.fr/actualites/ | https://www.ville-gueret.fr/feed/ |
| Agglomération Grand Guéret — actualités travaux et urbanisme | intercommunalité (travaux, urbanisme) | https://www.agglo-grandgueret.fr/lagglo/actualites/ | https://www.agglo-grandgueret.fr/feed/ |
| Societe.com — entreprises de la Creuse (23) | annuaire d'entreprises | https://blog.societe.com/ | — |
| Artisan Guide — artisans en Creuse (23) | annuaire d'artisans du bâtiment | https://artisan.guide/blog/ | — |
| Artizo — artisans dans la Creuse | annuaire d'artisans | https://www.artizo.fr/blog/ | https://www.artizo.fr/blog/feed.xml |
| Le vrai artisan — annuaire des artisans qualifiés de la Creuse | annuaire d'artisans qualifiés | https://levraiartisan.fr/les-conseils-de-maitre-payen/ | https://levraiartisan.fr/feed/ |
| 7monartisan — artisans dans la Creuse (23) | annuaire d'artisans | https://7monartisan.fr/blog | — |
| Omizi — entreprises de bâtiment en Creuse (23) | plateforme de devis bâtiment | https://omizi.com/blog | — |
| Artisans Réunis — artisans de la Creuse (23) | réseau d'artisans | https://artisansreunis.fr/magazine | — |
| La Montagne — Creuse | presse quotidienne locale | https://www.lamontagne.fr/creuse/economie | — |
| actu.fr — Actu Creuse | presse en ligne locale | https://actu.fr/nouvelle-aquitaine/creuse_23/ | https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml |
| ICI Creuse — Radio France | radio et presse locale | https://www.ici.fr/radio/creuse/actu | https://www.ici.fr/rss/creuse/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine — Creuse | télévision publique locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss |
| Le Populaire du Centre — Guéret (23000) | presse quotidienne locale | https://www.lepopulaire.fr/gueret-23000/ | — |

## Mesure reproductible

```sh
jq -s '[.[] | select(.secteur=="bâtiment" and .departement=="23" and .code_http==200)] | length' bench/corpus/sources-batiment-23.jsonl
jq '.urls_verifiees, .urls_200' bench/results/verification-sources-batiment-23.json
jq '.anomalies | if type=="array" then length else . end' bench/results/verification-sources-batiment-23.json
```

Résultat rejoué le 2026-11-22 : `19` sources en HTTP 200, `43/43` URLs vérifiées en 200, `0` anomalie. Cible : 5 sources vérifiées (PR #498).

OBJECTIF : atteint — 19 / 5
