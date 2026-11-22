# Couverture bâtiment — Haute-Vienne (87)

Corpus vérifié le 2026-11-22 : **19 sources**, **56 URLs** (sites, pages d'actualités et flux) toutes en HTTP 200.

- Corpus : `bench/corpus/sources-batiment-87.jsonl`
- Preuve HTTP détaillée : `bench/results/verification-sources-batiment-87.json`
- Migration : `db/migrate-190-sources-batiment-87.sql`

## Sources

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Sud Ouest Limoges / Haute-Vienne | presse | https://www.sudouest.fr/haute-vienne/limoges/ | https://news.google.com/rss/search?q=site%3Asudouest.fr%2Fhaute-vienne%20Limoges&hl=fr&gl=FR&ceid=FR%3Afr |
| Le Populaire du Centre | presse | https://www.lepopulaire.fr/haute-vienne/ | https://news.google.com/rss/search?q=site%3Alepopulaire.fr%20Limoges%20%22Haute-Vienne%22&hl=fr&gl=FR&ceid=FR%3Afr |
| actu.fr Limoges / Haute-Vienne | presse | https://actu.fr/nouvelle-aquitaine/haute-vienne_87 | https://actu.fr/limoges/rss.xml |
| ICI Limousin / ICI Limoges | radio | https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87/limoges | https://www.ici.fr/rss/limousin/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine – Limousin/Haute-Vienne | télévision | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne | https://news.google.com/rss/search?q=site%3Afrance3-regions.franceinfo.fr%20Limoges&hl=fr&gl=FR&ceid=FR%3Afr |
| Limoges Métropole | collectivité | https://www.limoges-metropole.fr/informations-transversales/actualites | https://www.limoges-metropole.fr/informations-transversales/actualites/rss |
| Annonces-legales.fr – Haute-Vienne | JAL | https://www.annonces-legales.fr/consultation/nouvelle-aquitaine/haute-vienne-87 | https://news.google.com/rss/search?q=%22annonces%20l%C3%A9gales%22%20%22Haute-Vienne%22&hl=fr&gl=FR&ceid=FR%3Afr |
| Union & Territoires (JAL Haute-Vienne) | JAL/presse | https://www.terredactu.com/visualiser-les-al | https://www.terredactu.com/rss.xml |
| Ville de Saint-Junien | collectivité | https://www.saint-junien.fr/actualites/ | https://www.saint-junien.fr/feed/ |
| CAPEB Haute-Vienne | organisation professionnelle | https://www.capeb.fr/haute-vienne/actualites | https://news.google.com/rss/search?q=CAPEB+Haute-Vienne&hl=fr&gl=FR&ceid=FR:fr |
| ACPresse — rubrique Haute-Vienne (87), presse professionnelle de la construction | presse professionnelle du bâtiment et de la construction | https://www.acpresse.fr/category/territoires/nouvelle-aquitaine/haute-vienne/ | https://www.acpresse.fr/category/territoires/nouvelle-aquitaine/haute-vienne/feed/ |
| CMA Nouvelle-Aquitaine - Haute-Vienne (Limoges) | chambre consulaire | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | https://news.google.com/rss/search?q=%22CMA+Haute-Vienne%22&hl=fr&gl=FR&ceid=FR:fr |
| CAUE 87 (Conseil d'Architecture, d'Urbanisme et de l'Environnement de la Haute-Vienne) | association professionnelle | https://www.caue87.fr/actualites/ | https://www.caue87.fr/feed/ |
| Qualibat | organisme de qualification et certification du bâtiment | https://www.qualibat.com/actualites | https://news.google.com/rss/search?q=%22Qualibat%22&hl=fr&gl=FR&ceid=FR:fr |
| BTP CFA 87 Limoges (BTP CFA Nouvelle-Aquitaine) | centre de formation d'apprentis du bâtiment | https://www.btpcfa-na.fr/actualites/ | https://www.btpcfa-na.fr/feed/ |
| Odéys - cluster construction et aménagement durables (antenne Limoges) | cluster professionnel | https://www.odeys.fr/actualites | https://news.google.com/rss/search?q=%22Od%C3%A9ys%22&hl=fr&gl=FR&ceid=FR:fr |
| France Rénov' (service public de la rénovation de l'habitat) | service public | https://france-renov.gouv.fr/actualites | https://news.google.com/rss/search?q=%22France+R%C3%A9nov%22+Haute-Vienne&hl=fr&gl=FR&ceid=FR:fr |
| Guichet Habitat de Limoges Métropole (France Rénov') | service public de la rénovation de l'habitat | https://guichet-habitat.limoges-metropole.fr/informations-transversales/actualites | https://news.google.com/rss/search?q=%22Guichet+Habitat%22+Limoges&hl=fr&gl=FR&ceid=FR:fr |
| Placéco — actualités économiques de la Haute-Vienne (87) | presse économique locale | https://www.placeco.fr/haute-vienne/ | https://news.google.com/rss/search?q=%22Plac%C3%A9co%22+Haute-Vienne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr |

## Non retenus après vérification

- `www.limoges.fr` et `www.limoges.cci.fr` : 403 (Cloudflare).
- `www.haute-vienne.gouv.fr` : `ENHANCE_YOUR_CALM` / code 000 au contrôle final (retiré du corpus malgré un 200 observé plus tôt).
- `www.ffbatiment.fr` : 500 ; `pro-rge.fr/actualites/` : 404.
- Intégration en base : migration appliquée en PostgreSQL local — `INSERT 0 19` sources et `INSERT 0 57` vérifications ; contrôle SQL : 19 sources `Source du corpus — 87` avec `department='87'`, 57 vérifications en `code_http=200`.
- Empreinte du corpus recalculée : `bffc8c099cc627700ec4d3a8ba78026790e155e996f51edca8bf60bacf5e7ce9`.

## Vérification

Chaque URL a été relevée en GET avec redirection, User-Agent navigateur, type MIME et nombre d'octets. 56/56 URLs en 200, 0 anomalie.
Des exemples cyber datés figurent dans le champ `exemple_cyber` du corpus.
OBJECTIF : atteint — 19 / 5
