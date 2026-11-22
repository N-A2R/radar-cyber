# Sources du secteur « collectivites » — Creuse (23)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **30 sources, 66 URL distinctes toutes en HTTP 200** (78 contrôles effectués, dont 19 flux RSS/Atom), le 2026-11-22.

- Corpus : `bench/corpus/sources-collectivites-23.jsonl` (30 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-collectivites-23.json` — code, type de contenu et URL contrôlés.
- Intégration : `db/migrate-066-sources-collectivites-23.sql` — 30 lignes dans `source` (identifiants `corpus:c23-*`), table `source_verification` créée si absente puis 78 traces `ok200`. La migration a été appliquée sur une base PostgreSQL 18 locale : 30 lignes `source` et 78 lignes `source_verification` pour le préfixe `corpus:c23-` vérifiées en base.
- Exemples cyber issus du corpus local `bench/corpus/incidents-creuse.jsonl` : détournement du site du camping municipal d'Évaux-les-Bains (11/07/2025, France 3), cyberattaque présumée touchant la DDT et la DDETSPP de la Creuse (02/09/2026), fraude à l'APAJH 23 (15/05/2025, ICI Creuse), liste du leak site APT73 mentionnant FOL 23 (12/11/2026). Les sources sans incident cyber propre portent une mention explicite dans `exemple_cyber` : aucun événement n'est inventé.

## Organisations retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| CCI de la Creuse (cci-creuse.com) | chambre consulaire | https://www.cci-creuse.com/ | https://www.cci-creuse.com/ | https://www.cci-creuse.com/feed/ |
| Chambre d'agriculture de la Creuse | chambre d'agriculture | https://creuse.chambres-agriculture.fr/ | https://creuse.chambres-agriculture.fr/actualites-1 | — |
| CMA Nouvelle-Aquitaine (délégation Creuse) | chambre consulaire | https://cma-nouvelleaquitaine.fr/ | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| SDIS 23 | sdis | https://www.sdis23.fr/ | https://www.sdis23.fr/actualites/ | https://www.sdis23.fr/rss |
| DREAL Nouvelle-Aquitaine — service de la Creuse | direction régionale de l'État | https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/ | .../spip.php?page=liste-actualites&lang=fr | — |
| Cerema Nouvelle-Aquitaine/Creuse | établissement public | https://www.cerema.fr/fr | https://www.cerema.fr/fr/actualites | https://www.cerema.fr/rss/news/feed |
| AMRF — réseau Creuse/Nouvelle-Aquitaine | fédération d'élus | https://www.amrf.fr/ | https://www.amrf.fr/actualites/ | https://www.amrf.fr/rss |
| Annuaire des communes et intercommunalités (annuaire-mairie.fr) | annuaire local | https://www.annuaire-mairie.fr/departement-creuse.html | — | — |
| Conseil départemental de la Creuse | conseil départemental | https://www.creuse.fr/ | https://www.creuse.fr/A-la-une | https://www.creuse.fr/rss/actus.rss |
| Préfecture de la Creuse | préfecture | https://www.creuse.gouv.fr/ | https://www.creuse.gouv.fr/Actualites | — |
| Ville de Guéret | commune | https://www.ville-gueret.fr/ | https://www.ville-gueret.fr/actualites/ | https://www.ville-gueret.fr/feed/ |
| Ville d'Aubusson | commune | https://www.aubusson.fr/ | https://www.aubusson.fr/actualites/ | https://www.aubusson.fr/feed/ |
| Ville de Bourganeuf | commune | https://bourganeuf.fr/ | https://bourganeuf.fr/laction-municipale/ma-ville/actualites/ | — |
| Ville d'Évaux-les-Bains | commune | https://www.evaux-les-bains.fr/ | https://www.evaux-les-bains.fr/infos-municipales/ | https://www.evaux-les-bains.fr/feed/ |
| Ville de Felletin | commune | https://www.felletin.fr/ | https://www.felletin.fr/ | https://www.felletin.fr/feed/ |
| Commune de Saint-Vaury | commune | https://saint-vaury.fr/ | https://saint-vaury.fr/actualites-de-la-commune/ | https://saint-vaury.fr/feed/ |
| Commune du Grand-Bourg | commune | http://www.legrandbourg.fr/ | http://www.legrandbourg.fr/fr/actualites | — |
| CC de Bénévent-Grand-Bourg | intercommunalité | https://www.benevent-legrandbourg.fr/ | .../fr/nw/1537018/actualites-1063 | — |
| CC Creuse Sud-Ouest | intercommunalité | https://www.creusesudouest.fr/ | https://www.creusesudouest.fr/actualites/ | https://www.creusesudouest.fr/feed/ |
| CC Marche et Combraille en Aquitaine | intercommunalité | https://marcheetcombraille.fr/ | .../decouvrir-et-se-divertir/actualites/ | https://marcheetcombraille.fr/feed/ |
| CA du Grand Guéret | intercommunalité | https://www.agglo-grandgueret.fr/ | https://www.agglo-grandgueret.fr/lagglo/actualites/ | https://www.agglo-grandgueret.fr/feed/ |
| La Montagne — Creuse | presse | https://www.lamontagne.fr/creuse/ | https://www.lamontagne.fr/info-en-continu/creuse | — |
| La Montagne — Guéret | presse | https://www.lamontagne.fr/gueret-23000/ | https://www.lamontagne.fr/info-en-continu/creuse | — |
| Le Populaire du Centre — Guéret | presse | https://www.lepopulaire.fr/gueret-23000/ | https://www.lepopulaire.fr/actualites/ | — |
| ICI Creuse (ex-France Bleu) | radio | https://www.ici.fr/radio/creuse | https://www.ici.fr/radio/creuse/actu | https://www.ici.fr/rss/creuse/a-la-une.xml |
| ICI Creuse — département 23 | radio | https://www.ici.fr/nouvelle-aquitaine/creuse-23 | https://www.ici.fr/nouvelle-aquitaine/creuse-23/gueret | https://www.ici.fr/rss/creuse/a-la-une.xml |
| ICI Guéret | radio | https://www.ici.fr/nouvelle-aquitaine/creuse-23/gueret | https://www.ici.fr/radio/creuse/actu | https://www.ici.fr/rss/creuse/a-la-une.xml |
| ici matin Creuse | radio | https://www.ici.fr/emissions/ici-matin/creuse | https://www.ici.fr/radio/creuse/actu | https://www.ici.fr/rss/creuse/a-la-une.xml |
| France 3 Nouvelle-Aquitaine — Creuse | tv | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss |
| France 3 Nouvelle-Aquitaine — Guéret | tv | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/gueret | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss |

## Candidats écartés

- `creuse.cci.fr`, `cci.fr`, `nouvelle-aquitaine.cci.fr` : HTTP 403 — le site d'information `cci-creuse.com` est retenu à la place.
- `ville-lasouterraine.fr` : HTTP 403 sur toutes les pages — commune non intégrée.
- `actu.fr`, `pagesjaunes.fr`, `kompass.com`, `118712.fr`, `La Nouvelle République` : HTTP 403.
- `cd-creuse.fr`, `amf23.fr`, `adf23.fr`, `sdec23.fr`, `siec23.fr`, `sivom23.fr`, `annuaire-creuse.fr` : NXDOMAIN.
- Bénévent-Grand-Bourg `/rss.xml` : HTTP 200 mais corps HTML d'une page 404 — flux écarté.
- Grand-Bourg en HTTPS : certificat invalide — seules les URL HTTP retenues.
