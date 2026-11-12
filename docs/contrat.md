# Contrat d'événement — appliqué, pas seulement déclaré

`EventSchema` vivait dans `packages/shared` et n'était **jamais appelé**.
`NormalizedEvent` n'était qu'un `z.infer` : une promesse du compilateur, pas une
vérification à l'exécution. Cinq chemins construisaient leur événement à la main
et l'inséraient tel quel, chacun avec ses troncatures et ses défauts.

`apps/api/src/contract/admit.ts` est désormais le point d'entrée unique.

## Réparer ou rejeter

Toute la question de conception est là. Deux sortes d'écart, traitées
différemment :

**Réparations** — ce qui est sans ambiguïté. On corrige et on **rend la trace**
pour que l'appelant la compte et la journalise. Perdre un incident réel parce
qu'une source a écrit `high` au lieu de `B2` serait une régression produit, pas
de la rigueur.

| Code | Comportement |
|---|---|
| `titre-espaces`, `titre-tronque` | Espaces réduits, 400 caractères max |
| `resume-tronque` | 4 000 caractères max |
| `severite-bornes`, `severite-arrondie`, `severite-illisible` | Bornée 1–5, tronquée, sinon défaut du contrat (3) |
| `confidence-casse`, `confidence-illisible` | `b2` → `B2` ; code non Admiralty écarté |
| `date-illisible` | Normalisée en ISO, sinon absente |
| `url-illisible` | Écartée |
| `geo-type-inconnu` | Ramené à `unknown` |
| `coordonnees-incompletes`, `coordonnees-hors-bornes` | Couple écarté — pas de point fantôme sur la carte |
| `evidence-non-objet` | Ramené à `{}` |

**Rejets** — ce qui touche au sens et ne se devine pas : `famille-inconnue`,
`assertion-inconnue`, `source-absente`, `cle-dedup-absente`,
`cle-dedup-trop-courte`, `titre-absent`, `titre-trop-court`. Inventer une famille
serait fabriquer la donnée que l'analyste doit pouvoir contester.

`EventSchema.safeParse` tranche en dernier : c'est lui qui fait foi, pas le
module de normalisation.

## Les cinq chemins

| Chemin | Traitement des écarts |
|---|---|
| `collectors/generic.ts` | Rejets comptés dans `rejectedBy` sous `contrat:<motif>`, ligne de log dédiée |
| `routes/ingest.ts` | Réponse HTTP : `contract` (détail) + `rejected` (clé et motifs par item) |
| `collectors/hermes.collector.ts` | `normalise` ne fait plus qu'extraire ; le contrat valide, compteurs journalisés |
| `server.ts` (collecteurs enregistrés) | `AdmissionTally` par run, log en `warn` si écart |
| `quarantine/promote.ts` | Lève une erreur : ici tout est construit par nous, un rejet est une régression du code |

Aucune I/O dans le contrat : il se teste seul, sans base.

## Familles : 10 → 13

Arbitrage utilisateur : **élargir** plutôt que fondre. Trois valeurs circulaient
déjà sans que le contrat les connaisse.

- **`leaks`** et **`paste`** : 8 sources actives les déclarent
  (`db/sources-paste-leaks.sql` — HIBP, DataBreaches, RansomLook, gists GitHub).
  `generic.ts` les laissait traverser vers `event.family` sans contrôle, parce
  que `isFamily()` répondait faux.
- **`presse_cyber`** : posée par `scripts/reclassify-press.mts`, acceptée par le
  CHECK de `migrate-019`, absente du shared — lequel signalait la dette.

Gardées distinctes plutôt que fondues dans `ransomware`/`cti` : une fuite indexée
n'est pas une revendication, un paste n'est pas un avis.

**Effet de bord surveillé.** L'élargissement rend `isFamily()` vrai pour ces
8 sources : elles passent désormais par la porte cyber qu'elles contournaient.
`apps/api/test/contract-families.test.ts` vérifie, titres réels à l'appui,
qu'elles ne sont pas rétrogradées en `presse` puis rejetées.

`db/migrate-025-family-contract.sql` aligne le CHECK SQL sur les 13 valeurs.
Elle **ne crée pas** de contrainte là où il n'y en avait pas, et ne remplace un
CHECK existant que si aucune ligne ne le violerait : sur une instance historique,
mieux vaut un signalement qu'une migration qui échoue.

## Bug de provenance trouvé par les tests

`/ingest` n'avait **aucun test**. En écrivant le premier, tout insert valide
renvoyait 500 : le `source_id` par défaut était `"hermes"`, absent du catalogue,
qui déclare `"hermes_radar_cyber"` (déjà utilisé par le collecteur fichier).
Tout bot poussant sans `source_id` violait `event_source_id_fkey`.

Corrigé : défaut aligné, et une provenance inconnue devient un refus lisible
(`source-inconnue`) au lieu d'une erreur serveur. Ce contrôle d'existence reste
dans la route — le contrat, lui, ne touche pas la base.

## Tests

```bash
cd apps/api
./node_modules/.bin/tsx --test test/contract-admit.test.ts      # 17, sans base
./node_modules/.bin/tsx --test test/contract-families.test.ts   # 4, sans base
DATABASE_URL=… ./node_modules/.bin/tsx --test --test-concurrency=1 test/contract-ingest.test.ts  # 9
```
