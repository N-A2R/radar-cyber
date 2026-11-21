# Source muette — délai de détection mesuré sur 30 jours

Mesure rejouée sur la base de travail, ancrée au 2026-11-21T21:00:00.000Z.
Fenêtre d'analyse : 2026-10-22T21:00:00.000Z → 2026-11-21T21:00:00.000Z (30 jours, aucune extrapolation).
Collecte réellement observée : 2026-11-13 → 2026-11-21 (8,01 jours) ; 8430 passages de collecteur dans la base. Tous les épisodes comptés viennent de cette sous-fenêtre.

## Périmètre

Sources actives du catalogue de l'observatoire Nouvelle-Aquitaine : aucun flux extérieur n'est ajouté pour élargir l'échantillon, aucun service payant n'est utilisé. Les sources grises déjà référencées restent éligibles ; aucune donnée personnelle de victime n'est lue.

## Ce qui est compté

Une source est éligible si elle est active, a produit sur au moins 3 jours UTC distincts durant les 7 jours précédant son dernier item, puis n'a plus rien produit depuis 12 h. Le détecteur est évalué toutes les heures, comme en production. Un épisode n'est retenu que si la pause réelle a duré au moins 24 h : on mesure donc bien une source devenue muette, pas un simple trou de quelques heures.

## Résultat

**Délai médian de détection : 12,77 h (p50)**, sur 57 épisode(s) et 57 source(s) observée(s).

| Statistique | Heures |
| --- | ---: |
| p50 | 12,77 |
| p90 | 12,83 |
| max | 12,85 |
| épisodes sous 24 h | 57 / 57 |

Le délai est mesuré entre le dernier item réellement produit et la première évaluation horaire qui déclenche l'alerte. Règle : `supervision:silent-source-24h`. Empreinte base : `207802d9fb469d6a`.

## Ce que ce chiffre ne mesure pas

- Il ne mesure pas le délai entre la publication d'un incident et sa présence en base (autre mesure : `docs/delai-detection.md`).
- Il n'extrapole pas sur les jours sans collecte : une source jamais collectée dans la fenêtre n'est pas dite muette.
- Il ne contient aucune donnée de victime : seuls des identifiants publics de sources et des horodatages sont lus.

## Reproduire

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-silent-source.mts
```

Avec `--check`, la commande refuse toute dérive entre ce rapport et la base.
