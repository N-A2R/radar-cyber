# Couverture « commerce » — Creuse (23)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `commerce` / département `23`.

## Résultat

- **12 sources intégrées** (`bench/corpus/sources-commerce-23.jsonl`, une ligne JSON par source, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- **12 lignes `source`** et **42 lignes `source_verification`** (`code_http = 200`, `etat = 'ok200'`) créées en base par `db/migrate-077-sources-commerce-23.sql`. Toutes portent `department = '23'` et `region = 'Nouvelle-Aquitaine'`.
- Ventilation : 7 sources `cti` (CCI, CMA, collectivités, Creuse Tourisme) et 5 sources `presse` (presse locale, radio, télévision publique).
- Preuve HTTP détaillée : `bench/results/verification-commerce-23.json`.

OBJECTIF : atteint — 12 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CCI de la Creuse | chambre consulaire (CCI) | https://www.cci-creuse.com/category/entreprise/ | https://www.cci-creuse.com/feed/ |
| CMA Nouvelle-Aquitaine — délégation de la Creuse | chambre consulaire (CMA) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| Ville de Guéret — commerces | collectivité | https://www.ville-gueret.fr/pratique/commerces-entreprises-et-marches-publics/ | https://www.ville-gueret.fr/feed/ |
| Grand Guéret — entreprendre et collaborer | collectivité | https://www.agglo-grandgueret.fr/entreprendre-et-collaborer/ | https://www.agglo-grandgueret.fr/feed/ |
| Conseil départemental de la Creuse | collectivité | https://www.creuse.fr/A-la-une | — |
| Creuse Tourisme — blog | office de tourisme | https://www.tourisme-creuse.com/toute-la-creuse/la-creuse-blog-et-actualites/ | — |
| Creuse Tourisme Pro | réseau professionnel | https://pro.tourisme-creuse.com/toutes-les-actualites/ | https://pro.tourisme-creuse.com/feed/ |
| La Montagne — Creuse | presse locale | https://www.lamontagne.fr/info-en-continu/creuse | flux Google News ciblé (200) |
| actu.fr — Actu Creuse | presse locale | https://actu.fr/nouvelle-aquitaine/creuse_23/ | https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml |
| ici Creuse | média public | https://www.ici.fr/nouvelle-aquitaine/creuse-23 | https://www.ici.fr/rss/creuse/a-la-une.xml |
| Le Populaire du Centre — Guéret | presse locale | https://www.lepopulaire.fr/gueret-23000/ | flux Google News ciblé (200) |
| France 3 Nouvelle-Aquitaine — Creuse | média public | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss |

## Exemples cyber vérifiés

- [Audit informatique et sécurité des entreprises — CCI de la Creuse](https://www.cci-creuse.com/audit-informatique-une-demarche-preventive-pour-la-securite-dune-entreprise/)
- [Les artisans, des cibles de choix pour les cybercriminels — CMA Nouvelle-Aquitaine](https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites/les-artisans-des-cibles-de-choix-pour-les-cybercriminels)
- [Arnaque au faux RIB : comment un Creusois a sauvé son entreprise](https://www.wiclic.fr/arnaque-au-faux-rib-comment-un-creusois-a-sauve-son-entreprise/)
- [Arnaques IBAN, RIB, CB : le Crédit Mutuel de Guéret témoigne](https://www.wiclic.fr/arnaques-iban-rib-cb-le-credit-mutuel-gueret-temoigne/)
- [Alerte : fraudes aux réservations — Creuse Tourisme Pro](https://pro.tourisme-creuse.com/alerte-fraudes-aux-reservations-2/)
- [Attaque informatique du site du camping d'Évaux-les-Bains — France 3 Creuse](https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/gueret/le-site-internet-du-camping-de-cette-commune-thermale-victime-d-une-attaque-informatique-il-vante-les-services-d-une-escort-girl-3186765.html)
- [APAJH 23 escroquée de 173 000 € — ici Creuse](https://www.ici.fr/infos/faits-divers-justice/creuse-l-apajh-23-perd-173-000-euros-apres-une-arnaque-au-president-1725610)

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, collectivités, fédérations et presse locale) à partir du corpus Creuse déjà vérifié du dépôt et de l'exploration des sitemaps/pages internes des sites. Chaque URL a été contrôlée par un GET HTTP réel le 2026-11-22 (`curl -L`, user-agent `RadarCyberCorpus/1.0`) ; les candidats en 404 (catégorie « commerce » de la CCI, flux RSS natifs de La Montagne et du Populaire du Centre) ont écarté au profit des pages 200 listées ci-dessus.

OBJECTIF : atteint — 12 / 5
