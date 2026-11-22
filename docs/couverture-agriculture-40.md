# Couverture — sources « agriculture » des Landes (40)

15 sources vérifiées en HTTP 200 le 2026-11-22 (30 URLs contrôlées, dont 3 flux RSS exploitables).

| Source | Type | Site | Actualités / flux |
| --- | --- | --- | --- |
| FDSEA des Landes | syndicat agricole | http://fdsea40.sacea.fr/ | http://fdsea40.sacea.fr/ (la page d'accueil est le fil d'actualités) |
| MODEF 40 | syndicat agricole | https://www.modef40.fr/ | https://www.modef40.fr/notre-actu/le-fil-infos |
| Chambre d'agriculture des Landes | chambre consulaire | https://landes.chambres-agriculture.fr/ | https://landes.chambres-agriculture.fr/actualites-1 |
| Cerfrance Adour-Océan (Landes) | centre de gestion agricole | https://www.cerfrance-adourocean.fr/ | https://www.cerfrance-adourocean.fr/actualites.html |
| SAFER Nouvelle-Aquitaine (antenne Landes) | safer foncière agricole | https://www.saferna.fr/ | https://www.saferna.fr/actualites/ — flux https://www.saferna.fr/feed/ (10 items) |
| Fédération régionale des Cuma Nouvelle-Aquitaine | fédération coopérative agricole | https://nouvelle-aquitaine.cuma.fr/ | https://nouvelle-aquitaine.cuma.fr/actualites/ |
| FNCuma — annuaire fédération Cuma Landes | annuaire professionnel agricole | https://www.cuma.fr/contacter-une-federation/?_fselect_department=40 | https://www.cuma.fr/actualites/ |
| Annuaire des Chambres d'agriculture France | annuaire professionnel agricole | https://chambres-agriculture.fr/le-reseau-chambres/qui-sommes-nous/annuaire-des-chambres | https://chambres-agriculture.fr/actualites |
| Chambre régionale d'agriculture Nouvelle-Aquitaine | chambre consulaire | https://nouvelle-aquitaine.chambres-agriculture.fr/ | https://nouvelle-aquitaine.chambres-agriculture.fr/actualites |
| ICI Landes (Radio France) | radio locale | https://www.ici.fr/nouvelle-aquitaine/landes-40 | https://www.ici.fr/nouvelle-aquitaine/landes-40/actu |
| France 3 Nouvelle-Aquitaine — Landes | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/ | https://france3-regions.franceinfo.fr/economie/agriculture |
| actu.fr — Landes | presse locale | https://actu.fr/nouvelle-aquitaine/landes_40/ | https://actu.fr/nouvelle-aquitaine/landes_40/ |
| Le Parisien — Landes (40) | presse locale | https://www.leparisien.fr/landes-40/ | https://www.leparisien.fr/landes-40/rss.xml (100 items) |
| Réussir (presse agricole spécialisée) | presse agricole spécialisée | https://www.reussir.fr/ | https://www.reussir.fr/fil-actualites — flux https://www.reussir.fr/rss.xml (20 items) |
| La France Agricole | presse agricole spécialisée | https://www.lafranceagricole.fr/ | https://www.lafranceagricole.fr/actualites/ |

## Preuve

- Corpus : `bench/corpus/sources-agriculture-40.jsonl` (champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Relevé HTTP : `bench/results/verification-agriculture-40.json` — 30 URLs, 30 codes 200, types de contenu et nombre d'items RSS.
- Commande : `tsx scripts/verifier-sources.mts --input=<liste d'URL> --json=<relevé> --concurrency=8 --timeout=25000 --strict`.
- Migration : `db/migrate-121-sources-agriculture-40.sql` — 15 lignes `source` et 30 traces `source_verification` en `ok200`.

## Candidats écartés

- `https://www.fdsea40.fr/` et `https://fdsea40.fr/` : DNS/TLS sans réponse. Le site actif de la FDSEA des Landes est `http://fdsea40.sacea.fr/` (HTTP 200, pas de TLS).
- `https://www.jeunesagriculteurs40.fr/`, `https://ja40.fr/`, `https://jeunesagriculteurs-landes.fr/` : domaines sans réponse.
- `https://landes.chambagri.fr/` : certificat TLS sans ce nom d'hôte ; domaine `landes.chambres-agriculture.fr` retenu.
- `https://actu.fr/nouvelle-aquitaine/landes_40/rss.xml` : protection Cloudflare intermittente (403 selon le User-Agent) — flux non retenu.
- `https://www.sudouest.fr/landes/` : boucle de redirection anti-bot (302) — non retenu.
- `https://www.ici.fr/rss/landes/rubrique/infos.xml` et `https://www.cerfrance-adourocean.fr/rss.xml` : 404.

Limite de périmètre : la SAFER, les Cuma, les Chambres et les médias spécialisés sont régionaux ou nationaux mais couvrent explicitement les Landes ; les quatre sources strictement départementales sont la FDSEA 40, le MODEF 40, la Chambre d'agriculture des Landes et Cerfrance Adour-Océan. Aucun exemple cyber agricole landais n'a pu être rattaché à une source vérifiée : le champ `exemple_cyber` est donc vide.
