# Sources du secteur « collectivites » — Lot-et-Garonne (47)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **17 sources, 43 URL distinctes toutes en HTTP 200** le 2026-11-22 (5 flux XML vérifiés, 55 traces de vérification en base).

- Corpus : `bench/corpus/sources-collectivites-47.jsonl` (17 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-collectivites-47.json` — code, type de contenu et URL contrôlés (sites, pages d'actualités, flux et articles cyber).
- Intégration : `db/migrate-121-sources-collectivites-47.sql` — 17 lignes dans `source` (identifiants `corpus:collectivites-47-*`), 55 traces `ok200` dans `source_verification` ; migration appliquée le 2026-11-22 sur la base de développement PostgreSQL (`source` : +17, `source_verification` : +55).
- Empreinte du corpus consolidé : `91b8598a3dafb2c180bab0055018d3fed33a1eebeef4e30e19b1d1f9ae28fdf5`.
- Exemples cyber : faits divers et communiqués de presse locale consultables (Ville d'Agen 2023, agglomération d'Agen 2023, pompiers du Lot-et-Garonne 2021, mairie de Fumel 2025, sensibilisation artisans 2026). Les sources sans incident propre portent une mention explicite : aucun événement n'est inventé.

## Organisations retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| CCI du Lot-et-Garonne | chambre consulaire | https://cci47.fr/ | https://cci47.fr/actualites/ | — |
| Communauté d’agglomération d’Agen | intercommunalité | https://www.agglo-agen.net/ | https://www.agglo-agen.net/en-ce-moment/actualites | — |
| Ville d’Agen | commune | https://www.agen.fr/ | https://www.agen.fr/en-ce-moment/actualites | — |
| Ville de Villeneuve-sur-Lot | commune | https://www.villeneuve-sur-lot.fr/ | https://www.villeneuve-sur-lot.fr/nav-newsactus | — |
| Ville de Marmande | commune | https://www.marmande.fr/ | https://www.marmande.fr/11136-actualites.html | https://www.marmande.fr/rss.xml |
| Communauté d’agglomération du Grand Villeneuvois | intercommunalité | https://www.grand-villeneuvois.fr/ | https://www.grand-villeneuvois.fr/actualites.html | — |
| Val de Garonne Agglomération | intercommunalité | https://valdegaronne.fr/ | https://valdegaronne.fr/TPL_CODE/TPL_ACTUALITELISTE/9-liste-actualites.htm | — |
| Communauté de communes du Confluent et des Coteaux de Prayssas | intercommunalité | https://www.communauteduconfluent.com/ | https://www.communauteduconfluent.com/toutes-les-actualites/ | — |
| Communauté de communes Coteaux et Landes de Gascogne | intercommunalité | https://cc-coteaux-landes-gascogne.fr/ | https://cc-coteaux-landes-gascogne.fr/actualites/ | https://cc-coteaux-landes-gascogne.fr/feed/ |
| Communauté de communes Lot et Tolzac | intercommunalité | https://www.lotettolzac.fr/ | https://www.lotettolzac.fr/toutes-les-actualites/ | — |
| Centre de gestion de la fonction publique territoriale du Lot-et-Garonne | service public départemental | https://www.cdg47.fr/ | https://www.cdg47.fr/actualites.php | — |
| SDIS du Lot-et-Garonne | service public départemental | https://www.sdis47.fr/ | https://www.sdis47.fr/actualites/ | https://www.sdis47.fr/actualites/feed/ |
| Journal de Tonneins | presse locale | https://www.journaldetonneins.fr/ | https://www.journaldetonneins.fr/toutes-les-actualites | — |
| La Dépêche du Midi — Lot-et-Garonne | presse locale | https://www.ladepeche.fr/ | https://www.ladepeche.fr/communes/lot-et-garonne/ | https://www.ladepeche.fr/rss.xml |
| Le Petit Bleu (Lot-et-Garonne) | presse locale | https://www.petitbleu.fr/ | https://www.petitbleu.fr/actu/ | https://www.petitbleu.fr/rss.xml |
| ICI Lot-et-Garonne | radio locale | https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47 | https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu | — |
| Annuaire des communes et intercommunalités du Lot-et-Garonne | annuaire local | https://www.annuaire-mairie.fr/departement-lot-et-garonne.html | — | — |

## Candidats écartés

- `https://www.lot-et-garonne.gouv.fr/` (préfecture) et `https://www.lot-et-garonne.gouv.fr/actualites` : `ENHANCE_YOUR_CALM` / réinitialisation de connexion côté serveur (HTTP 000) ; non retenus faute de preuve 200 le 22/11/2026.
- `https://www.cg47.fr/` et `https://cg47.fr/` (conseil départemental) : certificat TLS sans nom d'hôte correspondant puis connexion impossible (HTTP 000) ; non retenus.
- `https://www.nerac.fr/` : réponse 200 mais page « Verification » anti-bot sans contenu vérifiable ; non retenue.
- `https://www.ccpl47.fr/` (CC du Pays de Lauzun) : page d'actualités et `sitemap.rss` en 200 mais site d'accueil en erreur réseau (000) ; non retenue.
- `https://www.fumelvalleedulot.com/` (CC Fumel Vallée du Lot) : site en 200 mais aucune page de liste d'actualités trouvée (les URL `/fr/actualites` et `/fr/actualite` répondent 404) ; non retenue. L'attaque de la mairie de Fumel (03/10/2025) est en revanche citée comme exemple cyber vérifié.
- `https://cci47.fr/rss/?follow=actualites` : HTTP 200 mais type `text/html`, pas un flux RSS exploitable ; champ `url_flux` laissé vide pour la CCI.
- `https://www.sudouest.fr/lot-et-garonne` : boucle de redirections 302 non résolue par le contrôle HTTP ; non retenu.
- `https://actu.fr/lot-et-garonne` et son flux : HTTP 403 au contrôle ; non retenus.
- `https://www.agglo-valdegaronne.fr/`, `https://www.lepassage47.fr/`, `https://www.marmande-val-de-garonne.fr/`, `https://www.cma-lot-et-garonne.fr/`, `https://lot-et-garonne.cci.fr/` : NXDOMAIN ou serveur injoignable ; non retenus.
- `https://www.journaldetonneins.fr/rss.xml` : HTTP 404 ; le Journal de Tonneins est retenu sans flux.
