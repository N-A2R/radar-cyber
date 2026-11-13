# Dossier de reprise — comment reprendre le radar le premier jour

> Procédure écrite du chantier 20. Le **document généré** (avec les chiffres du jour) est `bench/results/dossier-YYYY-MM-DD.md` — ce fichier-ci explique comment le produire et quoi faire avec.

## Le juge unique

```bash
bash scripts/verify-all.sh
# ou
pnpm -w run verify
```

`verify-all.sh` enchaîne : diagnostic du socle → contrat (tests purs, sans base) → typecheck api+web → tests api → tests de rendu (render, dom, sources, inspecteur, fil, corroboration, hors ligne) → build web → healthcheck local (API + web, avec démarrage temporaire si besoin). C'est le seul juge de « ça marche ». Tout le reste est informatif.

## Les cinq gestes du premier jour

Dans l'ordre où un successeur les utilisera :

1. **`bash scripts/verify-all.sh`** — le juge. S'il est vert, on peut toucher au code. Sinon, lire le log : il dit quelle étape a cassé et pourquoi.

2. **`tsx scripts/mesure-couverture.mts`** — où en est la couverture régionale, par département et par secteur. C'est la mesure publiable du programme (`docs/couverture.md`).

3. **`tsx scripts/diagnostic-sources.mts`** — quelles sources sont muettes, et pourquoi (motif de rejet dominant). `null` ≠ 0 : une source qui n'a pas encore tourné n'est pas une source en panne (`docs/sources-diagnostic.md`).

4. **`tsx scripts/replay-journal.mts`** — est-ce que la projection est d'accord avec le journal ? Le journal est append-only par trigger : même un `DELETE` de test échoue. Ce script dit où ça diverge, pas juste « ça diverge ».

5. **`tsx scripts/mesure-anticipation.mts`** — ce qui précédait les faits. Sur une base vide, il le dit (`docs/anticipation.md`). Sous 10 faits, les pourcentages sont marqués indicatifs dans le code, pas dans une note.

## Générer le dossier de reprise (rapport hebdo transmettable)

```bash
# Génère bench/results/dossier-YYYY-MM-DD.md à partir de l'état réel de la base
DATABASE_URL=postgres://radar:radar@localhost:5432/radar tsx scripts/dossier-reprise.mts

# Vérifie la cohérence sans écrire (pour CI)
DATABASE_URL=postgres://radar:radar@localhost:5432/radar tsx scripts/dossier-reprise.mts --check

# JSON structuré en plus du markdown (pour automatiser un rapport)
DATABASE_URL=postgres://radar:radar@localhost:5432/radar tsx scripts/dossier-reprise.mts --json

# Écrire à un autre endroit
tsx scripts/dossier-reprise.mts --out /tmp/dossier.md
```

Chaque chiffre vient d'une requête (`apps/api/src/analyse/dossier-reprise.ts` + `scripts/dossier-reprise.mts`) ; ce qui n'est pas mesuré est écrit « non mesuré ». Le document généré contient cinq sections :

- **Ce que contient le système aujourd'hui** — organisations, sources actives/muettes, événements, journal, archives, migrations.
- **Ce que le système ne sait pas faire** — pas de déduplication en base, unicité ≠ fiabilité, anticipation = corrélation pas causalité, pas de navigateur.
- **Les règles qui ne se négocient pas** — zéro euro, rien n'est réécrit pour faire joli, non mesuré ≠ 0, date de collecte ≠ date d'incident, réserve sous 10 faits.
- **Les cinq gestes du premier jour** — les commandes ci-dessus.
- **Les pièges déjà payés** — `fetch failed` ≠ source cassée, tri sur `null`, `Math.floor(n/2)` et `Math.max()` sur vide, `&#x27;`, journal append-only.

## Reprise après arrêt

1. Restaurer PostgreSQL (`tsx db/dev-pg.mts` en local, ou pointer `DATABASE_URL`).
2. `tsx scripts/bootstrap.mts --check` — dit ce qui manque (schéma, migrations, sources, référentiel).
3. `tsx scripts/bootstrap.mts` — applique ce qui manque, idempotent (rejeu sûr).
4. `bash scripts/verify-all.sh` — doit être vert avant toute modification.

## Ce qui survit à une panne

- Le référentiel (`org` + `org_alias`) est versionné et rechargeable (`scripts/load-referentiel-na.mts`).
- Le journal (`journal`) est append-only : on peut rejouer (`scripts/replay-journal.mts`) même si les projections sont perdues.
- L'archive longue (`event_archive`) conserve 12 mois alors que `event` est purgé à 90 jours (migration 028).
- Aucune dépendance payante dans le chemin d'exécution — le radar tourne sans Exa, sans API gouv, sans clé.

## Fichiers de référence

- `apps/api/src/analyse/dossier-reprise.ts` — pure, testée (`apps/api/test/dossier-reprise.test.ts`, 8 tests).
- `scripts/dossier-reprise.mts` — collecte l'`EtatSysteme` depuis la base, rend le markdown.
- `bench/results/dossier-2026-11-13.md` — exemple généré le 2026-11-13 (34330 orgs, 265 sources, 27 migrations).
