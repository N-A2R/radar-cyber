# Couverture — sources « numerique » de la Creuse (23)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **15 sources en HTTP 200**, 43 contrôles HTTP tous en 200 (sites, pages d’actualités, flux et articles d’exemple), le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| ALIPTIC — association limousine des professionnels du numérique | association professionnelle du numérique | https://www.aliptic.net/ | https://www.aliptic.net/actualites.html | — |
| French Tech Limousin | réseau French Tech (Limousin / Creuse) | https://www.lafrenchtech-limousin.com/ | https://www.lafrenchtech-limousin.com/actualites.html | — |
| Dorsal — l’actu du numérique en Limousin | service public du numérique (réseau Limousin) | https://www.dorsal.fr/ | https://www.dorsal.fr/actu-numerique-limousin/ | https://www.dorsal.fr/feed/ |
| La Quincaillerie.tl — tiers-lieu numérique de Guéret | tiers-lieu numérique / fab lab | https://www.laquincaillerie.tl/ | https://www.laquincaillerie.tl/actualite/ | https://www.laquincaillerie.tl/feed/ |
| Wiclic — informatique et cybersécurité à Guéret | entreprise de services numériques (ESN) | https://www.wiclic.fr/ | https://www.wiclic.fr/category/actualites-informatiques/ | https://www.wiclic.fr/feed/ |
| Cybernettic — agence web en Creuse | agence web / informatique | https://www.cybernettic.fr/ | https://www.cybernettic.fr/-ACTUALITES-BLOG- | https://www.cybernettic.fr/spip.php?page=backend |
| Creuse — territoire d’actions pour un numérique inclusif | dispositif départemental d’inclusion numérique | https://e-inclusion.creuse.fr/ | https://e-inclusion.creuse.fr/evenements/ | — |
| NATHD — réseau très haut débit Nouvelle-Aquitaine | syndicat mixte fibre / réseau très haut débit | https://nathd.fr/ | https://nathd.fr/category/evenement/ | https://nathd.fr/feed/ |
| CMA Creuse — Chambre de métiers et de l’artisanat | chambre consulaire (artisanat / numérique) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-creuse | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| Conseil départemental de la Creuse | collectivité départementale — numérique et fibre | https://www.creuse.fr/ | https://www.creuse.fr/A-la-une | https://www.creuse.fr/rss/actus.rss |
| Ville de Guéret — La Quincaillerie numérique | collectivité communale — tiers-lieu numérique | https://www.ville-gueret.fr/ | https://www.ville-gueret.fr/actualites/ | — |
| ici Creuse — Radio France | radio publique locale | https://www.ici.fr/radio/creuse | https://www.ici.fr/radio/creuse/actu | https://www.ici.fr/rss/creuse/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine — Creuse | télévision publique régionale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/ | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/ | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss |
| La Montagne — rubrique Numérique (édition Creuse) | presse quotidienne régionale | https://www.lamontagne.fr/creuse/ | https://www.lamontagne.fr/actualites/numerique | — |
| actu.fr — Actu Creuse | presse locale numérique | https://actu.fr/nouvelle-aquitaine/creuse_23/ | https://actu.fr/nouvelle-aquitaine/creuse_23/ | https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml |

Toutes ces organisations sont ancrées dans la Creuse (23) ou couvrent le département : ALIPTIC, French Tech Limousin, Dorsal et NATHD sont des réseaux numériques du Limousin/Nouvelle-Aquitaine auxquels participent les acteurs creusois ; La Quincaillerie.tl, Wiclic, Cybernettic et le dispositif e-inclusion sont basés à Guéret ou pilotés par le CD23 ; la CMA Creuse, la Ville de Guéret et le Département relaient l’actualité numérique locale ; quatre médias locaux couvrent le département.

## Exemples cyber associés

Le champ `exemple_cyber` s’appuie sur des articles vérifiés en HTTP 200 : arnaque au faux RIB touchant une entreprise creusoise, témoignage du Crédit Mutuel de Guéret sur les arnaques IBAN/RIB/CB, escroquerie au président contre l’APAJH 23 (173 000 €), détournement du site du camping d’Évaux-les-Bains, alerte aux fraudes de réservations du tourisme creusois et arnaque bancaire contre un gîte de Creuse.

## Méthode et intégration

Découverte par recherche web, annuaires professionnels, sites d’organisations et presse locale, puis identification des pages d’actualités et des flux. Chaque URL a été contrôlée par un GET `curl -L` avec User-Agent navigateur et suivi des redirections ; les 43 URL sont en HTTP 200.

Corpus : `bench/corpus/sources-numerique-23.jsonl` (15 lignes, empreinte recalculée dans `bench/corpus/HASH`).
Preuve HTTP : `bench/results/verification-numerique-23.json` (43 codes HTTP).
Base : `db/migrate-082-sources-numerique-23.sql` insère 15 lignes dans `source` (parser pointant vers le corpus) et 15 traces `source_verification` en état `ok200`.
