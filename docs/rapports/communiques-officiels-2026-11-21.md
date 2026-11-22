# Communiqués officiels de Nouvelle-Aquitaine — mesure hebdomadaire

Mesure exécutée le 2026-11-21T22:42:35.998Z.

**13 communiqués officiels collectés pour la semaine 2026-W47** (semaine ISO commençant le 2026-11-16).

OBJECTIF : atteint — 13 / 13 communiqués officiels collectés pour la semaine 2026-W47

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
Vérification de la déclaration sur les artefacts publiés (sans base ni réseau) : `pnpm verifie:objectif-communiques`.


## Clôture du chantier — 2026-11-21

**CHANTIER TERMINÉ.** Objectif chiffré atteint et re-vérifié en lecture seule le 2026-11-21 à 22:52 UTC : `currentWeek: 2026-W47`, `currentWeekCount: 13`, `total: 14`, `sources: 8`. La mesure rejouée reproduit exactement le chiffre livré via la PR #328 : 13 communiqués officiels collectés pour la semaine 2026-W47. Le seul objectif mesurable du chantier — le nombre de communiqués officiels collectés par semaine — est atteint ; aucune tranche fonctionnelle supplémentaire n'est nécessaire.

Aucun code, test ou donnée n'a été modifié à la clôture : `server.ts` reste inchangé (0 ligne de diff), aucune source payante, aucune donnée personnelle de victime.

Note de reproductibilité : dans ce worktree, `pnpm mesure:communiques` échoue sur une boucle de symlink `node_modules` propre à l'environnement. La vérification a donc exécuté le même script sans écriture avec `bun scripts/mesure-communiques-officiels.mts --weeks=4` (sans `--json` ni `--out`).
