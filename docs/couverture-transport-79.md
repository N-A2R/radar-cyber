# Couverture — transport / Deux-Sèvres (79)

20 sources d’information du secteur transport dans les Deux-Sèvres, 77 URL contrôlées en HTTP 200 le 2026-11-22.

| Source | Type | Site | Actualités | Flux |
|---|---|---|---|---|
| Tanlib — réseau de transports de Niort Agglo | réseau de transport public (Niort) | https://www.tanlib.com/ | https://www.tanlib.com/actualites/ | — (HTML seul) |
| Transports Landry | transporteur et logisticien (Thouars) | https://landry-transports.fr/ | https://landry-transports.fr/actualites | https://landry-transports.fr/feed |
| Transports GAUTHIER | transport frigorifique et logistique (La Crèche) | https://www.transports-gauthier.com/ | https://www.transports-gauthier.com/actualites/ | — (HTML seul) |
| Conseil Transports 79 — OTRE Poitou-Charentes | organisation professionnelle locale du transport routier (La Crèche) | https://www.ct79.fr/ | https://www.ct79.fr/-Actualites- | https://www.ct79.fr/spip.php?page=backend |
| FNTR — Fédération nationale des transports routiers | fédération professionnelle | https://www.fntr.fr/ | https://www.fntr.fr/espace-presse/actualites-agenda | https://www.fntr.fr/rss.xml |
| FNTV — Fédération nationale des transports de voyageurs | fédération professionnelle | https://fntv.fr/ | https://fntv.fr/actualites-de-la-federation | — (HTML seul) |
| OTRE — Organisation des transporteurs routiers européens | fédération professionnelle (section Poitou-Charentes) | https://www.otre.org/ | https://www.otre.org/actualites/ | https://www.otre.org/feed/ |
| France Logistique | fédération professionnelle de la logistique | https://www.francelogistique.fr/ | https://www.francelogistique.fr/category/news/ | https://www.francelogistique.fr/feed/ |
| Union TLF Sud-Ouest | fédération régionale du transport et de la logistique | https://e-tlf.com/nos-regions/tlf-sud-ouest/ | https://e-tlf.com/nos-actualites/ | https://e-tlf.com/feed/ |
| Transport Info | presse professionnelle transport et logistique | https://www.transportinfo.fr/ | https://www.transportinfo.fr/ | https://www.transportinfo.fr/feed/ |
| Département des Deux-Sèvres | collectivité — routes et transports départementaux | https://www.deux-sevres.fr/ | https://www.deux-sevres.fr/toutes-les-actualites | https://www.deux-sevres.fr/rss.xml |
| Communauté d’agglomération du Niortais | intercommunalité — mobilités et transports | https://www.niortagglo.fr/ | https://www.niortagglo.fr/lagglo/toutes-les-actualites/index.html | https://www.niortagglo.fr/rss.xml |
| Transports en Nouvelle-Aquitaine | service public régional des transports (lignes du 79) | https://transports.nouvelle-aquitaine.fr/ | https://transports.nouvelle-aquitaine.fr/toute-lactualite-des-transports | https://transports.nouvelle-aquitaine.fr/liste-rss/naq_actualite |
| La Nouvelle République — Deux-Sèvres | quotidien régional | https://www.lanouvellerepublique.fr/deux-sevres | https://www.lanouvellerepublique.fr/deux-sevres | https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594 |
| Niort Info | presse locale en ligne | https://niortinfo.media/ | https://niortinfo.media/ | https://niortinfo.media/feed/ |
| ICI Poitou — Radio France | radio publique locale | https://www.ici.fr/radio/poitou | https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79 | https://www.ici.fr/rss/poitou/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine — Deux-Sèvres | télévision publique locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-s%C3%A8vres/rss |
| actu.fr — Deux-Sèvres | presse en ligne | https://actu.fr/deux-sevres/ | https://actu.fr/deux-sevres/ | https://actu.fr/deux-sevres/rss.xml |
| E.Niort | presse locale en ligne | https://eniort.com/ | https://eniort.com/ | https://eniort.com/feed/ |
| Ville de Niort — Vivre à Niort | collectivité — actualités et mobilités | https://www.vivre-a-niort.com/actualites/ | https://www.vivre-a-niort.com/actualites/ | https://www.vivre-a-niort.com/news.xml |

## Ancrage territorial et exemples cyber

Les organisations locales (Tanlib, Transports Landry, Transports GAUTHIER, Conseil Transports 79/OTRE Poitou-Charentes à La Crèche), les collectivités du 79 (Département, Niort Agglo, Ville de Niort) et la presse locale relaient les actualités mobilité, transport routier et sécurité des systèmes d’information. Chaque exemple cité dans le corpus est un titre réellement lu sur la source, accompagné de son URL contrôlée en HTTP 200.

## Méthode, preuves et intégration

Découverte par recherche web ciblée (opérateurs et transporteurs du 79, conseils consulaires, fédérations OTRE/FNTR/FNTV/TLF/France Logistique, annuaires professionnels, presse locale). Chaque URL a été contrôlée par un GET réel avec redirections suivies et User-Agent navigateur : 77 URL, toutes en HTTP 200, avec code, type de contenu, URL finale, octets, durée et items RSS enregistrés.

Candidats écartés après contrôle HTTP : CCI Deux-Sèvres (`www.deux-sevres.cci.fr`, 403 Cloudflare ; `cci79.fr/actualites` 404), préfecture des Deux-Sèvres (`deux-sevres.gouv.fr`, réinitialisation HTTP/2), `pagesjaunes.fr` et `kompass.com` (403), `societe.com/actualites/` (404), `pappers.fr/actualites` (403), `otre.fr` (expiration), `spvtrans.fr/actualites` (404), `fntv79.fr` (DNS inconnu). Aucun flux RSS n’a été inventé : les sources sans flux déclaré proposent une page d’actualités HTML vérifiée.

Corpus : `bench/corpus/sources-transport-79.jsonl` (20 lignes, empreinte recalculée dans `bench/corpus/HASH`).
Rapport : `bench/results/verification-sources-transport-79.json` (77 URL, code HTTP, type de contenu, URL finale, octets, durée, items RSS).
Base : `db/migrate-180-sources-transport-79.sql` (20 sources insérées dans `source`, 77 traces `source_verification`).
