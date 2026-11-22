# Couverture « enseignement » — Lot-et-Garonne (47)

OBJECTIF : atteint — 27 sources vérifiées en HTTP 200 / 5 attendues.

Le corpus `bench/corpus/sources-enseignement-47.jsonl` contient 27 sources du
secteur enseignement pour le département 47 ; 73 URL distinctes ont été
contrôlées en HTTP 200 le 2026-11-22 (site, page d'actualités, flux et exemple
cyber pour chaque source).

| Source | Type | Site | Actualités | Flux |
|---|---|---|---|---|
| Lycée Jean-Baptiste de Baudre (Agen) | établissement scolaire | lyceedebaudre.net | /actualites/ | /feed/ |
| Lycée Saint-Caprais (Agen) | établissement privé | lycee-saintcaprais.fr | /blog/ | /feed/ |
| Lycée Val de Garonne (Marmande) | établissement scolaire | lyceevaldegaronne.com | /actualites/ | /feed/ |
| Fédération départementale des MFR 47 | fédération enseignement agricole | mfr47.fr | /blog/ | /blog-feed.xml |
| FSU-SNUipp 47 | syndicat 1er degré | 47.snuipp.fr | accueil | spip backend |
| SNES-FSU Lot-et-Garonne | syndicat 2nd degré | bordeaux.snes.edu | rubrique 47 | backend rubrique 30 |
| GRETA-CFA Aquitaine (Agen) | formation professionnelle | greta-cfa-aquitaine.fr | /actualites/ | — |
| CCI du Lot-et-Garonne | chambre consulaire | cci47.fr | /actualites/ | — |
| Annuaire de l'éducation — 47 | annuaire officiel | data.education.gouv.fr | dataset filtré 47 | API JSON |
| Ville d'Agen | collectivité - scolarité | agen.fr | /en-ce-moment/actualites | — |
| La Dépêche du Midi — Lot-et-Garonne | presse locale | ladepeche.fr | /communes/lot-et-garonne/ | /rss.xml |
| La Dépêche — Éducation | rubrique éducation | ladepeche.fr | /actu/education/ | /actu/education/rss.xml |
| Le Petit Bleu — Éducation | presse locale | petitbleu.fr | /actu/education/ | /actu/education/rss.xml |
| La Semaine des Pyrénées — 47 | presse hebdomadaire | lasemainedespyrenees.fr | /category/lot-et-garonne/ | /feed/ |
| ICI Lot-et-Garonne | radio locale | ici.fr | /actu | — |
| actu.fr — Lot-et-Garonne | presse numérique | actu.fr | /lot-et-garonne_47 | /rss.xml |
| DDEC 47 | enseignement catholique | ddec47.fr | /blog | /blog-feed.xml |
| Diocèse d'Agen | service diocésain | diocese47.fr | /actualites/ | — |
| DRAAF Nouvelle-Aquitaine | enseignement agricole | draaf.nouvelle-aquitaine.agriculture.gouv.fr | /actualites-r1148.html | backend-actu |
| CIEL 47 — CCI Formation | centre de formation | ciel47.fr | cci47.fr/actualites/ | — |
| Campus Agen | site universitaire | campus-agen.u-bordeaux.fr | /actualites | — |
| Chambre d'agriculture du 47 | chambre consulaire | lot-et-garonne.chambres-agriculture.fr | /actualites | — |
| AgroCampus 47 | enseignement agricole / CFA | agrocampus47.org | /actus-infos/ | /feed/ |
| Lycée Jacques de Romas (Nérac) | lycée professionnel | lycee-jacquesderomas.fr | accueil | /feed |
| Lycée Lot-et-Bastides | lycée public | lyceeleyguescouffignal.fr | /category/actualites | /feed |
| Lycée Notre-Dame de la Compassion | lycée privé | lycee-lacompassion.fr | /actualites-du-lycee/ | — |
| Lycée Bernard Palissy (Agen) | lycée public | lycee-palissy-agen.fr | /vie-lyceenne/actualites/actualites.html | — |

## Exemples cyber associés

Le champ `exemple_cyber` cite des articles vérifiés en HTTP 200 : piratage
Pronote dans un lycée d'Agen et cyberattaque de la ville d'Agen (La Dépêche),
cyberattaque de l'Éducation nationale touchant 25 académies sur 30 (ANSSI,
cyberattaque.org), conséquences sur le terrain (Café pédagogique), rançongiciel
au collège La Salle de Brive (France 3) et cyberattaque de Bordeaux Sciences
Agro (cyberattaque.org). Sud Ouest est écarté comme preuve : ses articles
redirigent en boucle sous Imperva.

## Candidats écartés

- `https://www.ac-bordeaux.fr/` et `https://www.education.gouv.fr/` : HTTP 403
  sous curl (Cloudflare), DSDEN 47 non joignable directement.
- `https://cci47.fr/feed/` et `https://diocese47.fr/rss/?follow=actualites` :
  HTTP 200 mais contenu HTML, pas un flux RSS ; Champ `url_flux` laissé vide.
- `https://greta-cfa-aquitaine.fr/feed/` : HTTP 404.
- `https://fcpe47.fr/` et `https://47.fsu-snuipp.fr/` : échec réseau ; les
  domaines actifs sont `fcpe.asso.fr` et `47.snuipp.fr`.

## Méthode et intégration

Découverte par annuaire officiel de l'Éducation nationale, sites d'établissements,
fédérations et syndicats départementaux, chambres consulaires, collectivités et
presse locale ; identification des pages d'actualités et des flux, puis contrôle
de chaque URL par GET `curl -L` avec User-Agent navigateur et délai de 25 s.
Preuve complète : `bench/results/verification-enseignement-47.json`.

Intégration en base : `db/migrate-122-sources-enseignement-47.sql` insère 27
lignes dans `source` (préfixe `corpus:ens47-`) et 98 traces dans
`source_verification`, couvrant 73 URL distinctes toutes en HTTP 200. Migration
appliquée et vérifiée sur la base de développement le 2026-11-22.

Empreinte du corpus consolidé : `382a644ca79d47f5eab913111b1235fc53e095f0288a267160e724075d586db1`.
