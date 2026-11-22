# Couverture « collectivités » — Vienne (86)

Tranche du 2026-11-22 : **21 sources vérifiées en HTTP 200** pour le couple secteur `collectivites` / département `86` (cible : ≥ 5).

- Corpus : `bench/corpus/sources-collectivites-86.jsonl`
- Preuve HTTP : `bench/results/verification-collectivites-86.json` (57 URL distinctes, 57 en 200)
- Base : `db/migrate-186-sources-collectivites-86.sql` (21 lignes dans `source`, 57 traces dans `source_verification`)
- Empreinte du corpus : `bench/corpus/HASH`

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Conseil départemental de la Vienne | conseil départemental | https://www.lavienne86.fr/ | /fil-infos/actualites | /fil-infos/actualites/rss |
| Services de l'État dans la Vienne | préfecture | https://www.vienne.gouv.fr/ | /Actualites | — |
| Ville de Poitiers | commune | https://www.poitiers.fr/ | /actualites | /rss.xml |
| Grand Poitiers Communauté urbaine | intercommunalité | https://www.grandpoitiers.fr/ | /information-transversale/actualites | /information-transversale/actualites/rss |
| Ville de Châtellerault | commune | https://www.chatellerault.fr/ | /actualites/ | — |
| Ville de La Roche-Posay | commune | https://www.larocheposay.com/ | /systeme/actualites/ | /feed/ |
| Ville de Lusignan | commune | https://lusignan.fr/ | /actualites/ | /feed/ |
| CC Vienne et Gartempe | intercommunalité | https://www.vienneetgartempe.fr/ | /actualites/ | /actualites/feed/ |
| CC du Pays Loudunais | intercommunalité | https://www.pays-loudunais.fr/ | /category/actualites/ | /feed/ |
| AMF 86 | fédération | https://amf86.fr/ | /actualites-de-lassociation/ | /feed/ |
| CCI de la Vienne | consulaire | https://www.poitiers.cci.fr/ | /actualites/ | — |
| Grand Châtellerault | intercommunalité | https://www.grand-chatellerault.fr/ | /vivre/actualites | — |
| La Nouvelle République — Vienne | presse | /vienne | /vienne | API RSS Vienne |
| Centre Presse (Vienne) | presse | /centre-presse | /centre-presse | API RSS Centre Presse |
| La Vienne Rurale (Caracterres) | presse | https://www.caracterres.fr/ | /region/vienne-rurale | /rss.xml |
| Le7.info | presse | https://www.le7.info/ | /actus | /rss.xml |
| ICI Poitou (Radio France) | média | /radio/poitou | /nouvelle-aquitaine/vienne-86 | /rss/poitou/a-la-une.xml |
| France 3 Nouvelle-Aquitaine — Vienne | média | /nouvelle-aquitaine/vienne | identique | /rss |
| Radio Pulsar | média | https://www.radio-pulsar.org/ | identique | /feed/ |
| Actu Vienne (actu.fr) | presse | /pays-de-la-loire/vienne_86/ | identique | — |
| Le Populaire du Centre — Poitiers | presse | /poitiers-86000/ | /actualites/politique | — |

## Exemples cyber observés

- Cyberattaque du 29/08/2025 touchant la Ville de Poitiers, le CCAS et Grand Poitiers : [Le7.info](https://www.le7.info/article/25955-ccas-et-ville-de-poitiers-victimes-dune-cyberattaque), [ICI](https://www.ici.fr/nouvelle-aquitaine/vienne-86/poitiers/les-collectivites-de-poitiers-et-grand-poitiers-victimes-d-une-importante-cyberattaque-7518733), [La Nouvelle République](https://www.lanouvellerepublique.fr/poitiers/vienne-poitiers-et-grand-poitiers-victimes-d-une-cyberattaque-depuis-vendredi-dernier-1756806836).
- Vidéoprotection : indisponibilité temporaire du service de télédéclaration (services de l'État dans la Vienne, 03/11/2026).
- Réunion publique « stop aux arnaques de la rénovation » (CC Vienne et Gartempe, 04/11/2026) : https://www.vienneetgartempe.fr/reunionpubliquehabitat/

## Candidats écartés

- `vienne.fr` : ville de Vienne en Isère (38), pas le département 86.
- `prefectures-regions.gouv.fr/.../Vienne` et `poitiers.maville.com` : HTTP 403 ; remplacés par `vienne.gouv.fr` et les médias locaux en 200.
- `grandpoitiers.fr/actualites/` et `lavienne86.fr/rss.xml` : HTTP 404 ; URLs corrigées dans le corpus.
- `sdis86.net/actualites/` : HTTP 404, SDIS non retenu.
- `chatellerault.fr/feed/` : HTTP 200 mais zéro item ; `url_flux` laissée vide.
- `vienne.cci.fr`, `cma86.fr` : aucune réponse HTTP ; CCI retenue via `poitiers.cci.fr`.

Méthode : découverte via annuaires institutionnels, chambres consulaires, fédérations et presse locale ; chaque URL contrôlée par GET HTTP réel (`curl -L`, User-Agent navigateur, délai 25 s) le 2026-11-22 ; les flux sont contrôlés comme documents XML avec items non vides.
OBJECTIF : atteint — 21 / 5
