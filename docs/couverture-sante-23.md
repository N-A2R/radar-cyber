# Couverture — sources « santé » de la Creuse (23)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **19 sources, 50 URL contrôlées en HTTP 200 le 2026-11-22** (dont 9 flux RSS/Atom) ; aucune anomalie.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Centre hospitalier de la Creuse — Guéret | établissement public de santé | https://www.ch-gueret.fr/ | https://ch-gueret.fr/index.php/revue-de-presse-chg | — |
| Centre hospitalier d'Aubusson | établissement public de santé | https://www.ch-aubusson.fr/site/ | https://www.ch-aubusson.fr/site/category/centre-hospitalier-daubusson/ | https://www.ch-aubusson.fr/site/category/centre-hospitalier-daubusson/feed/ |
| Clinique de La Marche — Guéret | clinique privée | https://clinique-lamarche.fr/ | https://clinique-lamarche.fr/actualites/ | https://clinique-lamarche.fr/feed/ |
| EHPAD Les 4 Cadrans — Centre Creuse Combraille | EHPAD | https://ehpadcentrecreusecombraille.fr/ | https://ehpadcentrecreusecombraille.fr/ehpad-les-4-cadrans/category/actualites/ | https://ehpadcentrecreusecombraille.fr/ehpad-les-4-cadrans/category/actualites/feed/ |
| ARS Nouvelle-Aquitaine — délégation de la Creuse (23) | agence régionale de santé | https://www.nouvelle-aquitaine.ars.sante.fr/ | https://www.nouvelle-aquitaine.ars.sante.fr/liste-actualites?archive=0 | https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite |
| CCSS de la Creuse (ex-CPAM/Caf) — Assurance Maladie | organisme de sécurité sociale | https://www.assurance-maladie.ameli.fr/nous-connaitre/organisation/le-reseau-de-proximite/nos-organismes/nouvelle-aquitaine/ccss-de-la-creuse | https://www.ameli.fr/creuse/assure/liste-actualites-locales | — |
| Ligue contre le cancer — Comité 23 Creuse | association de santé | https://www.ligue-cancer.net/23-creuse | https://www.ligue-cancer.net/23-creuse/actualites | — |
| Conseil départemental de l'Ordre des médecins de la Creuse | ordre professionnel | https://conseil23.ordre.medecin.fr/ | https://conseil23.ordre.medecin.fr/actualites | https://conseil23.ordre.medecin.fr/rss |
| URPS Infirmiers Libéraux Nouvelle-Aquitaine | union régionale de professionnels de santé | https://urpsinfirmiers-na.fr/ | https://urpsinfirmiers-na.fr/actualites/ | https://urpsinfirmiers-na.fr/feed/ |
| URPS Médecins Libéraux Nouvelle-Aquitaine | union régionale de professionnels de santé | https://www.urpsml-na.org/ | https://www.urpsml-na.org/ | https://www.urpsml-na.org/feed/ |
| CARSAT Centre Ouest (périmètre Creuse) | caisse de retraite et de prévention | https://www.carsat-centreouest.fr/ | https://www.carsat-centreouest.fr/home/nous-connaitre/actualites-nous-connaitre.html | — |
| Conseil départemental de la Creuse — rubrique Santé | collectivité départementale | https://www.creuse.fr/ | https://www.creuse.fr/Sante-vous-bien | — |
| La Montagne — Guéret (23) | presse locale | https://www.lamontagne.fr/gueret-23000/ | idem | — |
| Le Populaire du Centre — Guéret (23) | presse locale | https://www.lepopulaire.fr/gueret-23000/ | article « Qualité des soins confirmée : l'hôpital de Guéret retrouve sa certification HAS » | — |
| actu.fr — Creuse (23) | presse locale | https://actu.fr/nouvelle-aquitaine/creuse_23 | idem | https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml |
| ICI Creuse (Radio France) | média local | https://www.ici.fr/radio/creuse | https://www.ici.fr/radio/creuse/actu | — |
| Santé publique France | agence nationale de santé publique | https://www.santepubliquefrance.fr/ | https://www.santepubliquefrance.fr/les-actualites | https://www.santepubliquefrance.fr/rss.xml |
| Haute Autorité de santé | autorité publique indépendante | https://www.has-sante.fr/ | https://www.has-sante.fr/jcms/fc_2874902/fr/actualites | — |
| Fédération hospitalière de France | fédération d'établissements hospitaliers | https://www.fhf.fr/ | https://www.fhf.fr/actualites | — |

## Exemples cyber associés

Le champ `exemple_cyber` s'appuie sur les incidents déjà documentés dans
`bench/corpus/incidents-creuse.jsonl` et sur les pages d'actualités lues : cyberattaque
du logiciel Weda touchant une rhumatologue libérale de Creuse (10/11/2025), arnaque au
président contre l'APAJH 23 (15/05/2025, 173 000 € extorqués), fuite de données chez FOL 23
à Guéret (domaine fol-23.fr publié sur Apt73, 17/01/2025), defacement du camping municipal
d'Évaux-les-Bains (11/07/2025) et incident de sécurité de l'ARS sur la plateforme
d'autorisations parentales HPV/méningocoque (08/07/2026, page `/cybersecurite-0?parent=15058`).
Ces exemples illustrent le risque pour les organisations suivies ; ils n'attribuent pas
d'incident aux sources listées.

## Méthode et exclusions

Recherche web multi-angles (annuaires d'établissements de santé, ordres professionnels,
unions régionales de professionnels, agences sanitaires, fédérations hospitalières, presse
locale), puis contrôle GET de chaque URL avec User-Agent navigateur complet, suivi des
redirections et délai de 25 s. Les 50 URL ont répondu 200 ; la preuve détaillée est dans
`bench/results/verification-sante-23.json` (titre de page et type de contenu inclus).
L'API Exa était hors crédits (402) pendant la collecte ; la recherche a utilisé les moteurs
publics et la lecture directe des pages.

Écartés après vérification : `ch-creuse.fr` et `centre-hospitalier-creuse.fr` (000),
`cpam-creuse.fr` (000), `had-creuse.fr` (000), `urps-na.fr` (000), `ordre-medecins.fr` (000),
`ordre-pharmaciens.fr` (000), CCI de la Creuse (403 Cloudflare), `www.ici.fr/ici-creuse` (404),
`ameli.fr/cpam-creuse` (404 — la CCSS de la Creuse est retenue à la place), rubriques
`/actualites` de `creuse.fr` et de `lamontagne.fr/gueret-23000` (404), flux `/rss.xml` de
La Montagne (404). Le flux `/rss/creuse` d'ICI renvoie du HTML et n'a donc pas été retenu
comme flux RSS.

Corpus : `bench/corpus/sources-sante-23.jsonl` (19 lignes, empreinte `bench/corpus/HASH`
recalculée). Base : `db/migrate-083-sources-sante-23.sql` insère 19 lignes dans `source`
et les traces `source_verification` correspondantes en état `ok200`.

OBJECTIF : atteint — 19 / 5
