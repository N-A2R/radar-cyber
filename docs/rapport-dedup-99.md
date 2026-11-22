# Déduplication à 99 % — chantier H1

Date : 2026-11-22. Branche `ext/chantier-h1`. Rapport en français ; code et
interface en anglais.

## Réponse chiffrée

**Taux de déduplication mesuré sur 30 jours : 100 %** — 135 doublons
d'événements éliminés sur 135 détectés, répartis en 96 groupes, dans le
périmètre Nouvelle-Aquitaine. Un second balayage ne trouve plus aucun doublon
dans ce périmètre. Le chiffre est calculé par la commande reproductible ci-dessous
et enregistré dans `bench/results/dedup-crosssource-30j-verify.json`.

Le taux est défini comme : `(doublons détectés sur la fenêtre glissante de 30 jours
− doublons résiduels après fusion) / doublons détectés × 100`. La mesure porte sur
les lignes surnuméraires d'un même groupe, pas sur les groupes : 135 lignes ont
été retirées, 96 lignes anciennes ont survécu.

## État réel de départ et effet observable

Mesuré en lecture seule sur `postgres://radar:radar@localhost:5433/radar`, avant
toute écriture, puis après application :

| Grandeur | Avant | Après |
| --- | ---: | ---: |
| Organisations | 1 673 151 | 1 673 151 (inchangé) |
| Sources du catalogue | 312 | 312 (inchangé) |
| Événements au total | 26 394 | 26 259 (−135) |
| Événements sur 30 jours | 26 394 | 26 259 |
| Événements dans le périmètre NA (12 départements) | 26 369 | 26 234 |
| Groupes de doublons NA | 96 | 0 |
| Lignes surnuméraires NA | 135 | 0 |
| Faits d'audit `journal.kind = 'event.dedup'` | 0 | 96 |

Vingt-cinq événements rattachés à des organisations hors Nouvelle-Aquitaine
n'entrent pas dans le périmètre. Quatre groupes résiduels visibles par un
balayage SQL sans filtre territorial concernent uniquement les départements 44,
75, 77 et 92 : ils sont **volontairement conservés** par la contrainte
« Nouvelle-Aquitaine uniquement ». Le taux revendiqué (100 %) est celui du
périmètre NA, pas un taux global trompeur.

## Règle de déduplication

La règle est définie une seule fois dans
`apps/api/src/dedup/event-duplicates.ts` (`cross-source@1`) et réutilisée par
l'outil en ligne de commande et par les tests. Deux événements appartiennent au
même groupe seulement s'ils ont **la même famille, le même titre normalisé
(casse, accents et ponctuation ignorés, au moins 12 caractères) et le même jour
UTC de `COALESCE(observed_at, collected_at)`**. L'identité ne contient pas
l'identifiant de source : c'est précisément ce qui permet de retrouver les avis
CERT-FR republiés par `cert-fr-avis`, `cert-fr-feed` et `cert_fr`, que
l'empreinte par source de la migration 045 ne pouvait pas fusionner.

Le survivant est le plus petit `id` du groupe : choix stable d'une exécution à
l'autre. La fusion se déroule dans une transaction unique : les alertes sont
réaffectées au survivant (les alertes redondantes de même règle sont
consolidées), les clés d'archive sont réécrites, l'union des provenances est
conservée dans `evidence.dedupSources`, un fait `event.dedup` est ajouté au
journal, puis les copies sont supprimées. Chaque groupe est vérifié avant
validation : copies absentes, aucune alerte orpheline, toutes les sources
d'origine présentes sur le survivant. Une seule incohérence déclenche le
rollback complet. Les 96 groupes ont tous passé ce contrôle.

## Mesure reproductible

Trois commandes, exécutées sur la base de travail, aucune au-delà de 3 secondes
(limite : 60 s) :

```bash
# 1. État avant : 96 groupes, 135 doublons, aucune écriture (0,7 s)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/dedup-events-crosssource.mts \
  --window-days=30 --json=bench/results/dedup-crosssource-30j-before.json

# 2. Fusion transactionnelle puis re-balayage (2,8 s)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/dedup-events-crosssource.mts \
  --window-days=30 --apply --json=bench/results/dedup-crosssource-30j-after.json

# 3. Mesure rejouable après fusion, adossée au relevé avant (0,7 s)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/dedup-events-crosssource.mts \
  --window-days=30 \
  --baseline=bench/results/dedup-crosssource-30j-before.json \
  --json=bench/results/dedup-crosssource-30j-verify.json
```

Résultats enregistrés :

| Rapport JSON | `groupsFound` | `duplicatesFound` | `duplicatesEliminated` | `residualDuplicates` | `dedupRatePercent` |
| --- | ---: | ---: | ---: | ---: | ---: |
| `dedup-crosssource-30j-before.json` | 96 | 135 | 0 | 135 | — |
| `dedup-crosssource-30j-after.json` | 96 | 135 | 135 | 0 | 100 |
| `dedup-crosssource-30j-verify.json` | 0 | 0 | 0 | 0 | **100** (base de référence : 135) |

Le raccourci `pnpm mesure:dedup-30j` exécute la commande 3 avec la fenêtre de 30
jours et la base de référence. L'outil est idempotent : un nouvel appel en mode
`--apply` ne trouve plus rien à fusionner.

## Tests

Six tests, un par comportement, sur une base de test jetable créée par le
lanceur du dépôt (jamais la base de travail) :

```bash
cd apps/api
./node_modules/.bin/tsx test/run.ts test/dedup-crosssource.test.ts
```

Résultat : **6 tests, 6 réussis**. Ils couvrent la normalisation des variantes
de titre et la séparation par jour, la non-fusion entre familles différentes,
le mode rapport sans écriture avec des sources grises (`relevance = 'context'`),
la fusion avec conservation des deux provenances et réaffectation d'alerte,
l'exclusion des organisations hors Nouvelle-Aquitaine, et la mesure adossée à
une base de référence. Le typecheck passe avec
`apps/api/node_modules/.bin/tsc --noEmit` (le lanceur `pnpm` du worktree refuse
le lien symbolique de `node_modules`, indépendamment de ce changement).

## Prévol et contraintes

Aucune PR ouverte ne porte sur cet objectif : la recherche dans l'historique et
dans les 405 références de PR distantes ne montre que les travaux antérieurs
(PR #107 outil de détection, PR #247 nettoyage d'événements par empreinte,
PR #326 chantier A6 — 18 fusions d'organisations, objectif différent et déjà
livré). La clé d'API GitHub fournie renvoie `401 Bad credentials` pour
`gh pr list` ; le relevé a donc été fait sur les références git distantes.

- Nouvelle-Aquitaine uniquement : filtre sur les 12 codes départementaux ; les
  quatre groupes extérieurs sont préservés.
- Sources grises autorisées : aucune sélection sur `source.relevance` ; les
  sources `context` sont incluses et couvertes par un test.
- Aucune donnée personnelle de victime : les rapports JSON ne contiennent ni
  titre, ni résumé, ni texte libre d'événement — seulement des identifiants
  techniques et des identifiants de sources.
- Aucun service payant : PostgreSQL local et outils du dépôt uniquement.
- Code et interface en anglais ; rapport en français.
- `apps/api/src/server.ts` inchangé : **0 ligne de diff** (limite : 10).
