# Couverture — sources « agriculture » de la Creuse (23)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **23 sources, 58 URLs toutes en HTTP 200** (dont 14 flux RSS) contrôlées le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Chambre d'agriculture de la Creuse | chambre consulaire | https://creuse.chambres-agriculture.fr/ | https://creuse.chambres-agriculture.fr/actualites-1/ | — |
| Conseil départemental de la Creuse — Agriculture | collectivité territoriale | https://www.creuse.fr/ | https://www.creuse.fr/agriculture | https://www.creuse.fr/spip.php?page=backend (10 items) |
| Cerfrance Centre-Limousin (périmètre Creuse) | centre de gestion agricole | https://centre-limousin.cerfrance.fr/ | https://centre-limousin.cerfrance.fr/actualites/ | — |
| Chambre régionale d'agriculture Nouvelle-Aquitaine | chambre consulaire régionale | https://nouvelle-aquitaine.chambres-agriculture.fr/ | https://nouvelle-aquitaine.chambres-agriculture.fr/actualites | https://nouvelle-aquitaine.chambres-agriculture.fr/actualites.rss (20 items) |
| Safer Nouvelle-Aquitaine — comité Creuse | foncier agricole | https://www.saferna.fr/ | https://www.saferna.fr/actualites/ | https://www.saferna.fr/feed/ (10 items) |
| FRCUMA Nouvelle-Aquitaine (Cuma de la Creuse) | fédération coopérative | https://nouvelle-aquitaine.cuma.fr/ | https://nouvelle-aquitaine.cuma.fr/actualites/ | — |
| FNCuma | fédération nationale | https://www.cuma.fr/ | https://www.cuma.fr/actualites/ | — |
| Annuaire des Chambres d'agriculture France | annuaire professionnel | https://chambres-agriculture.fr/ | https://chambres-agriculture.fr/actualites | https://chambres-agriculture.fr/presse.rss (20 items) |
| Agri Sud-Ouest Innovation | cluster agroéconomique | https://agrisudouest.com/ | https://agrisudouest.com/actualites/ | https://agrisudouest.com/feed/ (10 items) |
| Jeunes Agriculteurs | syndicat agricole | https://www.jeunes-agriculteurs.fr/ | https://www.jeunes-agriculteurs.fr/actualites/ | https://www.jeunes-agriculteurs.fr/feed/ (10 items) |
| FNSEA — carte des fédérations | fédération nationale | https://www.fnsea.fr/ | https://www.fnsea.fr/actualités/ | — |
| FNAB | fédération agricole | https://www.fnab.org/ | https://www.fnab.org/actualites/ | https://www.fnab.org/feed/ (10 items) |
| Bienvenue à la ferme | annuaire de producteurs | https://www.bienvenue-a-la-ferme.com/fr | https://www.bienvenue-a-la-ferme.com/fr/inspirez-vous/actualite | — |
| CARRÉ — machinisme agricole | réseau de concessions | https://www.carre.fr/ | https://www.carre.fr/actualites/ | https://www.carre.fr/feed/ (10 items) |
| Terre de Liens | association foncière agricole | https://terredeliens.org/ | https://terredeliens.org/national/actu/ | — |
| La Montagne — Creuse | presse locale | https://www.lamontagne.fr/creuse/ | https://www.lamontagne.fr/economie/agriculture | — |
| actu.fr — Creuse | presse locale | https://actu.fr/nouvelle-aquitaine/creuse_23/ | https://actu.fr/nouvelle-aquitaine/creuse_23/ | https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml |
| ICI Creuse (Radio France) | radio locale | https://www.ici.fr/nouvelle-aquitaine/creuse-23 | https://www.ici.fr/nouvelle-aquitaine/creuse-23 | https://www.ici.fr/rss/creuse/a-la-une.xml (40 items) |
| ICI Limousin (Radio France) | radio locale | https://www.ici.fr/radio/limousin | https://www.ici.fr/nouvelle-aquitaine/creuse-23/actu | https://www.ici.fr/rss/limousin/rubrique/infos.xml (20 items) |
| France 3 Nouvelle-Aquitaine — Creuse | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/ | https://france3-regions.franceinfo.fr/economie/agriculture | — |
| Sud Ouest — Creuse | presse locale | https://www.sudouest.fr/creuse/ | https://www.sudouest.fr/economie/agriculture | https://www.sudouest.fr/creuse/rss.xml (20 items) |
| Réussir — presse agricole | presse agricole spécialisée | https://www.reussir.fr/ | https://www.reussir.fr/fil-actualites | https://www.reussir.fr/rss.xml (20 items) |
| La France Agricole | presse agricole spécialisée | https://www.lafranceagricole.fr/ | https://www.lafranceagricole.fr/actualites/ | https://www.lafranceagricole.fr/rss (20 items) |

## Preuve

- Corpus : `bench/corpus/sources-agriculture-23.jsonl` (champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Relevé HTTP : `bench/results/verification-agriculture-23.json` — 58 URLs, 58 codes 200, types de contenu, URL finales et nombre d'items RSS enregistrés.
- Migration : `db/migrate-084-sources-agriculture-23.sql` — 23 lignes `source` et 58 traces `source_verification` en `ok200`.

## Exemples cyber rattachés

16 lignes du corpus portent un exemple d'article cyber/fraude, dont les articles suivants, vérifiés en HTTP 200 :

- « Cyberattaque : des hackers demandent une rançon à des Chambres d'agriculture » (18/11/2020) — La France Agricole, https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture.
- « Votre élevage dans le viseur des hackers » (14/10/2026) — Réussir, https://www.reussir.fr/articles/votre-elevage-dans-le-viseur-des-hackers.
- « Comment défendre son exploitation agricole contre les pirates informatiques » (30/09/2024) — La France Agricole, https://www.lafranceagricole.fr/gestion-dentreprise/article/871783/six-conseils-pour-elever-son-niveau-de-securite.
- « Une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest » (23/12/2024) — La France Agricole, https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque.
- « Deux gérants d'un commerce de matériel agricole de La Souterraine jugés pour usage de faux et escroquerie » (17/07/2025) — ICI Creuse, https://www.ici.fr/infos/faits-divers-justice/deux-gerants-d-un-commerce-de-materiel-agricole-de-la-souterraine-juges-pour-usage-de-faux-et-escroquerie-7375732 (Source : Creuse, La Souterraine).
- « Alerte sur une tentative de fraude » (12/05/2025) — Chambre d'agriculture de la Gironde, https://gironde.chambres-agriculture.fr/actualites-33/detail-de-lactualite/alerte-sur-une-tentative-de-fraude-1-1.

## Candidats écartés

- `https://fdsea23.fr/`, `https://www.fdsea23.fr/`, `https://fdsea23.com/`, `https://fdsea-creuse.fr/`, `https://fdsea-limousin.fr/`, `https://cdja23.fr/` : 000 (DNS/refus) — aucun site FDSEA/CDJA 23 joignable ; la FNSEA et Jeunes Agriculteurs couvrent le département via leur carte fédérale.
- `https://limousin.cerfrance.fr/`, `https://creuse.cerfrance.fr/` : 000 ; `https://www.cerfrance.fr/entites/creuse` et `/nos-cerfrance/creuse` : 404 — seul Cerfrance Centre-Limousin est joignable.
- `https://limousin.safer.fr/` : 000 ; `https://www.safer.fr/actualites` : 404 — la SAFER Limousin est intégrée à la Safer Nouvelle-Aquitaine.
- `https://www.lamontagne.fr/creuse/economie/agriculture/`, `https://www.lamontagne.fr/creuse/agriculture/` : 404 ; la rubrique agriculture est portée par `https://www.lamontagne.fr/economie/agriculture` et `https://www.lamontagne.fr/creuse/economie` (200).
- `https://actu.fr/nouvelle-aquitaine/creuse_23/economie/agriculture`, `https://actu.fr/nouvelle-aquitaine/creuse_23/agriculture` : 404 — la page Creuse d'actu.fr sert de page d'actualités.
- `https://www.creuse.fr/rss.xml` et `https://www.creuse.fr/actualites` : 404 — le flux du site est `spip.php?page=backend`.
- `https://creuse.chambres-agriculture.fr/rss.xml`, `/actualites-1/rss.xml`, `/actualites.rss`, `/actualites-1.rss` : 404 — la chambre 23 n'expose pas de flux public.
- `https://www.fnsea.fr/actualites/` : 404 — la page d'actualités est `https://www.fnsea.fr/actualités/`.
- `https://www.lafranceagricole.fr/rss.xml`, `https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss.xml` : 404 ; les flux valides sont `/rss` et `/economie/agriculture` respectivement.
- `https://www.populaire-du-centre.fr/` : DNS absent ; `https://www.terre-net-occasions.fr/actualites/` : 404.

Limite de périmètre : plusieurs sources sont régionales ou nationales (Chambre NA, Safer NA, FRCUMA, FNCuma, FNSEA, FNAB, Jeunes Agriculteurs, presse agricole spécialisée) mais couvrent la Creuse ; les actualités locales creusoises sont couvertes par la chambre 23, le Conseil départemental, ICI Creuse, La Montagne, actu.fr, France 3 et Sud Ouest.
