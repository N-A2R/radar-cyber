# Corroborer les revendications avant publication

Une annonce d'attaquant n'est pas un incident confirmé. `leak_claim` porte
désormais `corroboration_score` (0 à 3), calculé depuis trois signaux
indépendants :

| Signal | Condition |
|---|---|
| `event` | un événement du radar est rattaché à la même organisation (`event.org_id`) avec une assertion `confirmed_incident` ou `third_party_claim` |
| `fuite_reference` | une fuite documentée couvre le domaine de l'organisation (`fuite_org` ou même domaine dans `fuite_reference`) |
| `seconde_source` | une source distincte de celle de la revendication rapporte la même victime : autre `leak_claim` de même victime + groupe, ou événement de la même organisation publié par un autre `source_id` |

- **0** : annonce isolée.
- **1** : un signal.
- **>= 2** : corroborée.

La fonction `recompute_leak_claim_corroboration()` (migration 204) calcule le
score en une passe ensembliste (moins d'une seconde sur 35 000 lignes), sans
appel réseau. Elle est appelée après chaque collecte par `enregistrer()` et par
le script de rattrapage. Le score mesure l'indépendance des **sources**, pas la
véracité de l'attaque : il trie la diffusion, il ne confirme pas un incident.
Le regroupement par éditeur (deux flux d'un même éditeur = une source) reste le
rôle de `apps/api/src/analyse/incident-corroboration.ts`, qui traite des
incidents et non des annonces.

## Diffusion publique

La vue `leak_claim_public` ne contient que les revendications de score `>= 2`.
Une annonce isolée (score 0) en est absente : c'est le contrôle de sortie.

## Commandes reproductibles

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/backfill-corroboration-revendications.mts

DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/verifie-corroboration-revendications.mts
```

Équivalents : `pnpm corroboration:backfill` et `pnpm corroboration:verifie`.

## Résultat mesuré (22 novembre 2026)

```
SELECT count(*) FROM leak_claim WHERE na AND corroboration_score >= 2 AND org_id IS NOT NULL :
15
annonces isolées (score 0) présentes dans leak_claim_public :
0
distribution des scores :
  score 0 : 33115
  score 1 : 1862
  score 2 : 15
cible >= 10 : ATTEINTE
diffusion publique : aucune annonce isolée
```

**15 revendications NA corroborées et rattachées pour une cible de 10.**

## Tests

`apps/api/test/leak-claim-corroboration.test.ts` fixe quatre comportements :

1. annonce isolée → score 0, absente de `leak_claim_public` ;
2. événement + seconde source → score 2, présente dans la vue publique ;
3. fuite documentée seule → score 1, hors diffusion publique ;
4. deux revendications de même victime et groupe → un seul signal, pas deux.
