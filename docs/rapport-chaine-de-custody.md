# Chaîne de custody — traçabilité complète en Nouvelle-Aquitaine

**Résultat mesuré : 112/112 événements Nouvelle-Aquitaine ont une chaîne complète (100 %).**
Avant le chantier : **0/112 (0 %)**. Mesure du 22 novembre 2026 sur l'état réel de la base :
**1 673 220 organisations, 463 sources, 27 899 événements** (les chiffres plus anciens de
1 673 151 organisations / 312 sources sont périmés).

## Définition vérifiable

Un événement régional a une chaîne complète quand **toutes** les conditions sont vraies :

1. il porte un `source_id` et une `source_url` ;
2. il porte une date d'observation (`observed_at`) ;
3. le journal append-only contient pour son `dedup_key` un fait d'admission
   (`event.admitted` ou `custody.seen`) avec un **acteur** non vide, une **horloge
   d'enregistrement** (`recorded_at`) et au moins une **preuve** (`sourceId`,
   `sourceUrl`, `family`, `department`…) ;
4. l'événement est bien `regional = true` — un événement hors région ne peut pas
   être compté comme trace par ce radar.

La règle est impliquée une seule fois, dans `apps/api/src/custody/chain.ts` :
le script de mesure, l'API et le backfill l'utilisent. Aucun chiffre ne peut
donc découler d'une définition différente de celle affichée à l'écran.

## État de départ

| Contrôle | Avant | Après |
| --- | ---: | ---: |
| Événements NA avec source et date d'observation | 112/112 | 112/112 |
| Événements NA avec un fait d'admission tracé | **0/112** | **112/112** |
| Fait d'admission sans acteur ni horloge | 0 | 0 |
| Événements NA sans aucun fait de journal | 17 | 0 |
| Taux de chaîne complète | **0 %** | **100 %** |

Les 95 événements déjà journalisés ne l'étaient qu'au stade du rattachement
(`event.rattachement`, `match.decided`) : on savait qui avait décidé d'un lien,
pas qui avait admis l'événement ni depuis quelle source. Les 17 autres
(déclarations officielles et revendications `na-gap`) n'avaient aucune trace.

## Livraison

- `apps/api/src/custody/chain.ts` — règle pure, anglaise, sans base ni horloge ;
  seules des clés de preuve autorisées sont exposées, jamais le texte de
  l'événement.
- `scripts/backfill-custody.mts` — réparation idempotente, `--dry-run` par défaut,
  `--apply` pour écrire, `--subject=` pour cibler un événement. A copié 112 faits
  d'admission (`backfill:custody@1`) avec `sourceId`, `sourceUrl`, `observedAt`,
  `collectedAt`, `admissionRule`, `regionalMotif`, `family`, `reconstructed`.
  Un second `--apply` écrivit **0** ligne.
- `apps/api/src/communiques/store.ts` — les nouvelles déclarations officielles
  écrivent leur fait d'admission **dans la même insertion**, avec l'acteur
  `collecteur:na-official-statements` ; le titre n'est jamais journalisé.
- `apps/api/src/routes/custody.ts` — `GET /api/events` non, mais
  `GET /api/custody?subject=<dedup_key>` : lecture publique, en lecture seule,
  qui ne renvoie que métadonnées de source, acteurs, horloges et clés de preuve.
  Enregistré dans le registre unique et dans la matrice `POLITIQUE_ACCES`
  (niveau `public`). **`apps/api/src/server.ts` : 0 ligne modifiée.**
- `apps/web/src/components/CustodyPanel.tsx` — panneau « Custody chain » dans
  l'inspecteur d'événement, libellés en anglais : source, observation, acteur,
  horloge d'enregistrement, preuve, et motif de chaîne incomplète.
- `apps/api/test/custody.test.ts` — un test par comportement : chaîne complète,
  hors région, trois manques distincts, idempotence du backfill, écriture à
  l'insertion, endpoint sans donnée personnelle, 404/400.
- `apps/web/test/custody-verif.tsx` — contrôle de rendu statique, 8 assertions.

## Commandes reproductibles

```sh
# Mesure avant réparation (instantané archivé)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-custody.mts \
  --json=bench/results/custody-na-before.json

# Réparation, puis rejeu (0 écriture attendue)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/backfill-custody.mts --apply \
  --json=bench/results/custody-backfill.json

# Mesure livrée : 112/112 (100 %)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-custody.mts \
  --json=bench/results/custody-na-after.json

# Tests
cd apps/api && DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  ./node_modules/.bin/tsx test/run.ts test/custody.test.ts \
  test/communiques-store.test.ts test/api-publique.test.ts \
  test/securite-couverture.test.ts
cd apps/web && ./node_modules/.bin/vite build --ssr test/custody-verif.tsx \
  --outDir .smoke-out --logLevel warn && node .smoke-out/custody-verif.js
```

Résultats archivés : `bench/results/custody-na-before.json` (0/112),
`bench/results/custody-backfill.json` (112 faits), `bench/results/custody-na-after.json`
(112/112). Typecheck API et web : vert. Tests ciblés : **20/20 verts**, rendu du
panneau : **8/8 verts**.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : la mesure filtre `event.regional` ; un
  événement hors région est un manque explicite (`outside-nouvelle-aquitaine`).
- **Sources grises autorisées** : aucune règle de licence n'a été ajoutée ; le
  backfill copie le `source_id` tel quel.
- **Aucune donnée personnelle de victime** : ni titre, résumé, organisation
  citée ni identifiant de victime ne sont journalisés ou renvoyés par l'API ;
  les clés de payload du backfill ont été vérifiées en base (8 clés, toutes
  techniques).
- **Aucun service payant** : uniquement PostgreSQL local et les dépendances
  déjà versionnées.
- **Code et interface en anglais** ; le présent rapport est en français.
- **Diff de `server.ts` ≤ 10 lignes** : 0 ligne.
- **Aucune commande de plus de 60 s** : toutes les commandes ci-dessus ont été
  exécutées avec une borne de 50 à 58 s.

## Limite connue, hors périmètre du chiffre

`pnpm verify:journal` signale 3 divergences préexistantes entre `event.org_id` et
le dernier fait de rattachement (`feed:Fm-n-rBeminKOuSfkQwZJUJG`,
`feed:fY37EzWaupRwbxGy9G9bwBkq`, `feed:fV0I8z7ZzShB4iQ-S0z3Kp2B`). Elles
concernent des rattachements, pas les faits d'admission ajoutés ici, et
n'affectent pas le comptage 112/112. Les événements `na-gap` sont produits par
une voie d'ingestion extérieure à ce dépôt : ils sont couverts par le backfill,
mais leur voie d'écriture devra journaliser elle-même ses admissions pour que
les prochaines occurrences n'aient pas besoin de réparation.
