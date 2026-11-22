# Couverture « collectivités » — Haute-Vienne (87)

Tranche du 2026-11-22 : **21 sources vérifiées en HTTP 200** pour le couple secteur `collectivites` / département `87` (cible : ≥ 5).

- Corpus : `bench/corpus/sources-collectivites-87.jsonl`
- Preuve HTTP : `bench/results/verification-collectivites-87.json` (56 URL distinctes, 56 en 200, 13 flux RSS avec items)
- Base : `db/migrate-187-sources-collectivites-87.sql` (21 lignes dans `source`, 56 traces dans `source_verification`)
- Empreinte du corpus : `bench/corpus/HASH` = `cafe7ce9441d21a57f1176962d1cfa47393dde9be3cb5f2e0e0fdf04f520361f`

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Conseil départemental de la Haute-Vienne | conseil départemental | https://www.haute-vienne.fr/ | /tous-les-actualites-et-evenements | — |
| Limoges Métropole | intercommunalité | https://www.limoges-metropole.fr/ | /informations-transversales/actualites | /informations-transversales/actualites/rss |
| Ville de Saint-Junien | commune | https://www.saint-junien.fr/ | /actualites/ | /feed/ |
| Ville de Couzeix | commune | https://www.couzeix.fr/ | /actualites/ | /actualites/feed/ |
| Ville de Bellac | commune | https://www.bellac.fr/ | /categorie/a-la-une | /feed/ |
| Communauté de communes du Val de Vienne | intercommunalité | https://valdevienne.fr/ | /actualites/ | /feed/ |
| SDIS 87 (pompiers de la Haute-Vienne) | sécurité civile | https://sdis-87.fr/ | /actualites/ | /feed/ |
| Chambre d'agriculture de la Haute-Vienne | consulaire | https://haute-vienne.chambres-agriculture.fr/ | /actualites-1 | — |
| AMF 87 (Association des maires de la Haute-Vienne) | fédération | https://www.amf87.fr/ | /actualites/ | — |
| Commune de Boisseuil | commune | https://boisseuil87.fr/ | /actualite/ | /feed/ |
| Commune de Nexon | commune | https://www.nexon.fr/ | /nos-actualites.html | — |
| Commune de Chaptelat | commune | https://www.chaptelat.fr/ | /index.php/lactualite.html | — |
| Le Populaire du Centre — Haute-Vienne | presse | https://www.lepopulaire.fr/haute-vienne/ | identique | — |
| Le Populaire du Centre — Limoges | presse | https://www.lepopulaire.fr/limoges-87000/ | identique | — |
| Passion Aquitaine (Ouest-France) — Haute-Vienne | presse | https://passion-aquitaine.ouest-france.fr/haute-vienne/ | identique | /haute-vienne/feed/ |
| ICI Limousin — Haute-Vienne | média | https://www.ici.fr/radio/limousin | /nouvelle-aquitaine/haute-vienne-87 | /rss/limousin/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine — Haute-Vienne | média | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne | identique | /rss |
| Actu.fr — Haute-Vienne | presse | https://actu.fr/nouvelle-aquitaine/haute-vienne_87 | identique | /nouvelle-aquitaine/rss.xml |
| Actus Limousin (mesinfos.fr) — Collectivités | presse | https://mesinfos.fr/actus-limousin/collectivites | identique | /actus-limousin/rss.xml |
| 7ALimoges | média | https://www.7alimoges.tv/ | /Actualite_r16.html | /xml/syndication.rss |
| Flash FM — actualités | média | https://www.flashfm.fr/ | /actualites/1 | — |

## Exemples cyber observés

- Arnaque aux SMS sur les colis de Noël visant une commune de la Haute-Vienne (CCAS de Limoges), 07/11/2024 : [France 3 Haute-Vienne](https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/cette-commune-est-victime-de-sms-frauduleux-pour-la-distribution-de-ses-colis-de-noel-3056836.html).
- Arnaque Facebook usurpant la STCLM (transports de Limoges Métropole) : [Le Populaire du Centre](https://www.lepopulaire.fr/limoges-87000/actualites/arnaque-sur-facebook-non-la-societe-de-transports-en-commun-de-limoges-metropole-n-offre-pas-d-abonnements-gratuits_14500861/).
- Piratage du ministère de l'Intérieur : suspect interpellé au nord de Limoges : [ICI Limousin](https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87/le-suspect-du-piratage-du-ministere-de-l-interieur-a-ete-interpelle-en-haute-vienne-au-nord-de-limoges-8877920), [actu.fr](https://actu.fr/nouvelle-aquitaine/limoges_87085/piratage-au-ministere-de-l-interieur-un-homme-de-22-ans-interpelle-pres-de-limoges-et-place-en-garde-a-vue_63592916.html).
- Cyberattaque du service d'identification des bovins et ovins perturbant les éleveurs limousins, 31/12/2024 : [France 3 Haute-Vienne](https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/le-service-d-identification-des-bovins-et-ovins-victime-d-une-cyberattaque-le-travail-des-eleveurs-limousins-perturbe-3084484.html).
- Vidéoprotection et renforcement de la lutte contre la délinquance annoncés à Limoges : [France 3 Haute-Vienne](https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/taper-le-consommateur-au-portefeuille-amendes-renforcees-cameras-supplementaires-lutte-contre-la-delinquance-les-annonces-du-ministre-de-la-securite-a-limoges-3333281.html).
- Revue de presse sur les cybermenaces publiée par la commune de Boisseuil : https://boisseuil87.fr/revue-de-presse/.

## Candidats écartés

- `haute-vienne.gouv.fr` (préfecture) : HTTP 200 au premier contrôle puis connexion réinitialisée en boucle (000) sur toutes les tentatives suivantes ; source et flux écartés du corpus final.
- `limoges.fr/actualites` et `limoges.cci.fr` : HTTP 403 ; Ville de Limoges et CCI de la Haute-Vienne non retenues.
- `lanouvellerepublique.fr/haute-vienne` : HTTP 403 ; non retenue.
- `mesinfos.fr/actus-limousin` : HTTP 403 ; seule la page `/collectivités` (200) est retenue.
- `amf87.fr/feed/` : HTTP 200 mais document HTML PrestaShop sans item RSS ; `url_flux` laissée vide.
- `haute-vienne.gouv.fr/syndication/flux/rss_feed_69` : flux instable (200 puis 000) ; non retenu.

Méthode : découverte via annuaires institutionnels, sites officiels, chambres consulaires, fédérations et presse locale ; chaque URL contrôlée par GET HTTP réel (`curl -L`, User-Agent navigateur, retries, délai 25 s) le 2026-11-22 ; les flux sont contrôlés comme documents XML avec items non vides.

OBJECTIF : atteint — 21 / 5
