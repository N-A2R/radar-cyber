# Journal de la décision de publier — mesure du 22 novembre 2026

## Objectif

La feuille de route à trois ans (`docs/roadmap-3ans.md`, contrainte juridique
n°4) impose que la décision de nommer une organisation victime soit un fait
daté : qui décide, quand, sur quelle preuve, et pourquoi nommer plutôt
qu'anonymiser. La tranche précédente (PR #422) calculait le verdict de
publication (source secondaire ou 48 h) pour 56 incidents, mais n'enregistrait
aucune décision traçable. Cette tranche comble ce trou sans refaire le verdict.

OBJECTIF : atteint — 49 / 49 incidents NA avec une décision journalisée et une
chaîne d'empreintes vérifiée intégralement.

## Ce qui est livré

- `apps/api/src/analyse/publication-decisions.ts` : une décision par incident,
  avec auteur (`moteur:publication-regles@1`), instant, preuve (nombre d'éditeurs
  indépendants, première revendication, délai), raison, motif de refus
  `publication-risquee` pour les incidents encore en attente, et empreinte
  SHA-256 chaînée. Le rejeu détecte toute ligne modifiée, retirée ou réordonnée.
- `apps/api/src/journal/publication.ts` : écriture des décisions dans le journal
  append-only de la migration 027 (`publication.decided`), une fois par incident
  et par instant de mesure, avec le même auteur, la même preuve et le même
  pourquoi que la projection publique.
- `GET /api/publication-decisions` : route publique en lecture seule, qui
  renvoie les décisions, le récapitulatif, la tête de chaîne et le résultat du
  rejeu. Aucune écriture depuis la route.
- `scripts/measure-publication-decisions.mts`
  (`pnpm mesure:publication-decisions`) et
  `bench/results/publication-decisions-2026-11-22.json`.
- Le motif `publication-risquee` rejoint la catégorie « publication » du journal
  auditable (`/api/journal/review`).

## Mesure

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-publication-decisions.mts \
  --json=bench/results/publication-decisions-2026-11-22.json
```

Base mesurée : 543 sources, 27 899 événements. Résultat : **49 décisions pour
49 incidents**, 49 nommées, 0 refusée, chaîne rejouée **49/49 (ok)**, 49 faits
écrits dans le journal append-only, 0 lacune, 0 erreur.

Le périmètre live a dérivé depuis la mesure précédente : 56 incidents à 03 h 30
(2 confirmés par une source secondaire, 52 après 48 h, 2 en attente), 49 à
l'instant de cette mesure. Le module de corroboration seul confirme 49 (2
corroborés, 47 une source) : l'écart vient des données, pas de la journalisation.
Les deux incidents hier en attente ont franchi le délai de 48 h et sont désormais
nommables — aucun incident n'est perdu, la couverture de la décision reste 100 %.

## Contrainte de confidentialité

La projection, le rapport et le journal ne contiennent que des empreintes
tronquées de victime, l'identifiant `empreinte@première-revendication`, des
horodatages, des compteurs et la raison textuelle de la règle. Aucun titre,
résumé, nom d'organisation ou donnée personnelle de victime. Le test de route
vérifie l'absence des titres, du nom d'organisation et des URL dans la réponse.

Sources grises autorisées, aucun service payant, aucun appel réseau.
`server.ts` : 0 ligne de diff ; l'enregistrement passe par `routes/index.ts` et
la règle publique par `security/rbac.ts`.

## Vérification

- 9 tests verts sur trois fichiers (`publication-decisions`,
  `publication-decisions-route` et le test de régression des deux fenêtres de
  revendication d'une même victime), un test par comportement.
- Tests de registre verts (`contrat-routes`, `securite-couverture`, `journal`,
  `journal-audit`).
- `tsc --noEmit` vert sur `apps/api`.
- Route appelée via `app.inject` : 200, totaux identiques à la mesure, chaîne
  valide, aucune donnée personnelle exposée.
