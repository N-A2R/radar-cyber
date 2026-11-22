# Couverture — sources « numerique » de la Dordogne (24)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **12 sources en HTTP 200**, 37 contrôles HTTP positifs sur 42 URL testées, le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Digital Valley — accompagnement des projets numériques et de l'innovation en Dordogne | réseau d'accompagnement des projets numériques et des start-ups | https://digital-valley.fr/ | https://digital-valley.fr/actualites-innovation-digital-dordogne/ | https://digital-valley.fr/feed/ |
| French Tech Périgord | réseau French Tech — start-ups et entreprises innovantes du Périgord | https://frenchtechperigord.fr/ | https://frenchtechperigord.fr/actualites/ | https://frenchtechperigord.fr/feed/ |
| CCI Dordogne — Chambre de commerce et d'industrie | chambre consulaire (commerce, défis numériques des entreprises) | https://dordogne.cci.fr/ | https://dordogne.cci.fr/actualites/ | https://dordogne.cci.fr/feed/ |
| CPME 24 — Confédération des petites et moyennes entreprises de Dordogne | fédération patronale départementale (aides à la transition numérique) | https://cpme24.org/ | https://cpme24.org/actualite-de-la-cpme-24/ | https://cpme24.org/feed/ |
| CMA Dordogne — Chambre des métiers et de l'artisanat (CMA Nouvelle-Aquitaine) | chambre consulaire (artisanat, innovation et transformation numérique) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-dordogne | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| NATHD — Nouvelle-Aquitaine Très Haut Débit (Dordogne-Périgord) | syndicat mixte fibre / réseau très haut débit | https://nathd.fr/ | https://nathd.fr/category/evenement/ | https://nathd.fr/feed/ |
| Grand Périgueux — actualités de l'agglomération | collectivité — actualités numériques et incubateur Digital Valley | https://www.grandperigueux.fr/ | https://www.grandperigueux.fr/actualites/ | — |
| Réussir le Périgord — hebdomadaire d'informations de Dordogne | presse locale départementale | https://www.reussirleperigord.fr/ | https://www.reussirleperigord.fr/actualite | — |
| Dordogne Libre | presse locale hebdomadaire (Périgueux) | https://www.dordognelibre.fr/ | https://www.dordognelibre.fr/ | https://www.dordognelibre.fr/rss.xml |
| actu.fr — Actu Dordogne | presse locale numérique | https://actu.fr/nouvelle-aquitaine/dordogne_24/ | https://actu.fr/nouvelle-aquitaine/dordogne_24/ | https://actu.fr/nouvelle-aquitaine/dordogne_24/rss.xml |
| ici Périgord — Radio France | radio publique locale | https://www.ici.fr/radio/perigord | https://www.ici.fr/radio/perigord/actu | https://www.ici.fr/rss/perigord/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine — Dordogne | télévision publique régionale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss |

Toutes ces sources sont ancrées dans la Dordogne (24) ou couvrent le département. Digital Valley, French Tech Périgord, la CCI, la CPME, la CMA et le Grand Périgueux relaient l'écosystème numérique périgourdin (transformation des entreprises, incubateur de start-ups, aides numériques, innovation artisanale). NATHD couvre le très haut débit du territoire Dordogne-Périgord. Les quatre médias locaux complètent la veille d'actualité départementale.

## Exemples cyber associés

Le champ `exemple_cyber` s'appuie sur des articles vérifiés en HTTP 200 : piratage du site du SMCTOM à Bussac, indisponibilité de services de la Fédération des chasseurs de Dordogne, alerte au faux message de la communauté de communes Vallée Dordogne Forêt Bessède, information de Novabio (laboratoires de Dordogne), piratage de Radio Liberté FM à Ribérac (Dordogne Libre) et arnaque au camping-car à Périgueux (ici Périgord).

## Méthode et intégration

Découverte par recherche web, sites d'organisations, annuaires et presse locale, puis identification des pages d'actualités et des flux RSS. Chaque URL a été contrôlée par un GET `curl -L` avec User-Agent navigateur et suivi des redirections. Cinq URL ont été écartées : deux redirections bloquantes sur Sud Ouest (302), deux pages La Vie Economique en 404 et un article ici.fr périmé (404). Les 42 contrôles et leurs codes sont consignés dans `bench/results/verification-numerique-24.json`.

Corpus : `bench/corpus/sources-numerique-24.jsonl` (12 lignes, empreinte recalculée dans `bench/corpus/HASH`).
Base : `db/migrate-096-sources-numerique-24.sql` insère 12 lignes dans `source` (parser pointant vers le corpus) et 12 traces `source_verification` en état `ok200`.
