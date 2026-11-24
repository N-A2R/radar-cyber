# Source muette — délai de détection mesuré sur 30 jours

Mesure rejouée sur la base de travail, ancrée au 2026-11-21T21:00:00.000Z.
Fenêtre d'analyse : 2026-10-22T21:00:00.000Z → 2026-11-21T21:00:00.000Z (30 jours, aucune extrapolation).
Collecte réellement observée : 2026-11-13 → 2026-11-21 (8,01 jours) ; 8430 passages de collecteur dans la base. Tous les épisodes comptés viennent de cette sous-fenêtre.

## Périmètre

Sources actives du catalogue de l'observatoire Nouvelle-Aquitaine : aucun flux extérieur n'est ajouté pour élargir l'échantillon, aucun service payant n'est utilisé. Les sources grises déjà référencées restent éligibles ; aucune donnée personnelle de victime n'est lue.

## Ce qui est compté

Une source est éligible si elle est active, a produit sur au moins 3 jours UTC distincts durant les 7 jours précédant son dernier item, puis n'a plus rien produit depuis 14 h (seuil calibré lu dans `rule_calibration` et transmis explicitement au rejeu). Le détecteur est évalué toutes les heures, comme en production. Un épisode n'est retenu que si la pause réelle a duré au moins 24 h : on mesure donc bien une source devenue muette, pas un simple trou de quelques heures.

## Résultat

**Délai médian de détection : 12,77 h (p50)**, sur 57 épisode(s) et 57 source(s) observée(s) — mesure historique à 12 h, à régénérer avec le seuil calibré de 14 h.

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

## Clôture du chantier (2026-11-22)

**CHANTIER TERMINÉ.**

La tranche précédente livrait le détecteur, le rejeu et la mesure. Celle-ci rend la livraison vérifiable : le test d'intégration du moniteur crée désormais sa propre source dans la base de test (la clé étrangère `collector_run_source_id_fkey` faisait échouer le check CI `verify`) et le test d'intervalle pose sa propre horloge au lieu de dépendre de l'ordre des tests. Aucun comportement de production n'a changé ; `server.ts` est inchangé dans cette tranche.

Vérifications observées : 12/12 tests ciblés verts, typecheck API vert, `scripts/measure-silent-source.mts --check` conforme (12,77 h p50, 57/57 épisodes sous 24 h, 0,68 s). Suite API complète : 1149/1152 verts ; les deux échecs restants (`fuites.test.ts`, `stats-departements.test.ts`) sont des fuites de jeu de données entre tests, sans lien avec le détecteur — le second figurait déjà dans le log CI de la PR #325 avant cette tranche.
