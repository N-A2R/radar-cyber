# Couverture « energie-eau » — Corrèze (19)

21 sources vérifiées, 49 URLs distinctes contrôlées en HTTP 200 le 2026-11-22
(sites, pages d'actualités et flux RSS/Atom). Aucune URL en échec retenue.

Corpus : `bench/corpus/sources-energie-eau-19.jsonl` — preuve HTTP :
`bench/results/verification-energie-eau-19.json` — intégration :
`db/migrate-065-sources-energie-eau-19.sql` (ids `corpus:e19-*`, `department='19'`).

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Conseil départemental de la Corrèze | collectivité territoriale | /la-correze-en-1-clic/actualites-en-direct | /rss (10 items) |
| Services de l'État en Corrèze | administration départementale | /actualites | — |
| Agglo de Brive — Bassin de Brive | communauté d'agglomération | /about/actualites/ | /feed/ (10 items) |
| Tulle agglo | communauté d'agglomération | /lagglo/actualites/ | /feed/ (2 items) |
| FDEE 19 | syndicat départemental d'énergie | /actualites-fdee-19 | — |
| SMEM — eaux du Maumont | syndicat mixte d'eau | /actualités | — |
| DREAL Nouvelle-Aquitaine | administration régionale | spip.php?page=liste-actualites | spip.php?page=backend-actu (176 items) |
| CMA Nouvelle-Aquitaine — Corrèze | chambre consulaire | /a-cote-de-chez-vous/actualites | — |
| Enedis | distributeur d'électricité | /presse | — |
| GRDF | distributeur de gaz | justdecarb.grdf.fr | Google Actualités GRDF (66 items) |
| SUEZ — Bassin de Brive | opérateur privé de l'eau | /fr/news | — |
| FP2E | fédération professionnelle | /actualites/ | /feed/ (2 items) |
| CIEau | centre de ressources sur l'eau | /categorie/actualite-de-eau/ | /feed/ (10 items) |
| Pro-RGE — Corrèze | annuaire professionnel | — | — |
| Recours France — énergie et eau (19) | annuaire professionnel | — | — |
| La Montagne — Corrèze | presse locale | /brive-la-gaillarde-19100/ | Google Actualités filtré (100 items) |
| Sud Ouest — Corrèze | presse locale | /correze/ | /correze/rss.xml (20 items) |
| ici Corrèze — ICI Limousin | radio/presse locale | /correze-19/actu | /rss/limousin/rubrique/infos.xml (20 items) |
| actu.fr — Tulle | presse locale | /tulle_19272/ | /rss.xml (30 items) |
| La Vie Corrézienne | presse locale | /actualites-actualites.html | — |
| Radio Totem | radio locale | /info | — |

## Exemples cyber associés

Le champ `exemple_cyber` s'appuie sur des articles vérifiés en HTTP 200 :
protection du réseau électrique face aux menaces russes (Sud Ouest, 28/09/2026),
failles de l'eau potable et de l'électricité (cyberattaque.org, 14/10/2026),
fuite de 55 000 contrats d'eau (Eau Cœur d'Essonne, 08/10/2026), fuite de
données clients SUEZ (20/08/2026), piratage de compteurs Linky (Zataz),
revendication cyber visant la supervision d'un service de l'eau (Zataz),
arnaque aux factures d'eau (BFMTV, 22/09/2025) et démarchages frauduleux
usurpant Enedis.

## Candidats écartés

- CCI Corrèze (`correze.cci.fr`) : HTTP 403 (challenge anti-bot), retenté avec User-Agent navigateur.
- Kompass « Eau et énergie — Corrèze » : HTTP 403.
- `https://www.correze.fr/actualites` : HTTP 404 ; la page réelle est `/la-correze-en-1-clic/actualites-en-direct`.
- RSS propriétaires de La Montagne (`/rss.xml`, `/rss/`, `/rss/actualites.xml`) : HTTP 404 ; flux Google Actualités filtré `site:lamontagne.fr Corrèze` retenu.
- `https://www.syndicat-eau-auvezere.fr/` : nom de domaine non résolu.
- `https://www.syndicat-eau-maumont.com/feed.xml` : HTTP 404 (site Wix sans flux).
- `https://www.haute-correze.fr/` : HTTP 200 mais site « en reconstruction », sans actualités identifiables.
- `https://www.ici.fr/nouvelle-aquitaine/correze-19/rss` : HTTP 404 ; flux ICI Limousin retenu.

## Méthode

Recherche web (Google Actualités, moteurs web, annuaires consulaires et
professionnels, sites officiels), identification des pages d'actualités et des
flux, puis contrôle GET de chaque URL avec User-Agent navigateur et suivi des
redirections (22 s maximum). Le contenu des flux est vérifié (nombre d'items).
Seules les sources dont toutes les URLs ont répondu 200 ont été intégrées au
corpus et à la base.
