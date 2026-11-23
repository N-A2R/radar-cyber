# Interroger le corpus en français avec preuve jointe

## Objectif et résultat

Jeu de 100 questions en français : **100/100 réponses dont tous les identifiants
d'événements cités existent dans `event`**, **0 affirmation sans source**.
Cible : ≥ 90 % et 0 affirmation sans source.

OBJECTIF : atteint — 100/100 / 90/100

Brut : `bench/results/NA-anchored-answers.json`.

```text
{
  "date": "2026-11-23T22:44:23.353Z",
  "questions": 100,
  "objective": { "passRate": "90%", "unsourcedAssertions": 0 },
  "measured": { "passed": 100, "passRate": "100%", "unsourcedAssertions": 0 },
  "failures": []
}
```

Commande de rejeu, en lecture seule sur la base réelle :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx apps/api/scripts/verify-anchored-answers.mts \
  --json=bench/results/NA-anchored-answers.json
```

## Ce qui est livré

- `GET /api/search/ask-fr?q=...` : réponse structurée en français. Le champ
  `answer` ne contient que les phrases sourcées ; une phrase = un événement,
  son identifiant `[event:<id>]`, l'URL de la pièce et le run de collecte.
- `apps/api/src/search/anchored-answer.ts` : requête bornée sur `event` jointe
  à `org`, `source` et `collector_run`. Filtres : départements de
  Nouvelle-Aquitaine, année, intention, secteur, jetons de la question. Aucune
  ligne n'est rendue sans `source_url`, sans `run_id` résolu ou si le marqueur
  `synthetic` est posé. Le corpus figé n'est pas interrogé : un identifiant
  cité doit exister dans `event`.
- `apps/api/scripts/verify-anchored-answers.mts` : rejeu des 100 questions.
  Il vérifie à la fois l'existence SQL de chaque identifiant cité, la présence
  de la citation dans la phrase, l'URL de source, le run et l'absence
  d'affirmation orpheline.
- `apps/api/test/search-anchored-answer.test.ts` et
  `apps/api/test/search-anchored-replay.test.ts` : contrats de sortie et rejeu
  automatisé de 100 questions sur une base de test synthétique.

## Ce qui n'est pas affirmé

Aucune phrase ne décrit une source nationale comme une source locale. La
portée territoriale est portée par `org.dept` (département de l'organisation)
et le nom de la source est reproduit tel quel depuis `source.name`. Les champs
`summary`, `evidence`, `extrait`, `resume`, `confiance` et `victimes` ne sont
jamais sélectionnés ni sérialisés. Quand aucune ligne publique ne correspond,
`answer` est vide et `status` vaut `no-event` : aucun identifiant n'est cité et
aucune affirmation n'est produite.

## Limites

- Le parseur reste lexical (français et anglais courants) : une paraphrase
  indirecte peut ne pas produire de filtre et élargir la recherche, jamais
  inventer une citation.
- La réponse est une liste d'affirmations, pas une synthèse générative : c'est
  le prix d'un rejeu où chaque mot est rattaché à une ligne de `event`.
- Les événements d'injection contrôlée et les lignes marquées `synthetic` sont
  exclus pour ne pas présenter un jeu d'essai comme une observation réelle.
