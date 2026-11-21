# Délai de détection — publication → première apparition

Mesure du 2026-11-15 sur les incidents **vus** de la dernière mesure de couverture publiée (`bench/results/couverture-2026-11-15.json`).

## Méthode

- **Périmètre** : les incidents dont le motif est `vu` dans la mesure de couverture, soit 27 incident(s) ; 27 avec une date de publication et une première apparition exploitables.
- **Publication** : `datePublique` du corpus (`bench/fixtures/corpus-reference-na.json`), champ équivalent au `date_publication` du corpus JSONL. C'est la date de la pièce de preuve, pas la date de survenue de l'attaque.
- **Première apparition** : `preuve.consulteLe`, date à laquelle la page a été consultée et l'incident versé dans la base versionnée du projet. Aucun événement de la table `event` ne correspond à ces incidents : la collecte automatique a commencé le 13/11/2026. Cette date est donc une **borne supérieure** de notre connaissance, pas un horodatage de détecteur.
- **Délai** : `(première apparition − publication) / 3 600 000`, en heures. Les deux bornes sont des dates à minuit UTC : les valeurs sont des multiples de 24 h, pas une latence continue.
- **Quantiles** : rang `floor(q × (n − 1))` sur la liste triée, comme dans `scripts/mesure-delai.mts`.

## Résultats

| Statistique | Heures | Jours |
| --- | ---: | ---: |
| p50 | 2616 | 109 |
| p90 | 6768 | 282 |
| max | 8520 | 355 |
| min | 744 | 31 |
| moyenne | 3379 | 141 |

Histogramme (seau de 30 jours) :

```
    0–30 j |                                                    0
   30–60 j | ################################################   8
   60–90 j | ##############################                     5
  90–120 j | ##################                                 3
 120–150 j | ######                                             1
 150–180 j |                                                    0
 180–210 j | ######                                             1
 210–240 j | ##################                                 3
 240–270 j | ############                                       2
 270–300 j | ############                                       2
 300–330 j |                                                    0
 330–360 j | ############                                       2
```

## Cas extrêmes nommés

Le délai le plus court concerne `na-2026-013` — Magasins de grande distribution touchés en Béarn et Soule (dont Intermarché Pau et Monein) : 744 h (31 j), publié le 2026-10-12 et apparu le 2026-11-12.
Le délai le plus long concerne `na-2026-028` — Ville de La Rochelle — fuite via le prestataire Synbird : 8520 h (355 j), publié le 2025-11-24 et apparu le 2026-11-14.

Trois délais les plus courts :

| Incident | Organisation | Publication | 1ʳᵉ apparition | Délai (h) | Délai (j) |
| --- | --- | --- | --- | ---: | ---: |
| `na-2026-013` | Magasins de grande distribution touchés en Béarn et Soule (dont Intermarché Pau et Monein) | 2026-10-12 | 2026-11-12 | 744 | 31 |
| `na-2026-033` | Supermarchés des Deux-Sèvres (Hyper U Parthenay, Intermarché Saint-Varent et Saint-Maixent-l'École, Super U Champdeniers, Celles-sur-Belle, Leclerc Thouars-Sainte-Verge) | 2026-10-12 | 2026-11-14 | 792 | 33 |
| `na-2026-035` | E.Leclerc de Surgères | 2026-10-12 | 2026-11-14 | 792 | 33 |

Trois délais les plus longs :

| Incident | Organisation | Publication | 1ʳᵉ apparition | Délai (h) | Délai (j) |
| --- | --- | --- | --- | ---: | ---: |
| `na-2026-028` | Ville de La Rochelle — fuite via le prestataire Synbird | 2025-11-24 | 2026-11-14 | 8520 | 355 |
| `na-2026-005` | EHPAD Résidence du Parc de Champdeniers | 2025-12-11 | 2026-11-12 | 8064 | 336 |
| `na-2026-016` | Fédération Nationale des Chasseurs / chasseurs charentais | 2026-01-22 | 2026-11-12 | 7056 | 294 |

## Ce que ce chiffre ne mesure pas

- Il ne mesure pas la vitesse de détection automatique : la première trace est une consultation humaine de la source pour constituer le corpus versionné. Le radar n'a détecté aucun de ces incidents par ses flux sur la période.
- Il ne mesure pas le retard de l'éditeur à publier : la borne de départ est la publication de la pièce de preuve retenue, pas la date de l'incident.
- Les dates étant journalières, deux incidents à un mois d'écart mais consultés le même jour ont le même délai : l'histogramme doit se lire par blocs de 30 jours, pas au près.

## Reproduire

```bash
apps/api/node_modules/.bin/tsx scripts/delai-detection.mts
```

Sources : `bench/fixtures/corpus-reference-na.json` (`datePublique`, `preuve.consulteLe`), `bench/results/couverture-2026-11-15.json` (`motif: vu`).
