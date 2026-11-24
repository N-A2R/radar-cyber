# Branches en conflit réel

Deux branches étaient visibles dans le dépôt (`remotes/origin/…`) mais leurs pull requests sont fermées sans fusion. Faits vérifiés par lecture du dépôt et des PR, le 2026-11-23. Au 2026-11-24, les deux réfs distantes ont été supprimées ; les commits d'en-tête restent consultables dans ce clone (`f2545711`, `09870dbc`) et les deux PR sont toujours `CLOSED` avec `merged: false` (contrôle : `gh api repos/j0ltdevv/radar-cyber/pulls/229` et `/688`).

## `loop/big-collecte-cycle`

- **Ce qui bloque** : `db/migrate-049-cycle-collecte.sql` (commit `46b10d43`) crée `collecte_cycle` avec `id text CHECK (id = 'unique')`, `debut`, `fin`, `en_attente`, `traitees`… Main crée la même table dans `db/migrate-050-supervision-collecte.sql` (commit `9474350c`) avec `id bigserial`, `started_at`, `finished_at`, `statut`, compteurs et mémoire RSS/heap. Les deux `CREATE TABLE IF NOT EXISTS` ne se complètent pas : le premier gagne, le second devient un no-op, et le code attendant l'autre schéma casse.
- **Preuve** : PR [#229](https://github.com/j0ltdevv/radar-cyber/pull/229), commentaire de fermeture : « Déjà dans main : le cycle robuste est fusionné dans collectors/index.ts — planifierCycle, executerPlan, classifierSante, delaiBackoffMs, comparerPriorite, SEUIL_ECHECS_MORTE et la priorité aux sources jamais collectées, plus la supervision des cycles (collecte/supervision.ts, migrate-050). […] Fusionner donnerait deux ordonnanceurs concurrents. Fermée sans fusion. » Le backoff de la branche est donc déjà couvert sur main (`apps/api/src/collectors/index.ts`, `apps/api/src/collectors/http.ts`).
- **Décision** : abandon de la branche, sans réconciliation. Si le backoff persistant (`source.prochaine_tentative_at`, `backoff_niveau`) redevient un sujet, le porter seul dans une migration au nom distinct, sans réintroduire `collecte_cycle`.
- **État** : non fusionnée (PR #229 `CLOSED`, `merged: false`), conservée comme trace. Tête distante : `f2545711`.

## `ext/ch-030-souv-22`

- **Ce qui bloque** : `apps/api/src/collectors/bodacc.collector.ts:170` (commit `09870dbc`) produit `family: "bodacc"`. Sur main, `FAMILIES` (`packages/shared/src/index.ts`) ne contient pas `bodacc` : `apps/api/src/contract/admit.ts:94` rejette la famille inconnue (`famille-inconnue`) et le CHECK de `db/migrate-025-family-contract.sql` ne l'accepte pas. La branche ajoute la valeur à son propre `FAMILIES` et à `db/migrate-200-bodacc-pc.sql` : modifications incompatibles avec main.
- **Preuve du verdict** : PR [#688](https://github.com/j0ltdevv/radar-cyber/pull/688), commentaire du 2026-11-22 : « Critère chiffré non atteint au verdict (table model_eval absente du bac à sable, aucun brier/ECE produit). À reprendre si le sujet revient. » Le critère `model_eval` est donc FAIL, faute de brier/ECE.
- **Décision** : abandon pour l'instant. Piste de réconciliation si le sujet revient : rebase sur main, étendre ensemble `FAMILIES`, le CHECK DB et les labels API/web, puis produire brier et ECE dans `model_eval` avant toute nouvelle fusion.
- **État** : non fusionnée (PR #688 `CLOSED`, `merged: false`), conservée comme trace. Tête distante : `09870dbc`.

## Objectif canonique — mesure reproductible

OBJECTIF : atteint — 2 / 2 branches en conflit réel arbitrées sans fusion et sans code incompatible dans main.

La cible est le nombre de branches en conflit réel recensées dans ce rapport : deux. Une branche compte comme arbitrée quand (1) le rapport porte sa décision et l'état de non-fusion de sa PR et (2) aucun fichier incompatible avec main n'est présent dans `HEAD` — `db/migrate-049-cycle-collecte.sql`, `db/migrate-200-bodacc-pc.sql` et `apps/api/src/collectors/bodacc.collector.ts` — tandis que les équivalents retenus sur main restent présents (`db/migrate-050-supervision-collecte.sql`, ordonnanceur et backoff dans `apps/api/src/collectors/index.ts`, `FAMILIES` sans `bodacc`).

```sh
node scripts/verifie-objectif-conflits-branches.mjs
```

Un contrôle par comportement : décision tracée, main non contaminée, déclaration présente. Le script lit git et des fichiers locaux uniquement — ni base, ni réseau, ni service payant, ni donnée personnelle — et échoue dès qu'un contrôle manque. Résultat observé le 2026-11-24 : 2 / 2 décisions tracées, 2 / 2 branches sans code incompatible, déclaration cohérente.
