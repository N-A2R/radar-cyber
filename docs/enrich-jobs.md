# Échecs d'enrichissement : visibles et rejouables

Un enrichisseur externe (WHOIS, DNS, certificats, réputation) peut échouer sans
faire échouer la requête. Avant la migration 215, ces erreurs étaient renvoyées
dans `errors` puis l'objet était mis en cache `enrich_cache` comme un succès :
aucune trace persistante, aucun rejeu possible, aucune idée du nombre
d'indicateurs concernés.

## File d'attente

`db/migrate-215-enrich-job.sql` crée `enrich_job` :

| Colonne | Rôle |
| --- | --- |
| `target_kind`, `target_value` | indicateur technique (`domain`, `url`, `ip`, `hash`) ; aucune donnée personnelle |
| `state` | `pending`, `running`, `failed`, `done`, `abandoned` |
| `attempts` | nombre de tentatives, plafonné à 5 |
| `next_try_at` | prochaine échéance, calculée en backoff exponentiel (1, 2, 4, 8, 16 min, plafond 24 h) |
| `last_error`, `last_result` | dernier motif d'échec (tronqué à 1000 caractères) et dernier résultat réussi |

Le code vit dans `apps/api/src/enrich/jobs.ts` :

- `recordEnrichmentFailure()` crée ou incrémente un job, pose `next_try_at` ;
- `processDueEnrichJobs()` traite un lot borné de jobs échus, une seule fois
  chacun (transition `running` conditionnelle) ;
- `replayEnrichJob()` rejoue explicitement un job `pending` ou `failed` ;
  `done` et `abandoned` sont terminaux : il n'existe aucun cycle de rejeu
  automatique sans limite.
- Les jobs `abandoned` ont `next_try_at = NULL` et ne sont plus sélectionnés.

La route `GET /api/enrich/jobs?state=failed` rend la file visible (rôle
`analyste`) et `POST /api/enrich/jobs/:id/replay` déclenche un rejeu manuel
(rôle `admin`). `GET /api/enrich/indicator/:id` n'inscrit plus un échec dans le
cache : il renvoie un résumé `enrichment.job` avec état, tentatives et échéance.

## Critère reproductible

Le test `apps/api/test/enrich-jobs.test.ts` joue une fixture défaillante, puis
une fixture corrigée (rejeu réussi), puis laisse volontairement un job en échec
dans la base jetable de la suite. Le script autonome imprime le résultat brut :

```sh
apps/api/node_modules/.bin/tsx scripts/verifie-objectif-enrich-job.mts
```

```text
SELECT count(*) FROM enrich_job WHERE state='failed' AND attempts >= 3 AND next_try_at IS NOT NULL = 1
OBJECTIF : atteint — 1 / 1 job failed avec 3 tentatives et une prochaine tentative
```

La suite complète (`apps/api/node_modules/.bin/tsx test/run.ts` depuis
`apps/api`, ou `pnpm -F @radar/api test`) imprime la même requête SQL et sa
valeur en fin de jeu de test.
