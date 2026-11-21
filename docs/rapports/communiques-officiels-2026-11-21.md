# Communiqués officiels de Nouvelle-Aquitaine — mesure hebdomadaire

Mesure exécutée le 2026-11-21T22:42:35.998Z.

**13 communiqués officiels collectés pour la semaine 2026-W47** (semaine ISO commençant le 2026-11-16).

Total collecté toutes semaines confondues : 14. Sources officielles actives déclarées : 8.

État réel du corpus au moment de la mesure : 1 673 203 organisations, 443 sources, 27 896 événements.

## Définition mesurée

Communication publique datée, publiée par une institution officielle de Nouvelle-Aquitaine sur son propre domaine, enregistrée comme événement `official_statement` et sans donnée personnelle de victime.

Un communiqué est une ligne `event` de famille `official_statement` dont la date de publication est explicitement présente sur la page officielle. Le titre et l'URL sont seuls conservés : aucun résumé, aucune donnée personnelle de victime. Les semaines sans collecte sont affichées à zéro.

## Résultats par semaine ISO

| Semaine | Début | Communiqués | Par département |
| --- | --- | ---: | --- |
| 2026-W44 | 2026-10-26 | 0 | — |
| 2026-W45 | 2026-11-02 | 0 | — |
| 2026-W46 | 2026-11-09 | 1 | 86: 1 |
| 2026-W47 | 2026-11-16 | 13 | 23: 1, 47: 1, 86: 5, NA: 6 |

## Périmètre et contraintes

- Nouvelle-Aquitaine uniquement (12 départements + périmètre régional).
- Sources institutionnelles publiques et gratuites, ou leurs flux RSS publics ; aucun service payant.
- Aucune donnée personnelle de victime : les titres comportant un identifiant ou une description de victime sont rejetés avant insertion.
- Collecte idempotente par URL canonique : un second passage ne double pas le compteur.

## Reproduction

DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:communiques -- --weeks=4 --json=bench/results/communiques-officiels-2026-11-21.json --out=docs/rapports/communiques-officiels-2026-11-21.md
